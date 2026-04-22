from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from uuid import UUID, uuid4

import duckdb

from app.ledger.models import (
    Alternative,
    Citation,
    DecisionEdge,
    DecisionRecord,
)
from app.ledger.schema import connect


@dataclass
class IngestionRunStats:
    id: UUID
    repo: str
    started_at: datetime
    prs_seen: int = 0
    decisions_written: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0


class LedgerStore:
    """Thin wrapper around DuckDB for persisting decision-archaeology data.

    Idempotent on (repo, pr_number): re-ingesting the same PR replaces the row
    and its dependent citations / alternatives.
    """

    def __init__(self, db_path: str | Path) -> None:
        self.db_path = str(db_path)
        self.conn: duckdb.DuckDBPyConnection = connect(self.db_path)

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> LedgerStore:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def upsert_decision(self, record: DecisionRecord) -> UUID:
        existing = self.conn.execute(
            "SELECT id FROM decisions WHERE repo = ? AND pr_number = ?",
            [record.repo, record.pr_number],
        ).fetchone()

        if existing is not None:
            existing_id = existing[0]
            self.conn.execute("DELETE FROM citations WHERE decision_id = ?", [existing_id])
            self.conn.execute("DELETE FROM alternatives WHERE decision_id = ?", [existing_id])
            self.conn.execute("DELETE FROM decisions WHERE id = ?", [existing_id])
            record.id = existing_id if isinstance(existing_id, UUID) else UUID(str(existing_id))

        self.conn.execute(
            """
            INSERT INTO decisions (
                id, repo, pr_number, title, summary, category,
                decided_at, decided_by, status, superseded_by,
                commit_shas, confidence, extracted_at, pr_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                str(record.id),
                record.repo,
                record.pr_number,
                record.title,
                record.summary,
                record.category.value,
                record.decided_at,
                record.decided_by,
                record.status.value,
                str(record.superseded_by) if record.superseded_by else None,
                record.commit_shas,
                record.confidence,
                record.extracted_at,
                record.pr_url,
            ],
        )

        self._insert_citations(record.id, "context", record.context_citations)
        self._insert_citations(record.id, "decision", record.decision_citations)
        self._insert_citations(record.id, "forces", record.forces)
        self._insert_citations(record.id, "consequences", record.consequences)

        for alt in record.alternatives:
            self._insert_alternative(record.id, alt)

        return record.id

    def _insert_citations(self, decision_id: UUID, kind: str, citations: list[Citation]) -> None:
        for citation in citations:
            self.conn.execute(
                """
                INSERT INTO citations (
                    id, decision_id, kind, claim, citation_quote,
                    citation_source_type, citation_source_id,
                    citation_author, citation_timestamp, citation_url
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                [
                    str(uuid4()),
                    str(decision_id),
                    kind,
                    citation.claim,
                    citation.citation_quote,
                    citation.citation_source_type.value,
                    citation.citation_source_id,
                    citation.citation_author,
                    citation.citation_timestamp,
                    citation.citation_url,
                ],
            )

    def _insert_alternative(self, decision_id: UUID, alt: Alternative) -> None:
        self.conn.execute(
            """
            INSERT INTO alternatives (
                id, decision_id, name, rejection_reason, rejection_reason_quoted,
                citation_source_type, citation_source_id, citation_author,
                citation_url, confidence
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                str(uuid4()),
                str(decision_id),
                alt.name,
                alt.rejection_reason,
                alt.rejection_reason_quoted,
                alt.citation_source_type.value,
                alt.citation_source_id,
                alt.citation_author,
                alt.citation_url,
                alt.confidence,
            ],
        )

    def upsert_edge(self, edge: DecisionEdge) -> None:
        self.conn.execute(
            """
            INSERT INTO decision_edges (id, from_id, to_id, kind, reason)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT (from_id, to_id, kind) DO UPDATE SET reason = excluded.reason
            """,
            [
                str(uuid4()),
                str(edge.from_id),
                str(edge.to_id),
                edge.kind.value,
                edge.reason,
            ],
        )

    def count_decisions(self, repo: str | None = None) -> int:
        if repo is None:
            result = self.conn.execute("SELECT COUNT(*) FROM decisions").fetchone()
        else:
            result = self.conn.execute(
                "SELECT COUNT(*) FROM decisions WHERE repo = ?", [repo]
            ).fetchone()
        return int(result[0]) if result else 0

    def start_ingestion_run(self, repo: str) -> IngestionRunStats:
        stats = IngestionRunStats(id=uuid4(), repo=repo, started_at=datetime.utcnow())
        self.conn.execute(
            """
            INSERT INTO ingestion_runs (id, repo, started_at, prs_seen, decisions_written,
                input_tokens, output_tokens, cost_usd)
            VALUES (?, ?, ?, 0, 0, 0, 0, 0.0)
            """,
            [str(stats.id), stats.repo, stats.started_at],
        )
        return stats

    def finalize_ingestion_run(self, stats: IngestionRunStats, notes: str | None = None) -> None:
        self.conn.execute(
            """
            UPDATE ingestion_runs
            SET finished_at = ?,
                prs_seen = ?,
                decisions_written = ?,
                input_tokens = ?,
                output_tokens = ?,
                cost_usd = ?,
                notes = ?
            WHERE id = ?
            """,
            [
                datetime.utcnow(),
                stats.prs_seen,
                stats.decisions_written,
                stats.input_tokens,
                stats.output_tokens,
                stats.cost_usd,
                notes,
                str(stats.id),
            ],
        )
