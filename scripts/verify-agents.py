"""Run the 3 sub-agents against the 5 hand-picked zustand verification PRs.

Usage (from repo root, after fetch-pr.py has cached the 5 PRs):
    uv run --project backend python scripts/verify-agents.py

Writes results to .cache/agent-verification/ as JSON and a DuckDB ledger at
.cache/agent-verification/ledger.duckdb. Prints a compact per-PR summary plus a
cost breakdown.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent

sys.path.insert(0, str(REPO_ROOT / "backend"))

from anthropic import AsyncAnthropic  # noqa: E402

from app.agents.cost import CostTracker  # noqa: E402
from app.agents.pipeline import classify_and_extract  # noqa: E402
from app.agents.runner import run_stitcher  # noqa: E402
from app.config import resolve_secret  # noqa: E402
from app.config_hero import ZUSTAND  # noqa: E402
from app.ledger.store import LedgerStore  # noqa: E402

CACHE_DIR = REPO_ROOT / ".cache" / "pr-archaeology"
OUT_DIR = REPO_ROOT / ".cache" / "agent-verification"


def _load_pr(repo: str, pr_number: int) -> dict[str, Any]:
    owner, name = repo.split("/")
    path = CACHE_DIR / f"{owner}-{name}" / f"pr-{pr_number}.json"
    if not path.exists():
        raise FileNotFoundError(
            f"archaeology not cached: {path}. Run scripts/fetch-pr.py {repo} {pr_number} first."
        )
    with path.open() as fh:
        return dict(json.load(fh))


async def main() -> int:
    api_key = resolve_secret("ANTHROPIC_API_KEY", repo_root=REPO_ROOT)
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not found in env or .env.local.", file=sys.stderr)
        return 2

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ledger_path = OUT_DIR / "ledger.duckdb"
    if ledger_path.exists():
        ledger_path.unlink()  # fresh run each time

    tracker = CostTracker()
    client = AsyncAnthropic(api_key=api_key)

    new_decisions: list[dict[str, Any]] = []

    with LedgerStore(ledger_path) as store:
        run_stats = store.start_ingestion_run(ZUSTAND.repo)

        for pr_number in ZUSTAND.verification_prs:
            pr = _load_pr(ZUSTAND.repo, pr_number)
            print(f"\n[verify] {ZUSTAND.repo}#{pr_number}  {pr['title']}")

            result = await classify_and_extract(client, pr, tracker=tracker)
            run_stats.prs_seen += 1

            cls = result.classification
            print(
                f"  classifier: is_decision={cls.is_decision} "
                f"confidence={cls.confidence:.2f}  "
                f"type={cls.decision_type}  "
                f"title={cls.one_line_title!r}"
            )
            if not cls.is_decision or cls.confidence < 0.55:
                print("  (below threshold — skipping extraction)")
                continue

            if result.error:
                print(f"  ❌ extractor error: {result.error}")
                continue

            assert result.extraction is not None and result.record is not None
            ext = result.extraction
            print(
                f"  extractor: context={len(ext.context)} decision={len(ext.decision)} "
                f"forces={len(ext.forces)} consequences={len(ext.consequences)} "
                f"alternatives={len(ext.alternatives)}  confidence={ext.confidence:.2f}"
            )
            store.upsert_decision(result.record)
            run_stats.decisions_written += 1
            new_decisions.append(
                {
                    "pr_number": result.record.pr_number,
                    "title": result.record.title,
                    "category": result.record.category.value,
                    "summary": result.record.summary[:200],
                }
            )
            (OUT_DIR / f"extraction-{pr_number}.json").write_text(
                ext.model_dump_json(indent=2)
            )

        if len(new_decisions) >= 2:
            print(f"\n[stitch] running graph-stitcher on {len(new_decisions)} decisions...")
            edges = await run_stitcher(client, new_decisions, [], tracker=tracker)
            print(f"[stitch] returned {len(edges)} edge(s):")
            for e in edges:
                print(f"  {e}")
            (OUT_DIR / "edges.json").write_text(json.dumps(edges, indent=2))

        totals = tracker.totals()
        run_stats.input_tokens = totals.input_tokens
        run_stats.output_tokens = totals.output_tokens
        run_stats.cost_usd = totals.cost_usd
        store.finalize_ingestion_run(run_stats, notes="5-PR verification")

    print("\n[costs]")
    print(tracker.pretty())
    print(f"\n[ledger] wrote {len(new_decisions)} decisions to {ledger_path}")
    print(f"[output] details in {OUT_DIR}/")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
