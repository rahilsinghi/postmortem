"""Ghost Interview router — /api/interview/{subjects,script,followup}.

Ranks authors by citation count (subjects). Further routes (``/script``,
``/followup``) are added in subsequent tasks. All routes validate the repo
slug via ``validate_repo`` and resolve the ledger DB path the same way
``impact.py`` does — relative ``ledger_db_path`` values are anchored to the
repo root, not the process CWD, so uvicorn and pytest see the same DB.
"""

from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator
from pathlib import Path

from anthropic import AsyncAnthropic
from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from app.config import get_settings, resolve_secret
from app.ledger.author_slice import load_author_slice
from app.ledger.schema import connect
from app.query.interview import generate_or_replay_script
from app.validators import validate_repo

router = APIRouter(prefix="/api/interview", tags=["interview"])
_log = logging.getLogger("postmortem")

SUBJECTS_MIN_CITATIONS = 3
SUBJECTS_LIMIT = 8


def _resolve_db_path() -> Path:
    settings = get_settings()
    path = Path(settings.ledger_db_path)
    if not path.is_absolute():
        repo_root = Path(__file__).resolve().parents[3]
        path = repo_root / settings.ledger_db_path
    return path


@router.get("/subjects")
async def subjects(
    owner: str = Query(..., min_length=1, max_length=64),
    repo: str = Query(..., min_length=1, max_length=128),
) -> dict:
    validate_repo(f"{owner}/{repo}")
    db_path = _resolve_db_path()
    if not db_path.exists():
        raise HTTPException(status_code=404, detail=f"Ledger DB not found at {db_path}")

    repo_key = f"{owner}/{repo}"
    conn = connect(str(db_path))
    try:
        rows = conn.execute(
            """
            WITH by_author AS (
                SELECT c.citation_author AS handle,
                       COUNT(*) AS citation_count,
                       MIN(c.citation_timestamp) AS earliest,
                       MAX(c.citation_timestamp) AS latest,
                       MAX(length(c.citation_quote)) AS longest_quote_len
                FROM citations c
                JOIN decisions d ON c.decision_id = d.id
                WHERE d.repo = ? AND c.citation_author IS NOT NULL
                GROUP BY c.citation_author
                HAVING COUNT(*) >= ?
            ),
            dec_counts AS (
                SELECT handle, COUNT(*) AS decision_count
                FROM (
                    SELECT unnest(decided_by) AS handle
                    FROM decisions
                    WHERE repo = ?
                ) AS exploded
                GROUP BY handle
            )
            SELECT b.handle, b.citation_count, b.earliest, b.latest,
                   COALESCE(dc.decision_count, 0) AS decision_count
            FROM by_author b
            LEFT JOIN dec_counts dc USING (handle)
            ORDER BY b.citation_count DESC, b.longest_quote_len DESC
            LIMIT ?
            """,
            [repo_key, SUBJECTS_MIN_CITATIONS, repo_key, SUBJECTS_LIMIT],
        ).fetchall()
    finally:
        conn.close()

    subjects_list = [
        {
            "handle": row[0],
            "citation_count": int(row[1]),
            "span_start": row[2].isoformat() if row[2] else None,
            "span_end": row[3].isoformat() if row[3] else None,
            "decision_count": int(row[4]),
            "avatar_url": f"https://github.com/{row[0]}.png?size=80",
        }
        for row in rows
    ]
    return {"owner": owner, "repo": repo, "subjects": subjects_list}


@router.get("/script")
async def script(
    owner: str = Query(..., min_length=1, max_length=64),
    repo: str = Query(..., min_length=1, max_length=128),
    author: str = Query(..., min_length=1, max_length=64),
    force: bool = Query(False),
) -> EventSourceResponse:
    validate_repo(f"{owner}/{repo}")
    db_path = _resolve_db_path()
    if not db_path.exists():
        raise HTTPException(status_code=404, detail=f"Ledger DB not found at {db_path}")

    slice_ = load_author_slice(db_path, owner=owner, repo=repo, author=author)
    if not slice_.quotes:
        raise HTTPException(
            status_code=422,
            detail=f"No quoted material for @{author} in {owner}/{repo}",
        )

    api_key = resolve_secret("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")
    client = AsyncAnthropic(api_key=api_key)

    async def _events() -> AsyncIterator[dict[str, str]]:
        yield {
            "event": "subject_meta",
            "data": json.dumps(
                {
                    "handle": author,
                    "avatar_url": f"https://github.com/{author}.png?size=80",
                    "decision_count": len(slice_.decisions),
                    "citation_count": len(slice_.quotes),
                }
            ),
        }
        async for name, payload in generate_or_replay_script(
            client=client,
            db_path=db_path,
            owner=owner,
            repo=repo,
            author=author,
            slice_=slice_,
            force=force,
        ):
            yield {"event": name, "data": json.dumps(payload, default=str)}

    return EventSourceResponse(_events())
