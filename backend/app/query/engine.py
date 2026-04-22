"""Query engine — Opus 4.7 with the full ledger in 1M context, streaming SSE events.

Two Opus calls per query:
  1. **Main answer** (claude-opus-4-7, streaming) — takes the user question and
     the compact ledger JSON, emits a cited reasoning chain following the
     prompt in `prompts.QUERY_SYSTEM_PROMPT`.
  2. **Self-check** (claude-opus-4-7, non-streaming) — takes the main answer
     and the same ledger, verifies every inline citation token traces back
     to the ledger. Result is emitted as an SSE event after the answer stream
     closes.

Emit shape (SSE events):
  event: phase          data: "retrieving" | "reasoning" | "self_checking" | "done"
  event: stats          data: {"decisions": N, "citations": M, "edges": K}
  event: delta          data: {"text": "…streamed token…"}
  event: self_check     data: {<SelfCheckResult JSON>}
  event: usage          data: {"input_tokens": N, "output_tokens": N, "cost_usd": X}
  event: error          data: {"message": "..."}

The frontend EventSource listens for named events. Connection closes after `done`.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from anthropic import AsyncAnthropic
from anthropic.types import TextBlockParam

from app.agents.cost import MODEL_PRICES_PER_MILLION, CostTracker
from app.agents.json_utils import extract_json
from app.ledger.load import LedgerSnapshot
from app.query.prompts import QUERY_SYSTEM_PROMPT, SELF_CHECK_SYSTEM_PROMPT

QUERY_MODEL = "claude-opus-4-7"
SELF_CHECK_MODEL = "claude-opus-4-7"
QUERY_MAX_TOKENS = 4096
SELF_CHECK_MAX_TOKENS = 4096


@dataclass
class QueryOptions:
    effort: str = "high"  # "high" | "xhigh"
    self_check: bool = True


def _sse_event(event: str, data: Any) -> str:
    payload = data if isinstance(data, str) else json.dumps(data)
    return f"event: {event}\ndata: {payload}\n\n"


def _compact_ledger(snapshot: LedgerSnapshot) -> str:
    """Render the ledger as the user-message payload for Opus.

    Keep the shape agent-readable: one `decisions[]` list with inlined citations
    + alternatives, plus an `edges[]` list. Matches `load_ledger` output.
    """
    payload = {
        "repo": snapshot.repo,
        "decisions": snapshot.decisions,
        "edges": snapshot.edges,
    }
    return json.dumps(payload, indent=2, default=str)


def build_user_prompt(snapshot: LedgerSnapshot, question: str) -> str:
    return (
        f"Repository: {snapshot.repo}\n"
        f"Ledger size: {snapshot.decision_count} decisions · "
        f"{snapshot.citation_count} citations · "
        f"{snapshot.alternative_count} rejected alternatives · "
        f"{len(snapshot.edges)} edges\n\n"
        "Ledger (JSON):\n"
        f"{_compact_ledger(snapshot)}\n\n"
        "---\n"
        f"Question: {question}\n\n"
        "Answer in the structured format specified by your system prompt. "
        "Every factual claim must use an inline citation token that maps to "
        "a real ledger entry."
    )


async def stream_query(
    client: AsyncAnthropic,
    snapshot: LedgerSnapshot,
    question: str,
    *,
    options: QueryOptions | None = None,
) -> AsyncIterator[str]:
    opts = options or QueryOptions()
    tracker = CostTracker()

    yield _sse_event("phase", "retrieving")
    yield _sse_event(
        "stats",
        {
            "repo": snapshot.repo,
            "decisions": snapshot.decision_count,
            "citations": snapshot.citation_count,
            "alternatives": snapshot.alternative_count,
            "edges": len(snapshot.edges),
        },
    )

    system_blocks: list[TextBlockParam] = [
        {
            "type": "text",
            "text": QUERY_SYSTEM_PROMPT,
            "cache_control": {"type": "ephemeral"},
        }
    ]
    user_text = build_user_prompt(snapshot, question)

    yield _sse_event("phase", "reasoning")

    collected_text: list[str] = []
    answer_usage: dict[str, int] = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
    }
    try:
        async with client.messages.stream(
            model=QUERY_MODEL,
            max_tokens=QUERY_MAX_TOKENS,
            system=system_blocks,
            messages=[{"role": "user", "content": user_text}],
        ) as stream:
            async for text_chunk in stream.text_stream:
                if not text_chunk:
                    continue
                collected_text.append(text_chunk)
                yield _sse_event("delta", {"text": text_chunk})

            final_message = await stream.get_final_message()
            usage = final_message.usage
            answer_usage = {
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
                "cache_creation_input_tokens": getattr(usage, "cache_creation_input_tokens", 0)
                or 0,
                "cache_read_input_tokens": getattr(usage, "cache_read_input_tokens", 0) or 0,
            }
    except Exception as exc:
        yield _sse_event("error", {"message": f"answer stream failed: {exc!r}"})
        yield _sse_event("phase", "done")
        return

    tracker.record(
        "query",
        QUERY_MODEL,
        answer_usage["input_tokens"],
        answer_usage["output_tokens"],
        cache_creation_tokens=answer_usage["cache_creation_input_tokens"],
        cache_read_tokens=answer_usage["cache_read_input_tokens"],
    )

    full_answer = "".join(collected_text)

    if opts.self_check and full_answer.strip():
        yield _sse_event("phase", "self_checking")
        self_check_payload = (
            "Answer to verify:\n---\n"
            f"{full_answer}\n---\n\n"
            "Ledger context (same context the answer agent saw):\n"
            f"{_compact_ledger(snapshot)}\n\n"
            "Return ONLY the JSON object described in your system prompt."
        )
        try:
            sc_resp = await client.messages.create(
                model=SELF_CHECK_MODEL,
                max_tokens=SELF_CHECK_MAX_TOKENS,
                system=[
                    {
                        "type": "text",
                        "text": SELF_CHECK_SYSTEM_PROMPT,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                messages=[{"role": "user", "content": self_check_payload}],
            )
        except Exception as exc:
            yield _sse_event("error", {"message": f"self-check failed: {exc!r}"})
        else:
            sc_text_parts: list[str] = []
            for block in sc_resp.content:
                if getattr(block, "type", None) == "text":
                    sc_text_parts.append(getattr(block, "text", ""))
            sc_text = "".join(sc_text_parts)
            try:
                sc_obj = extract_json(sc_text)
            except ValueError as exc:
                sc_obj = {
                    "overall_verdict": "unparseable",
                    "raw": sc_text[:400],
                    "error": str(exc),
                }
            yield _sse_event("self_check", sc_obj)

            tracker.record(
                "self_check",
                SELF_CHECK_MODEL,
                sc_resp.usage.input_tokens,
                sc_resp.usage.output_tokens,
                cache_creation_tokens=getattr(sc_resp.usage, "cache_creation_input_tokens", 0) or 0,
                cache_read_tokens=getattr(sc_resp.usage, "cache_read_input_tokens", 0) or 0,
            )

    totals = tracker.totals()
    yield _sse_event(
        "usage",
        {
            "input_tokens": totals.input_tokens,
            "output_tokens": totals.output_tokens,
            "cache_read_tokens": totals.cache_read_tokens,
            "cost_usd": round(totals.cost_usd, 4),
            "per_agent": {
                name: {
                    "calls": bucket.calls,
                    "input_tokens": bucket.input_tokens,
                    "output_tokens": bucket.output_tokens,
                    "cost_usd": round(bucket.cost_usd, 4),
                }
                for name, bucket in tracker.per_agent.items()
            },
        },
    )
    yield _sse_event("phase", "done")


# Re-exported so tests and scripts can estimate before calling the API.
__all__ = [
    "MODEL_PRICES_PER_MILLION",
    "QueryOptions",
    "build_user_prompt",
    "stream_query",
]
