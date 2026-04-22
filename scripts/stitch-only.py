"""Re-run the graph-stitcher on an existing ledger's decisions.

Useful when the original ingestion's stitcher pass hit a JSON truncation or
the edge extraction needs to be redone with a different prompt. Reads all
decisions from the DuckDB file, runs graph-stitcher, writes edges back.
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "backend"))

from anthropic import AsyncAnthropic  # noqa: E402

from app.agents.cost import CostTracker  # noqa: E402
from app.agents.runner import run_stitcher  # noqa: E402
from app.config import resolve_secret  # noqa: E402
from app.ledger.models import DecisionEdge, DecisionEdgeKind  # noqa: E402
from app.ledger.store import LedgerStore  # noqa: E402


async def main() -> int:
    if len(sys.argv) < 2:
        print("usage: stitch-only.py <db_path>", file=sys.stderr)
        return 2

    db_path = Path(sys.argv[1]).expanduser().resolve()
    if not db_path.exists():
        print(f"ERROR: ledger not found: {db_path}", file=sys.stderr)
        return 2

    api_key = resolve_secret("ANTHROPIC_API_KEY", repo_root=REPO_ROOT)
    if not api_key:
        print("ERROR: ANTHROPIC_API_KEY not available.", file=sys.stderr)
        return 2

    client = AsyncAnthropic(api_key=api_key)
    tracker = CostTracker()

    with LedgerStore(db_path) as store:
        rows = store.conn.execute(
            "SELECT id, pr_number, title, category, summary FROM decisions ORDER BY pr_number"
        ).fetchall()
        new_decisions = [
            {
                "pr_number": row[1],
                "title": row[2],
                "category": row[3],
                "summary": (row[4] or "")[:200],
            }
            for row in rows
        ]
        id_by_pr = {row[1]: row[0] for row in rows}
        print(f"[stitch] running on {len(new_decisions)} decisions from {db_path.name}")

        edges_raw = await run_stitcher(client, new_decisions, [], tracker=tracker)
        print(f"[stitch] got {len(edges_raw)} candidate edges")

        written = 0
        for edge in edges_raw:
            from_pr = edge.get("from_pr_number") or edge.get("from_id")
            to_pr = edge.get("to_pr_number") or edge.get("to_id")
            kind_raw = edge.get("kind", "related_to")
            reason = edge.get("reason") or edge.get("rationale")
            try:
                kind = DecisionEdgeKind(kind_raw)
            except ValueError:
                kind = DecisionEdgeKind.RELATED_TO
            if from_pr not in id_by_pr or to_pr not in id_by_pr:
                continue
            store.upsert_edge(
                DecisionEdge(
                    from_id=id_by_pr[from_pr],
                    to_id=id_by_pr[to_pr],
                    kind=kind,
                    reason=reason,
                )
            )
            written += 1
            print(f"  {from_pr} --[{kind.value}]--> {to_pr}: {reason[:80] if reason else ''}")

        print(f"\n[stitch] wrote {written} edges")
        print(tracker.pretty())
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
