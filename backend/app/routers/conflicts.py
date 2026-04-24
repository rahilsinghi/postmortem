"""Conflict Finder router — /api/conflicts.

Returns a cached JSON list of conflict pairs for a given repo. First hit
for a repo triggers an Opus 4.7 extraction and persists it; subsequent hits
are instant DuckDB lookups. Pass `?force=true` to bypass the cache.
"""

from __future__ import annotations

import logging
from pathlib import Path

from anthropic import AsyncAnthropic
from fastapi import APIRouter, HTTPException, Query

from app.config import get_settings, resolve_secret
from app.ledger.load import load_ledger
from app.query.conflicts import generate_and_cache, load_cached
from app.validators import validate_repo

router = APIRouter(prefix="/api", tags=["conflicts"])
_log = logging.getLogger("postmortem")


def _resolve_db_path() -> Path:
    settings = get_settings()
    path = Path(settings.ledger_db_path)
    if not path.is_absolute():
        repo_root = Path(__file__).resolve().parents[3]
        path = repo_root / settings.ledger_db_path
    return path


@router.get("/conflicts")
async def conflicts_endpoint(
    repo: str = Query(..., description="owner/name"),
    force: bool = Query(False),
) -> dict:
    validate_repo(repo)
    db_path = _resolve_db_path()
    if not db_path.exists():
        raise HTTPException(status_code=404, detail=f"Ledger DB not found at {db_path}")

    if not force:
        cached = load_cached(db_path, repo)
        if cached is not None:
            return {"repo": repo, **cached}

    snapshot = load_ledger(db_path, repo)
    if snapshot.decision_count == 0:
        raise HTTPException(status_code=404, detail=f"No decisions for {repo}")

    api_key = resolve_secret("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")
    client = AsyncAnthropic(api_key=api_key)

    result = await generate_and_cache(client=client, db_path=db_path, snapshot=snapshot)
    return {"repo": repo, **result}
