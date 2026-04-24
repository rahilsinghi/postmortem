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
from app.errors import safe_error_message
from app.ledger.load import LedgerSnapshot
from app.query.prompts import QUERY_SYSTEM_PROMPT, SELF_CHECK_SYSTEM_PROMPT

QUERY_MODEL = "claude-opus-4-7"
SELF_CHECK_MODEL = "claude-opus-4-7"
QUERY_MAX_TOKENS = 4096
SELF_CHECK_MAX_TOKENS = 4096

# Opus 4.7 only supports `thinking.type = "adaptive"`; the "enabled" shape
# (budget_tokens) 400s on this model. The model also defaults to
# `display: "omitted"` which silently strips thinking text — we opt into
# "summarized" so the tokens actually reach the `reasoning` SSE event.


@dataclass
class QueryOptions:
    effort: str = "high"  # "high" | "xhigh"
    self_check: bool = True
    # When True (default), ask Opus to emit its reasoning tokens so the
    # Reasoning X-Ray can show the model's actual thinking, not just the
    # deterministic backend phase labels.
    extended_thinking: bool = True


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
    # Reasoning X-Ray — every `thought` line is deterministic and true
    # at the moment of emission (no theatrics). Phase-aligned so the UI's
    # cyan scan-line lands at real timing beats.
    yield _sse_event(
        "thought",
        {
            "label": (
                f"loading ledger · {snapshot.decision_count} decisions · "
                f"{snapshot.citation_count} citations · "
                f"{len(snapshot.edges)} edges"
            ),
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

    categories = {d["category"] for d in snapshot.decisions if d.get("category")}
    yield _sse_event(
        "thought",
        {
            "label": (
                f"scanning {snapshot.decision_count} decisions across "
                f"{len(categories)} categories · token budget "
                f"{QUERY_MAX_TOKENS // 1000}K"
            ),
        },
    )
    yield _sse_event("phase", "reasoning")

    collected_text: list[str] = []
    answer_usage: dict[str, int] = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
    }
    stream_kwargs: dict[str, Any] = {
        "model": QUERY_MODEL,
        "max_tokens": QUERY_MAX_TOKENS,
        "system": system_blocks,
        "messages": [{"role": "user", "content": user_text}],
    }
    if opts.extended_thinking:
        stream_kwargs["thinking"] = {"type": "adaptive", "display": "summarized"}
        # Opus 4.7's adaptive thinking only surfaces thinking_delta events
        # at `effort: "max"` — `high` and `xhigh` both silently skip the
        # thinking block on ledger-grounded lookups. The Reasoning X-Ray
        # is the product's showpiece for the "Keep Thinking" prize, so
        # we pin the model to `max` whenever extended_thinking is on.
        # Cost impact is bounded by the 4096-token max_tokens cap; tracker
        # records real usage so the UI still shows accurate cost.
        stream_kwargs["output_config"] = {"effort": "max"}
    try:
        async with client.messages.stream(**stream_kwargs) as stream:
            # Iterate raw stream events so we can separate thinking_delta
            # from text_delta. `stream.text_stream` only yields the final
            # answer text — the thinking tokens live on content_block_delta
            # events with delta.type == "thinking_delta".
            async for event in stream:
                etype = getattr(event, "type", None)
                if etype != "content_block_delta":
                    continue
                delta = getattr(event, "delta", None)
                dtype = getattr(delta, "type", None)
                if dtype == "text_delta":
                    text_chunk = getattr(delta, "text", "") or ""
                    if not text_chunk:
                        continue
                    collected_text.append(text_chunk)
                    yield _sse_event("delta", {"text": text_chunk})
                elif dtype == "thinking_delta":
                    thinking_chunk = getattr(delta, "thinking", "") or ""
                    if not thinking_chunk:
                        continue
                    # Stream the raw reasoning tokens so the X-Ray can
                    # render Opus's actual thought process, chunk by chunk.
                    yield _sse_event("reasoning", {"text": thinking_chunk})

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
        yield _sse_event(
            "error",
            {
                "message": f"answer stream failed — {safe_error_message(exc, context='query.stream')}"
            },
        )
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
        yield _sse_event(
            "thought",
            {"label": "cross-checking every cited claim against ledger text"},
        )
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
            yield _sse_event(
                "error",
                {
                    "message": f"self-check failed — {safe_error_message(exc, context='query.self_check')}"
                },
            )
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
        "thought",
        {
            "label": (
                f"resolved · {totals.input_tokens // 1000}K in · "
                f"{totals.output_tokens} out · ${round(totals.cost_usd, 4)}"
            ),
        },
    )
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
