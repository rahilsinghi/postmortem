"""Streaming /api/ingest endpoint — Screen 3 "Live Ingestion".

Opens a new ingestion job and streams per-PR progress events over SSE so the
frontend can render Screen 3's live log + counters. The SSE events map 1-to-1
to the event dicts emitted by `app.ingest.ingest_repo`'s `on_event` callback.

Event shapes (all `data:` JSON):
  start         { repo, pr_limit, min_discussion, concurrency, classifier_threshold }
  listing       { pr_limit }
  listed        { count }
  filtered      { before, after, min_discussion }
  pr_classified { idx, total, pr_number, accepted, is_decision, confidence, title, decision_type, cost_so_far, accepted_so_far, rejected_so_far }
  pr_extracted  { pr_number, title, category, citations, alternatives }
  pr_error      { error }
  persisting    {}
  stitching     { decisions }
  stitcher_error{ message }
  done          { repo, prs_seen, classifier_accepted, classifier_rejected, decisions_written, edges_written, cost_usd, input_tokens, output_tokens }
  error         { message }

Used by the live-ingest CLI / UI only. The bulk hero-repo ingests are still
driven by `scripts/ingest.py`, which doesn't need the streaming layer.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from app.config import get_settings, resolve_secret
from app.errors import safe_error_message
from app.ingest import ingest_repo
from app.ratelimit import rate_limit
from app.validators import validate_repo

router = APIRouter(prefix="/api", tags=["ingest"])

MAX_PR_LIMIT = 200  # cap user-initiated runs so one click can't spend $50


def _check_ingest_auth(header_token: str | None, query_token: str | None) -> None:
    """Validate the shared ingest token, if one is configured on the server.

    Accepts token via `X-Ingest-Token` header (preferred) OR `?token=` query param
    (needed because native browser `EventSource` can't set custom headers).
    If `INGEST_AUTH_TOKEN` is unset the endpoint is open — fine for local dev,
    MUST be set for any public deploy.
    """
    expected = get_settings().ingest_auth_token
    if not expected:
        return  # open endpoint (local dev mode)
    supplied = header_token or query_token
    if supplied != expected:
        raise HTTPException(status_code=403, detail="ingest token missing or invalid")


def _check_repo_allowlist(repo: str) -> None:
    raw = get_settings().ingest_allowed_repos.strip()
    if not raw:
        return
    allow = {r.strip() for r in raw.split(",") if r.strip()}
    if repo not in allow:
        raise HTTPException(
            status_code=403,
            detail=f"repo '{repo}' is not on the server's allowlist",
        )


def _resolve_db_path() -> Path:
    settings = get_settings()
    path = Path(settings.ledger_db_path)
    if not path.is_absolute():
        repo_root = Path(__file__).resolve().parents[3]
        path = repo_root / settings.ledger_db_path
    return path


def _resolve_cache_dir() -> Path:
    repo_root = Path(__file__).resolve().parents[3]
    return repo_root / ".cache" / "pr-archaeology"


@router.get("/ingest", dependencies=[Depends(rate_limit("ingest", per_minute=3))])
async def stream_ingest(
    repo: str = Query(..., description="owner/name — any public GitHub repo"),
    limit: int = Query(50, ge=1, le=MAX_PR_LIMIT),
    min_discussion: int = Query(3, ge=0),
    concurrency: int = Query(3, ge=1, le=8),
    token: str | None = Query(None, description="auth token (if server requires one)"),
    x_ingest_token: str | None = Header(default=None, alias="X-Ingest-Token"),
) -> EventSourceResponse:
    _check_ingest_auth(x_ingest_token, token)
    validate_repo(repo)
    _check_repo_allowlist(repo)

    anthropic_key = resolve_secret("ANTHROPIC_API_KEY")
    github_token = resolve_secret("GITHUB_TOKEN")
    if not anthropic_key or not github_token:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY and GITHUB_TOKEN must be configured on the server.",
        )

    db_path = _resolve_db_path()
    cache_dir = _resolve_cache_dir()

    async def _events() -> AsyncIterator[dict[str, str]]:
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue()

        async def on_event(event: dict[str, Any]) -> None:
            await queue.put(event)

        async def run() -> None:
            try:
                await ingest_repo(
                    repo,
                    db_path=db_path,
                    pr_limit=limit,
                    concurrency=concurrency,
                    min_discussion=min_discussion,
                    anthropic_api_key=anthropic_key,
                    github_token=github_token,
                    cache_dir=cache_dir,
                    notes=f"live ingest via /api/ingest (limit={limit}, min_discussion={min_discussion})",
                    on_event=on_event,
                )
            except Exception as exc:
                await queue.put(
                    {
                        "type": "error",
                        "message": safe_error_message(exc, context="ingest.run"),
                    }
                )
            finally:
                await queue.put(None)  # sentinel

        task = asyncio.create_task(run())
        try:
            while True:
                event = await queue.get()
                if event is None:
                    break
                yield {"event": event["type"], "data": json.dumps(event)}
        finally:
            if not task.done():
                task.cancel()
                with contextlib.suppress(asyncio.CancelledError, Exception):
                    await task

    return EventSourceResponse(_events())
