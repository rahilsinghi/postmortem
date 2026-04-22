"""Load a ledger from DuckDB into compact, citation-preserving JSON/Pydantic.

The query engine feeds the entire ledger into Opus 4.7's 1M context. For ~50
decisions with ~500 citations that's roughly 60-120K tokens — well inside the
window with headroom for reasoning.

Kept deliberately small: loading is synchronous, no embeddings, no pagination.
Embeddings and semantic retrieval are a Day 4+ optimization.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.ledger.schema import connect


@dataclass
class LedgerSnapshot:
    repo: str
    decisions: list[dict[str, Any]]
    edges: list[dict[str, Any]]

    @property
    def decision_count(self) -> int:
        return len(self.decisions)

    @property
    def citation_count(self) -> int:
        return sum(len(d.get("citations", [])) for d in self.decisions)

    @property
    def alternative_count(self) -> int:
        return sum(len(d.get("alternatives", [])) for d in self.decisions)


def list_repos(db_path: str | Path) -> list[dict[str, Any]]:
    conn = connect(str(db_path))
    try:
        rows = conn.execute("""
            SELECT repo,
                   COUNT(*) AS decisions,
                   COUNT(DISTINCT category) AS categories,
                   MIN(decided_at) AS earliest,
                   MAX(decided_at) AS latest
            FROM decisions
            GROUP BY repo
            ORDER BY decisions DESC
            """).fetchall()
        return [
            {
                "repo": row[0],
                "decisions": row[1],
                "categories": row[2],
                "earliest": row[3].isoformat() if row[3] else None,
                "latest": row[4].isoformat() if row[4] else None,
            }
            for row in rows
        ]
    finally:
        conn.close()


def load_ledger(db_path: str | Path, repo: str) -> LedgerSnapshot:
    conn = connect(str(db_path))
    try:
        decision_rows = conn.execute(
            """
            SELECT id, pr_number, title, summary, category, decided_at, decided_by,
                   status, commit_shas, confidence, pr_url
            FROM decisions
            WHERE repo = ?
            ORDER BY pr_number
            """,
            [repo],
        ).fetchall()

        decisions: list[dict[str, Any]] = []
        id_by_decision: dict[str, dict[str, Any]] = {}
        for row in decision_rows:
            decision = {
                "id": str(row[0]),
                "pr_number": row[1],
                "title": row[2],
                "summary": row[3],
                "category": row[4],
                "decided_at": row[5].isoformat() if row[5] else None,
                "decided_by": list(row[6] or []),
                "status": row[7],
                "commit_shas": list(row[8] or []),
                "confidence": row[9],
                "pr_url": row[10],
                "citations": {"context": [], "decision": [], "forces": [], "consequences": []},
                "alternatives": [],
            }
            decisions.append(decision)
            id_by_decision[decision["id"]] = decision

        citation_rows = conn.execute(
            """
            SELECT c.decision_id, c.kind, c.claim, c.citation_quote,
                   c.citation_source_type, c.citation_source_id,
                   c.citation_author, c.citation_timestamp, c.citation_url
            FROM citations c
            INNER JOIN decisions d ON d.id = c.decision_id
            WHERE d.repo = ?
            ORDER BY c.decision_id, c.kind
            """,
            [repo],
        ).fetchall()

        for row in citation_rows:
            decision_opt: dict[str, Any] | None = id_by_decision.get(str(row[0]))
            if decision_opt is None:
                continue
            decision = decision_opt
            kind = row[1] if row[1] in decision["citations"] else "context"
            decision["citations"][kind].append(
                {
                    "claim": row[2],
                    "quote": row[3],
                    "source_type": row[4],
                    "source_id": row[5],
                    "author": row[6],
                    "timestamp": row[7].isoformat() if row[7] else None,
                    "url": row[8],
                }
            )

        alt_rows = conn.execute(
            """
            SELECT a.decision_id, a.name, a.rejection_reason, a.rejection_reason_quoted,
                   a.citation_source_type, a.citation_source_id,
                   a.citation_author, a.citation_url, a.confidence
            FROM alternatives a
            INNER JOIN decisions d ON d.id = a.decision_id
            WHERE d.repo = ?
            ORDER BY a.decision_id
            """,
            [repo],
        ).fetchall()

        for row in alt_rows:
            alt_decision_opt: dict[str, Any] | None = id_by_decision.get(str(row[0]))
            if alt_decision_opt is None:
                continue
            decision = alt_decision_opt
            decision["alternatives"].append(
                {
                    "name": row[1],
                    "rejection_reason": row[2],
                    "rejection_reason_quoted": row[3],
                    "source_type": row[4],
                    "source_id": row[5],
                    "author": row[6],
                    "url": row[7],
                    "confidence": row[8],
                }
            )

        edge_rows = conn.execute(
            """
            SELECT e.from_id, e.to_id, e.kind, e.reason,
                   df.pr_number, dt.pr_number,
                   df.title, dt.title,
                   df.category, dt.category
            FROM decision_edges e
            INNER JOIN decisions df ON df.id = e.from_id
            INNER JOIN decisions dt ON dt.id = e.to_id
            WHERE df.repo = ? AND dt.repo = ?
            ORDER BY df.pr_number
            """,
            [repo, repo],
        ).fetchall()

        edges = [
            {
                "from_id": str(row[0]),
                "to_id": str(row[1]),
                "kind": row[2],
                "reason": row[3],
                "from_pr": row[4],
                "to_pr": row[5],
                "from_title": row[6],
                "to_title": row[7],
                "from_category": row[8],
                "to_category": row[9],
            }
            for row in edge_rows
        ]

        return LedgerSnapshot(repo=repo, decisions=decisions, edges=edges)
    finally:
        conn.close()
