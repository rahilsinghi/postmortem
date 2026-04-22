"""CLI driver for the direct ingestion orchestrator.

Usage:
    # Calibration pass (30 PRs; lightweight, cheap)
    uv run --project backend python scripts/ingest.py pmndrs/zustand \\
        --limit 30 --db .cache/ledger-calibration.duckdb

    # Full run on zustand (~100 recent merged PRs)
    uv run --project backend python scripts/ingest.py pmndrs/zustand \\
        --limit 100 --db .cache/ledger.duckdb --notes "day-2 full zustand"
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.config import resolve_secret  # noqa: E402
from app.ingest import ingest_repo  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("repo")
    parser.add_argument("--limit", type=int, default=30)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--threshold", type=float, default=0.55)
    parser.add_argument(
        "--min-discussion",
        type=int,
        default=0,
        help="Skip PRs whose (comments + review_threads) sum is below N",
    )
    parser.add_argument("--db", default=".cache/ledger.duckdb")
    parser.add_argument("--notes", default="")
    args = parser.parse_args()

    anthropic_key = resolve_secret("ANTHROPIC_API_KEY", repo_root=REPO_ROOT)
    github_token = resolve_secret("GITHUB_TOKEN", repo_root=REPO_ROOT)
    if not anthropic_key or not github_token:
        print("ERROR: ANTHROPIC_API_KEY and GITHUB_TOKEN must be set.", file=sys.stderr)
        return 2

    db_path = (REPO_ROOT / args.db).resolve() if not Path(args.db).is_absolute() else Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    cache_dir = REPO_ROOT / ".cache" / "pr-archaeology"

    summary = await ingest_repo(
        args.repo,
        db_path=db_path,
        pr_limit=args.limit,
        concurrency=args.concurrency,
        classifier_threshold=args.threshold,
        min_discussion=args.min_discussion,
        anthropic_api_key=anthropic_key,
        github_token=github_token,
        cache_dir=cache_dir,
        notes=args.notes,
    )

    print("\n" + "=" * 70)
    print(f"INGESTION SUMMARY  {args.repo}  (limit={args.limit})")
    print("=" * 70)
    print(f"  PRs seen:             {summary.prs_seen}")
    print(f"  classifier accepted:  {summary.classifier_accepted}")
    print(f"  classifier rejected:  {summary.classifier_rejected}")
    print(f"  extraction errors:    {summary.extraction_errors}")
    print(f"  decisions written:    {summary.decisions_written}")
    print(f"  edges written:        {summary.edges_written}")
    print(f"  total cost:           ${summary.cost_usd:.4f}")
    print(f"  input tokens:         {summary.input_tokens:,}")
    print(f"  output tokens:        {summary.output_tokens:,}")
    print(f"  ledger:               {db_path}")
    print("\n" + summary.per_agent_breakdown)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
