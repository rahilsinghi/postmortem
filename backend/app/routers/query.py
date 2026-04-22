"""Streaming /api/query endpoint.

Uses Server-Sent Events (via sse-starlette's `EventSourceResponse`) to stream
the query engine's events as they're produced. The frontend opens an
`EventSource` at `/api/query?repo=...&question=...` and receives named events
(phase, stats, delta, self_check, usage, error).

Self-check is on by default; pass `self_check=false` to skip (useful for demos
where cost matters more than verification).

After the final `usage` event fires, the run is persisted to the `query_runs`
table so the cost engine can aggregate per-repo query spend.
"""

from __future__ import annotations

import contextlib
import json
import logging
from collections.abc import AsyncIterator
from pathlib import Path

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from app.config import get_settings, resolve_secret
from app.ledger.load import load_ledger
from app.ledger.store import LedgerStore
from app.query.engine import QueryOptions, stream_query
from app.ratelimit import rate_limit
from app.validators import validate_repo

router = APIRouter(prefix="/api", tags=["query"])
_log = logging.getLogger("postmortem")


def _resolve_db_path() -> Path:
    settings = get_settings()
    path = Path(settings.ledger_db_path)
    if not path.is_absolute():
        repo_root = Path(__file__).resolve().parents[3]
        path = repo_root / settings.ledger_db_path
    return path


@router.get("/query", dependencies=[Depends(rate_limit("query", per_minute=10))])
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

    last_usage: dict[str, object] = {}
    last_self_check: dict[str, object] = {}

    async def _events() -> AsyncIterator[dict[str, str]]:
        # EventSourceResponse wants (event, data) dicts. Parse our already-framed
        # chunks back into that shape so the library's formatting is consistent.
        buffer: dict[str, str] = {}

        def _flush() -> dict[str, str] | None:
            if not buffer:
                return None
            event = buffer.get("event", "message")
            data = buffer.get("data", "")
            # Snoop the two events we need to persist the run. The browser still
            # sees them — we're just capturing a copy.
            if event == "usage":
                with contextlib.suppress(ValueError):
                    last_usage.update(json.loads(data))
            elif event == "self_check":
                with contextlib.suppress(ValueError):
                    last_self_check.update(json.loads(data))
            return {"event": event, "data": data}

        async for chunk in stream_query(client, snapshot, question, options=options):
            for raw_line in chunk.split("\n"):
                line = raw_line.rstrip("\r")
                if not line:
                    flushed = _flush()
                    if flushed is not None:
                        yield flushed
                        buffer.clear()
                    continue
                if line.startswith("event: "):
                    buffer["event"] = line[len("event: ") :]
                elif line.startswith("data: "):
                    buffer["data"] = line[len("data: ") :]

        flushed = _flush()
        if flushed is not None:
            yield flushed

        # Persist the run after the stream has fully drained. Swallow failures
        # — cost-ledger corruption must never surface to the client.
        if last_usage:
            try:
                with LedgerStore(db_path) as store:
                    store.record_query_run(
                        repo=repo,
                        mode="query",
                        question=question,
                        effort=effort,
                        self_check=self_check,
                        input_tokens=int(last_usage.get("input_tokens", 0) or 0),
                        output_tokens=int(last_usage.get("output_tokens", 0) or 0),
                        cache_read_tokens=int(last_usage.get("cache_read_tokens", 0) or 0),
                        cost_usd=float(last_usage.get("cost_usd", 0.0) or 0.0),
                        verified_count=int(last_self_check.get("verified_count", 0) or 0),
                        unverified_count=int(last_self_check.get("unverified_count", 0) or 0),
                    )
            except Exception:
                _log.exception("failed to persist query_run for %s", repo)

    return EventSourceResponse(_events())
