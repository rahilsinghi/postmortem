"""Author-filtered ledger slice for the Ghost Interview feature.

Given a maintainer handle (e.g. "yusukebe"), return every decision they helped
land plus every citation and rejected-alternative that quotes them by name.
The downstream engine (Task 4) synthesizes the maintainer's voice from these
verbatim quotes — so grounding must be exact:

- `decisions` uses DuckDB's `list_contains` on the `decided_by` array column
  so we only include decisions where the author was actually a decider
  (not just someone who commented).
- `quotes` and `alternatives` are cross-repo in the sense that they span
  every decision in the target repo, but `citation_author IS NULL` rows are
  excluded — a null author would let the ghost speak in other people's voices.
- `quotes` are sorted longest-first because long quotes carry more stylistic
  signal than short agreements like "sgtm".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from app.ledger.models import CitationSourceType
from app.ledger.schema import connect


@dataclass
class QuotedCitation:
    id: UUID
    claim: str
    citation_quote: str
    citation_source_type: CitationSourceType
    citation_source_id: str
    citation_author: str | None
    citation_timestamp: datetime | None
    citation_url: str


@dataclass
class QuotedAlternative:
    id: UUID
    name: str
    rejection_reason: str
    rejection_reason_quoted: str | None
    citation_source_type: CitationSourceType
    citation_source_id: str
    citation_author: str | None
    citation_url: str
    confidence: float


@dataclass
class AuthorSlice:
    owner: str
    repo: str
    author: str
    decisions: list[dict[str, Any]] = field(default_factory=list)
    quotes: list[QuotedCitation] = field(default_factory=list)
    alternatives: list[QuotedAlternative] = field(default_factory=list)

    def span(self) -> tuple[datetime | None, datetime | None]:
        """Return (earliest, latest) timestamps across quotes, or (None, None)."""
        timestamps = [q.citation_timestamp for q in self.quotes if q.citation_timestamp is not None]
        if not timestamps:
            return (None, None)
        return (min(timestamps), max(timestamps))


def _as_uuid(value: Any) -> UUID:
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


def load_author_slice(
    db_path: str | Path,
    *,
    owner: str,
    repo: str,
    author: str,
) -> AuthorSlice:
    full_repo = f"{owner}/{repo}"
    conn = connect(str(db_path))
    try:
        decision_rows = conn.execute(
            """
            SELECT id, pr_number, title, summary, category, decided_at, decided_by,
                   status, commit_shas, confidence, pr_url
            FROM decisions
            WHERE repo = ? AND list_contains(decided_by, ?)
            ORDER BY decided_at NULLS LAST, pr_number
            """,
            [full_repo, author],
        ).fetchall()

        decisions: list[dict[str, Any]] = [
            {
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
            }
            for row in decision_rows
        ]

        quote_rows = conn.execute(
            """
            SELECT c.id, c.claim, c.citation_quote, c.citation_source_type,
                   c.citation_source_id, c.citation_author, c.citation_timestamp,
                   c.citation_url
            FROM citations c
            INNER JOIN decisions d ON d.id = c.decision_id
            WHERE d.repo = ?
              AND c.citation_author IS NOT NULL
              AND c.citation_author = ?
            ORDER BY length(c.citation_quote) DESC
            """,
            [full_repo, author],
        ).fetchall()

        quotes = [
            QuotedCitation(
                id=_as_uuid(row[0]),
                claim=row[1],
                citation_quote=row[2],
                citation_source_type=CitationSourceType(row[3]),
                citation_source_id=row[4],
                citation_author=row[5],
                citation_timestamp=row[6],
                citation_url=row[7],
            )
            for row in quote_rows
        ]

        alt_rows = conn.execute(
            """
            SELECT a.id, a.name, a.rejection_reason, a.rejection_reason_quoted,
                   a.citation_source_type, a.citation_source_id,
                   a.citation_author, a.citation_url, a.confidence
            FROM alternatives a
            INNER JOIN decisions d ON d.id = a.decision_id
            WHERE d.repo = ?
              AND a.citation_author IS NOT NULL
              AND a.citation_author = ?
            ORDER BY a.confidence DESC
            """,
            [full_repo, author],
        ).fetchall()

        alternatives = [
            QuotedAlternative(
                id=_as_uuid(row[0]),
                name=row[1],
                rejection_reason=row[2],
                rejection_reason_quoted=row[3],
                citation_source_type=CitationSourceType(row[4]),
                citation_source_id=row[5],
                citation_author=row[6],
                citation_url=row[7],
                confidence=row[8],
            )
            for row in alt_rows
        ]

        return AuthorSlice(
            owner=owner,
            repo=repo,
            author=author,
            decisions=decisions,
            quotes=quotes,
            alternatives=alternatives,
        )
    finally:
        conn.close()
