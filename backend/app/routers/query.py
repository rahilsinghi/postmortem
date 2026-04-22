"""Streaming /api/query endpoint.

Uses Server-Sent Events (via sse-starlette's `EventSourceResponse`) to stream
the query engine's events as they're produced. The frontend opens an
`EventSource` at `/api/query?repo=...&question=...` and receives named events
(phase, stats, delta, self_check, usage, error).

Self-check is on by default; pass `self_check=false` to skip (useful for demos
where cost matters more than verification).
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from pathlib import Path

from anthropic import AsyncAnthropic
from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from app.config import get_settings, resolve_secret
from app.ledger.load import load_ledger
from app.query.engine import QueryOptions, stream_query
from app.validators import validate_repo

router = APIRouter(prefix="/api", tags=["query"])


def _resolve_db_path() -> Path:
    settings = get_settings()
    path = Path(settings.ledger_db_path)
    if not path.is_absolute():
        repo_root = Path(__file__).resolve().parents[3]
        path = repo_root / settings.ledger_db_path
    return path


@router.get("/query")
async def query_endpoint(
    repo: str = Query(..., description="owner/name"),
    question: str = Query(..., min_length=3, max_length=2000),
    effort: str = Query("high", pattern="^(high|xhigh)$"),
    self_check: bool = Query(True),
) -> EventSourceResponse:
    validate_repo(repo)

    db_path = _resolve_db_path()
    if not db_path.exists():
        raise HTTPException(status_code=404, detail=f"Ledger DB not found at {db_path}")

    snapshot = load_ledger(db_path, repo)
    if snapshot.decision_count == 0:
        raise HTTPException(status_code=404, detail=f"No decisions for {repo}")

    api_key = resolve_secret("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not configured on the server.",
        )

    client = AsyncAnthropic(api_key=api_key)
    options = QueryOptions(effort=effort, self_check=self_check)

    async def _raw_events() -> AsyncIterator[bytes]:
        async for chunk in stream_query(client, snapshot, question, options=options):
            # `stream_query` already formats each chunk as `event: X\ndata: Y\n\n`.
            # EventSourceResponse wants a dict, but passing raw bytes through the
            # generator keeps the SSE framing intact — we use `ping=None` to avoid
            # the library injecting its own keepalives.
            yield chunk.encode("utf-8")

    async def _events() -> AsyncIterator[dict[str, str]]:
        # EventSourceResponse wants (event, data) dicts. Parse our already-framed
        # chunks back into that shape so the library's formatting is consistent.
        buffer: dict[str, str] = {}
        async for chunk in stream_query(client, snapshot, question, options=options):
            for raw_line in chunk.split("\n"):
                line = raw_line.rstrip("\r")
                if not line:
                    if buffer:
                        yield {
                            "event": buffer.get("event", "message"),
                            "data": buffer.get("data", ""),
                        }
                        buffer = {}
                    continue
                if line.startswith("event: "):
                    buffer["event"] = line[len("event: ") :]
                elif line.startswith("data: "):
                    buffer["data"] = line[len("data: ") :]

    return EventSourceResponse(_events())
