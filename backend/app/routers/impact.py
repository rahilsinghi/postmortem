"""Streaming /api/impact endpoint — Impact Ripple query mode.

Takes a repo, an anchor (PR number OR fuzzy name from the question text), and
a question. BFSes across `decision_edges` to build a small subgraph, streams an
Opus 4.7 answer over SSE using the impact-ripple system prompt. Optional
self-check runs the same verifier as `/api/query`.

Events (same shape as /api/query so the frontend can reuse the consumer):
  phase, stats, subgraph, delta*, self_check, usage, done, error.

The extra `subgraph` event carries the included PR numbers so the UI can
visually highlight them on the graph.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from pathlib import Path

from anthropic import AsyncAnthropic
from anthropic.types import TextBlockParam
from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from app.agents.cost import CostTracker
from app.agents.json_utils import extract_json
from app.config import get_settings, resolve_secret
from app.errors import safe_error_message
from app.ledger.load import load_ledger
from app.query.impact import (
    IMPACT_SYSTEM_PROMPT,
    build_impact_subgraph,
    build_impact_user_prompt,
    find_anchor,
)
from app.query.prompts import SELF_CHECK_SYSTEM_PROMPT
from app.validators import validate_repo

router = APIRouter(prefix="/api", tags=["impact"])

MODEL = "claude-opus-4-7"
MAX_TOKENS = 4096


def _sse(event: str, data: object) -> str:
    payload = data if isinstance(data, str) else json.dumps(data)
    return f"event: {event}\ndata: {payload}\n\n"


def _resolve_db_path() -> Path:
    settings = get_settings()
    path = Path(settings.ledger_db_path)
    if not path.is_absolute():
        repo_root = Path(__file__).resolve().parents[3]
        path = repo_root / settings.ledger_db_path
    return path


@router.get("/impact")
async def impact_endpoint(
    repo: str = Query(...),
    question: str = Query(..., min_length=3, max_length=2000),
    anchor_pr: int | None = Query(None),
    max_depth: int = Query(2, ge=1, le=3),
    self_check: bool = Query(False),
) -> EventSourceResponse:
    validate_repo(repo)

    db_path = _resolve_db_path()
    if not db_path.exists():
        raise HTTPException(status_code=404, detail=f"Ledger DB not found at {db_path}")

    snapshot = load_ledger(db_path, repo)
    if snapshot.decision_count == 0:
        raise HTTPException(status_code=404, detail=f"No decisions for {repo}")

    anchor = find_anchor(snapshot, anchor_pr, question)
    if anchor is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not identify an anchor decision. Pass anchor_pr= explicitly, "
                "or include the decision's subject in the question."
            ),
        )

    subgraph = build_impact_subgraph(snapshot, anchor, max_depth=max_depth)

    api_key = resolve_secret("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="ANTHROPIC_API_KEY not configured on the server.",
        )
    client = AsyncAnthropic(api_key=api_key)
    tracker = CostTracker()

    async def _events() -> AsyncIterator[dict[str, str]]:
        yield {"event": "phase", "data": "subgraph"}
        yield {
            "event": "stats",
            "data": json.dumps(
                {
                    "repo": repo,
                    "anchor_pr": subgraph.anchor_pr,
                    "anchor_title": subgraph.anchor_title,
                    "subgraph_decisions": len(subgraph.decisions),
                    "subgraph_edges": len(subgraph.edges),
                }
            ),
        }
        yield {
            "event": "subgraph",
            "data": json.dumps(
                {
                    "anchor_pr": subgraph.anchor_pr,
                    "included_prs": subgraph.included_prs,
                }
            ),
        }

        yield {"event": "phase", "data": "reasoning"}

        user_text = build_impact_user_prompt(subgraph, question)
        system_blocks: list[TextBlockParam] = [
            {
                "type": "text",
                "text": IMPACT_SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ]

        collected: list[str] = []
        try:
            async with client.messages.stream(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=system_blocks,
                messages=[{"role": "user", "content": user_text}],
            ) as stream:
                async for chunk in stream.text_stream:
                    if not chunk:
                        continue
                    collected.append(chunk)
                    yield {"event": "delta", "data": json.dumps({"text": chunk})}
                final = await stream.get_final_message()
                usage = final.usage
        except Exception as exc:
            yield {
                "event": "error",
                "data": json.dumps(
                    {
                        "message": f"stream failed — {safe_error_message(exc, context='impact.stream')}"
                    }
                ),
            }
            yield {"event": "phase", "data": "done"}
            return

        tracker.record(
            "impact",
            MODEL,
            usage.input_tokens,
            usage.output_tokens,
            cache_creation_tokens=getattr(usage, "cache_creation_input_tokens", 0) or 0,
            cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
        )

        full_answer = "".join(collected)

        if self_check and full_answer.strip():
            yield {"event": "phase", "data": "self_checking"}
            sc_payload = (
                "Answer to verify:\n---\n"
                f"{full_answer}\n---\n\n"
                "Subgraph context (same context the answer agent saw):\n"
                f"{json.dumps({'anchor': {'pr_number': subgraph.anchor_pr, 'title': subgraph.anchor_title}, 'decisions': subgraph.decisions, 'edges': subgraph.edges}, indent=2, default=str)}\n\n"
                "Return ONLY the JSON object described in your system prompt."
            )
            try:
                sc_resp = await client.messages.create(
                    model=MODEL,
                    max_tokens=2048,
                    system=[
                        {
                            "type": "text",
                            "text": SELF_CHECK_SYSTEM_PROMPT,
                            "cache_control": {"type": "ephemeral"},
                        }
                    ],
                    messages=[{"role": "user", "content": sc_payload}],
                )
            except Exception as exc:
                yield {
                    "event": "error",
                    "data": json.dumps(
                        {
                            "message": f"self-check failed — {safe_error_message(exc, context='impact.self_check')}"
                        }
                    ),
                }
            else:
                sc_text = "".join(
                    getattr(b, "text", "")
                    for b in sc_resp.content
                    if getattr(b, "type", None) == "text"
                )
                try:
                    sc_obj = extract_json(sc_text)
                except ValueError as exc:
                    sc_obj = {
                        "overall_verdict": "unparseable",
                        "raw": sc_text[:400],
                        "error": str(exc),
                    }
                yield {"event": "self_check", "data": json.dumps(sc_obj)}
                tracker.record(
                    "impact_self_check",
                    MODEL,
                    sc_resp.usage.input_tokens,
                    sc_resp.usage.output_tokens,
                    cache_creation_tokens=getattr(sc_resp.usage, "cache_creation_input_tokens", 0)
                    or 0,
                    cache_read_tokens=getattr(sc_resp.usage, "cache_read_input_tokens", 0) or 0,
                )

        totals = tracker.totals()
        yield {
            "event": "usage",
            "data": json.dumps(
                {
                    "input_tokens": totals.input_tokens,
                    "output_tokens": totals.output_tokens,
                    "cache_read_tokens": totals.cache_read_tokens,
                    "cost_usd": round(totals.cost_usd, 4),
                }
            ),
        }
        yield {"event": "phase", "data": "done"}

    return EventSourceResponse(_events())
