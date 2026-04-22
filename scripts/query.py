"""One-shot CLI wrapper around the streaming query engine.

Prints SSE events as the stream produces them; use this to smoke-test the
query engine end-to-end before the frontend exists.

Usage:
    uv run --project backend python scripts/query.py pmndrs/zustand \\
        "Why does zustand's persist middleware use a hydrationVersion counter?" \\
        --db .cache/ledger.duckdb
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from anthropic import AsyncAnthropic  # noqa: E402

from app.config import resolve_secret  # noqa: E402
from app.ledger.load import load_ledger  # noqa: E402
from app.query.engine import QueryOptions, stream_query  # noqa: E402


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("repo", help="owner/name — must exist in the ledger DB")
    parser.add_argument("question")
    parser.add_argument("--db", default=".cache/ledger.duckdb")
    parser.add_argument("--effort", default="high", choices=["high", "xhigh"])
    parser.add_argument("--no-self-check", action="store_true")
    args = parser.parse_args()

    db_path = (REPO_ROOT / args.db) if not Path(args.db).is_absolute() else Path(args.db)
    if not db_path.exists():
        print(f"ERROR: ledger not found: {db_path}", file=sys.stderr)
        return 2

    api_key = resolve_secret("ANTHROPIC_API_KEY", repo_root=REPO_ROOT)
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not set.", file=sys.stderr)
        return 2

    snapshot = load_ledger(db_path, args.repo)
    print(
        f"[query] loaded {snapshot.decision_count} decisions "
        f"({snapshot.citation_count} citations, {snapshot.alternative_count} alts, "
        f"{len(snapshot.edges)} edges) for {args.repo}"
    )
    print(f"[query] question: {args.question}\n")

    client = AsyncAnthropic(api_key=api_key)
    options = QueryOptions(effort=args.effort, self_check=not args.no_self_check)

    # Render each SSE event in a human-readable shape.
    async for event in stream_query(client, snapshot, args.question, options=options):
        for line in event.rstrip("\n").split("\n"):
            if line.startswith("event: "):
                kind = line[len("event: "):]
            elif line.startswith("data: "):
                payload = line[len("data: "):]
                if kind == "delta":
                    # Streaming answer — inline, no newlines.
                    try:
                        import json as _json

                        sys.stdout.write(_json.loads(payload)["text"])
                        sys.stdout.flush()
                    except (ValueError, KeyError):
                        sys.stdout.write(payload)
                elif kind in {"phase", "stats", "self_check", "usage", "error"}:
                    sys.stdout.write(f"\n[{kind}] {payload}\n")
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
