"""High-level helpers that compose the sub-agents into the ingestion pipeline.

`classify_and_extract` takes a single PR archaeology, runs the classifier, and —
only if classified as a decision — runs the rationale-extractor. Returns a
structured tuple so the orchestrator can decide whether to persist.

`compose_decision_record` assembles a `DecisionRecord` from the classifier +
extractor outputs and the source archaeology metadata.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from anthropic import AsyncAnthropic

from app.agents.cost import CostTracker
from app.agents.runner import run_classifier, run_extractor
from app.ledger.models import (
    ClassificationResult,
    DecisionCategory,
    DecisionRecord,
    DecisionStatus,
    RationaleExtraction,
)


@dataclass
class PipelineResult:
    pr_number: int
    classification: ClassificationResult
    extraction: RationaleExtraction | None
    record: DecisionRecord | None
    error: str | None = None


DEFAULT_CLASSIFIER_THRESHOLD = 0.55


async def classify_and_extract(
    client: AsyncAnthropic,
    pr: dict[str, Any],
    *,
    tracker: CostTracker,
    threshold: float = DEFAULT_CLASSIFIER_THRESHOLD,
) -> PipelineResult:
    classification = await run_classifier(client, pr, tracker=tracker)
    pr_number = int(pr["pr_number"])

    if not classification.is_decision or classification.confidence < threshold:
        return PipelineResult(
            pr_number=pr_number,
            classification=classification,
            extraction=None,
            record=None,
        )

    try:
        extraction = await run_extractor(client, pr, tracker=tracker)
    except ValueError as exc:
        return PipelineResult(
            pr_number=pr_number,
            classification=classification,
            extraction=None,
            record=None,
            error=f"extractor failed: {exc}",
        )

    record = compose_decision_record(pr, classification, extraction)
    return PipelineResult(
        pr_number=pr_number,
        classification=classification,
        extraction=extraction,
        record=record,
    )


def compose_decision_record(
    pr: dict[str, Any],
    classification: ClassificationResult,
    extraction: RationaleExtraction,
) -> DecisionRecord:
    title = extraction.title or classification.one_line_title or pr.get("title", "(untitled)")

    summary_sources = []
    if extraction.context:
        summary_sources.append(extraction.context[0].claim)
    if extraction.decision:
        summary_sources.append(extraction.decision[0].claim)
    if not summary_sources and classification.key_rationale_snippets:
        summary_sources.extend(
            s.quote for s in classification.key_rationale_snippets[:2]
        )
    summary = " ".join(summary_sources).strip() or title

    return DecisionRecord(
        repo=pr["repo"],
        pr_number=int(pr["pr_number"]),
        title=title,
        summary=summary,
        category=extraction.category or DecisionCategory.OTHER,
        decided_at=extraction.decided_at,
        decided_by=extraction.deciders,
        status=DecisionStatus.ACTIVE,
        commit_shas=[c["sha"] for c in pr.get("commits", []) if c.get("sha")],
        confidence=extraction.confidence,
        context_citations=extraction.context,
        decision_citations=extraction.decision,
        forces=extraction.forces,
        consequences=extraction.consequences,
        alternatives=extraction.alternatives,
        pr_url=pr.get("url", ""),
    )
