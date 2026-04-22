"""Direct orchestrator for the ingestion pipeline.

`ingest_repo` — fetch recent merged PRs via pr-archaeology, run the classifier,
run the extractor on classifier-confirmed decisions, persist each result to the
DuckDB ledger, and run the graph-stitcher at the end. Produces an
`IngestionSummary` with token usage and cost.

This is the §9.5 pattern from docs/SPEC.md. A Managed Agents session wrapper
(§11) is an orthogonal concern — it runs this orchestrator inside a hosted
agent session so the work is resumable and observable.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from anthropic import AsyncAnthropic

from app.agents.cost import CostTracker
from app.agents.pipeline import PipelineResult, classify_and_extract
from app.agents.runner import run_stitcher
from app.github.archaeology import fetch_pr_archaeology, list_recent_merged_prs
from app.github.client import GitHubClient
from app.ledger.models import DecisionEdge, DecisionEdgeKind
from app.ledger.store import LedgerStore

DEFAULT_PR_LIMIT = 30
DEFAULT_EXTRACTOR_CONCURRENCY = 4
DEFAULT_CLASSIFIER_THRESHOLD = 0.55


@dataclass
class IngestionSummary:
    repo: str
    prs_seen: int = 0
    classifier_accepted: int = 0
    classifier_rejected: int = 0
    extraction_errors: int = 0
    decisions_written: int = 0
    edges_written: int = 0
    cost_usd: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    per_agent_breakdown: str = ""
    notes: str = ""
    classifier_decisions: list[dict[str, Any]] = field(default_factory=list)


async def _process_one_pr(
    pr_record: dict[str, Any],
    github: GitHubClient,
    anthropic_client: AsyncAnthropic,
    tracker: CostTracker,
    repo: str,
    semaphore: asyncio.Semaphore,
    classifier_threshold: float,
) -> PipelineResult:
    async with semaphore:
        archaeology = await fetch_pr_archaeology(github, repo, pr_record["number"])
        return await classify_and_extract(
            anthropic_client, archaeology, tracker=tracker, threshold=classifier_threshold
        )


EventCallback = Callable[[dict[str, Any]], Awaitable[None]]


async def ingest_repo(
    repo: str,
    *,
    db_path: Path,
    pr_limit: int = DEFAULT_PR_LIMIT,
    concurrency: int = DEFAULT_EXTRACTOR_CONCURRENCY,
    classifier_threshold: float = DEFAULT_CLASSIFIER_THRESHOLD,
    min_discussion: int = 0,
    anthropic_api_key: str,
    github_token: str,
    cache_dir: Path | None = None,
    notes: str = "",
    on_event: EventCallback | None = None,
) -> IngestionSummary:
    summary = IngestionSummary(repo=repo, notes=notes)
    tracker = CostTracker()

    async def emit(event: dict[str, Any]) -> None:
        if on_event is not None:
            await on_event(event)

    anthropic_client = AsyncAnthropic(api_key=anthropic_api_key)
    resolved_cache_dir = cache_dir or Path(".cache/pr-archaeology")

    await emit(
        {
            "type": "start",
            "repo": repo,
            "pr_limit": pr_limit,
            "min_discussion": min_discussion,
            "concurrency": concurrency,
            "classifier_threshold": classifier_threshold,
        }
    )

    async with GitHubClient(token=github_token, cache_dir=resolved_cache_dir) as github:
        print(f"[ingest] listing {pr_limit} recent merged PRs for {repo}...")
        await emit({"type": "listing", "pr_limit": pr_limit})
        pr_index = await list_recent_merged_prs(github, repo, limit=pr_limit)
        if min_discussion > 0:
            before = len(pr_index)
            pr_index = [
                pr
                for pr in pr_index
                if (pr.get("comments", 0) + pr.get("review_threads", 0)) >= min_discussion
            ]
            print(
                f"[ingest] pre-filter min_discussion={min_discussion}: "
                f"{before} -> {len(pr_index)} PRs (skipping low-discussion maintenance PRs)"
            )
            await emit(
                {
                    "type": "filtered",
                    "before": before,
                    "after": len(pr_index),
                    "min_discussion": min_discussion,
                }
            )
        summary.prs_seen = len(pr_index)
        print(f"[ingest] got {len(pr_index)} PRs; rl remaining={github.last_rate_limit}")
        await emit({"type": "listed", "count": len(pr_index)})

        semaphore = asyncio.Semaphore(concurrency)
        tasks = [
            _process_one_pr(
                pr, github, anthropic_client, tracker, repo, semaphore, classifier_threshold
            )
            for pr in pr_index
        ]

        results: list[PipelineResult] = []
        for idx, coro in enumerate(asyncio.as_completed(tasks), start=1):
            try:
                result = await coro
            except Exception as exc:
                print(f"[ingest] PR fetch/classify error: {exc!r}")
                summary.extraction_errors += 1
                await emit({"type": "pr_error", "error": repr(exc)})
                continue

            results.append(result)
            cls = result.classification
            accepted = cls.is_decision and cls.confidence >= classifier_threshold
            if accepted:
                summary.classifier_accepted += 1
            else:
                summary.classifier_rejected += 1
            summary.classifier_decisions.append(
                {
                    "pr_number": result.pr_number,
                    "is_decision": cls.is_decision,
                    "confidence": cls.confidence,
                    "decision_type": cls.decision_type,
                    "one_line_title": cls.one_line_title,
                }
            )
            await emit(
                {
                    "type": "pr_classified",
                    "idx": idx,
                    "total": len(tasks),
                    "pr_number": result.pr_number,
                    "accepted": accepted,
                    "is_decision": cls.is_decision,
                    "confidence": cls.confidence,
                    "decision_type": cls.decision_type,
                    "title": cls.one_line_title,
                    "cost_so_far": tracker.totals().cost_usd,
                    "accepted_so_far": summary.classifier_accepted,
                    "rejected_so_far": summary.classifier_rejected,
                }
            )
            if accepted and result.record is not None:
                await emit(
                    {
                        "type": "pr_extracted",
                        "pr_number": result.pr_number,
                        "title": result.record.title,
                        "category": result.record.category.value,
                        "citations": (
                            len(result.record.context_citations)
                            + len(result.record.decision_citations)
                            + len(result.record.forces)
                            + len(result.record.consequences)
                        ),
                        "alternatives": len(result.record.alternatives),
                    }
                )
            if idx % 5 == 0 or idx == len(tasks):
                totals = tracker.totals()
                print(
                    f"[ingest] {idx}/{len(tasks)} processed  "
                    f"accepted={summary.classifier_accepted} rejected={summary.classifier_rejected}  "
                    f"cost_so_far=${totals.cost_usd:.3f}"
                )

    await emit({"type": "persisting"})
    with LedgerStore(db_path) as store:
        run_stats = store.start_ingestion_run(repo)
        run_stats.prs_seen = summary.prs_seen

        new_decision_summaries: list[dict[str, Any]] = []
        pr_to_decision_id: dict[int, Any] = {}

        for result in results:
            if result.error:
                summary.extraction_errors += 1
                continue
            if result.record is None:
                continue
            decision_id = store.upsert_decision(result.record)
            pr_to_decision_id[result.record.pr_number] = decision_id
            summary.decisions_written += 1
            new_decision_summaries.append(
                {
                    "pr_number": result.record.pr_number,
                    "title": result.record.title,
                    "category": result.record.category.value,
                    "summary": result.record.summary[:200],
                }
            )

        if len(new_decision_summaries) >= 2:
            await emit({"type": "stitching", "decisions": len(new_decision_summaries)})
            print(f"[ingest] stitching edges across {len(new_decision_summaries)} decisions...")
            try:
                edges = await run_stitcher(
                    anthropic_client, new_decision_summaries, [], tracker=tracker
                )
            except (ValueError, Exception) as exc:
                print(f"[ingest] stitcher error (non-fatal): {exc!r}")
                await emit({"type": "stitcher_error", "message": repr(exc)})
                edges = []
            for edge in edges:
                from_pr = edge.get("from_pr_number")
                to_pr = edge.get("to_pr_number")
                kind_raw = edge.get("kind", "related_to")
                try:
                    kind = DecisionEdgeKind(kind_raw)
                except ValueError:
                    kind = DecisionEdgeKind.RELATED_TO
                if from_pr in pr_to_decision_id and to_pr in pr_to_decision_id:
                    store.upsert_edge(
                        DecisionEdge(
                            from_id=pr_to_decision_id[from_pr],
                            to_id=pr_to_decision_id[to_pr],
                            kind=kind,
                            reason=edge.get("reason"),
                        )
                    )
                    summary.edges_written += 1

        totals = tracker.totals()
        run_stats.input_tokens = totals.input_tokens
        run_stats.output_tokens = totals.output_tokens
        run_stats.cost_usd = totals.cost_usd
        run_stats.decisions_written = summary.decisions_written
        store.finalize_ingestion_run(run_stats, notes=notes)

    totals = tracker.totals()
    summary.cost_usd = totals.cost_usd
    summary.input_tokens = totals.input_tokens
    summary.output_tokens = totals.output_tokens
    summary.per_agent_breakdown = tracker.pretty()

    await emit(
        {
            "type": "done",
            "repo": repo,
            "prs_seen": summary.prs_seen,
            "classifier_accepted": summary.classifier_accepted,
            "classifier_rejected": summary.classifier_rejected,
            "decisions_written": summary.decisions_written,
            "edges_written": summary.edges_written,
            "cost_usd": summary.cost_usd,
            "input_tokens": summary.input_tokens,
            "output_tokens": summary.output_tokens,
        }
    )
    return summary
