"""Interview script generation — cache-first, Opus 4.7, streaming parse.

Task 4 of the Ghost Interview feature. Given an `AuthorSlice`, produce six
`{question, answer}` exchanges in the subject's voice and replay them as SSE
events. A DuckDB `interviews` row caches the parsed script so repeat requests
(and reconnects) never re-bill the model — and, critically, emit the SAME
event sequence as a live run so the client cannot tell the two apart.

Event grammar (shared with the SSE handler in Task 7):
  - ``exchange_start``  -> ``{"index": i, "question": str}``
  - ``exchange_delta``  -> ``{"index": i, "text_delta": str}``
  - ``exchange_end``    -> ``{"index": i}``
  - ``script_end``      -> ``{"usage": {...}}``
"""

from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from anthropic import AsyncAnthropic

from app.ledger.author_slice import AuthorSlice
from app.ledger.schema import connect
from app.query.prompts import (
    GHOST_INTERVIEW_FOLLOWUP_SYSTEM_PROMPT,
    GHOST_INTERVIEW_SYSTEM_PROMPT,
)

INTERVIEW_MODEL = "claude-opus-4-7"
INTERVIEW_MAX_TOKENS = 4096
VOICE_SAMPLE_COUNT = 12


def _build_system_prompt(owner: str, repo: str, subject: AuthorSlice) -> str:
    """Format the grounding prompt and append the top-12 verbatim voice samples."""
    base = GHOST_INTERVIEW_SYSTEM_PROMPT.format(
        subject=subject.author,
        owner=owner,
        repo=repo,
    )
    samples = subject.quotes[:VOICE_SAMPLE_COUNT]
    if not samples:
        return base + "\n\n# VOICE SAMPLES\n\n(none available in slice)"
    samples_block = "\n\n# VOICE SAMPLES\n\n" + "\n\n".join(
        f'"{q.citation_quote}" [PR #{q.citation_source_id}, @{subject.author}, '
        f"{q.citation_timestamp.date().isoformat() if q.citation_timestamp else 'n/a'}]"
        for q in samples
    )
    return base + samples_block


def _build_user_prompt(subject: AuthorSlice) -> str:
    decisions_json = json.dumps(subject.decisions, default=str, indent=2)
    alternatives = [
        {
            "name": a.name,
            "rejection_reason_quoted": a.rejection_reason_quoted,
            "citation_source_id": a.citation_source_id,
        }
        for a in subject.alternatives
    ]
    return (
        f"Subject: @{subject.author}\n"
        f"Repo: {subject.owner}/{subject.repo}\n\n"
        f"Decisions authored (JSON):\n{decisions_json}\n\n"
        f"Rejected alternatives they argued:\n{json.dumps(alternatives, indent=2)}\n\n"
        "Produce the 6 exchanges now."
    )


# Match "Q: ... A: ..." blocks, non-greedy, up to the next "Q:" or end of string.
_EXCHANGE_RE = re.compile(
    r"Q:\s*(?P<q>.+?)\n\s*A:\s*(?P<a>.+?)(?=\n\s*Q:|\Z)",
    re.DOTALL,
)


def parse_exchanges(text: str) -> list[dict[str, str]]:
    """Split the raw Opus output into ``{question, answer}`` pairs."""
    return [
        {"question": m.group("q").strip(), "answer": m.group("a").strip()}
        for m in _EXCHANGE_RE.finditer(text)
    ]


def _load_cached(
    db_path: str | Path, owner: str, repo: str, author: str
) -> dict[str, Any] | None:
    """Return the cached row for (owner, repo, author) or None."""
    conn = connect(str(db_path))
    try:
        row = conn.execute(
            """
            SELECT generated_at, model, script_json, voice_sample_ids, token_usage
            FROM interviews
            WHERE repo_owner = ? AND repo_name = ? AND subject_author = ?
            """,
            [owner, repo, author],
        ).fetchone()
        if row is None:
            return None
        return {
            "generated_at": row[0],
            "model": row[1],
            "script": json.loads(row[2]) if isinstance(row[2], str) else row[2],
            "voice_sample_ids": (
                json.loads(row[3]) if isinstance(row[3], str) else row[3]
            ),
            "token_usage": (
                json.loads(row[4]) if isinstance(row[4], str) else row[4]
            ),
        }
    finally:
        conn.close()


def _persist(
    db_path: str | Path,
    *,
    owner: str,
    repo: str,
    author: str,
    exchanges: list[dict[str, str]],
    voice_sample_ids: list[str],
    token_usage: dict[str, int],
) -> None:
    """Write one ``interviews`` row, replacing any prior cached script."""
    conn = connect(str(db_path))
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO interviews
              (repo_owner, repo_name, subject_author, generated_at, model,
               script_json, voice_sample_ids, token_usage)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                owner,
                repo,
                author,
                datetime.now(UTC),
                INTERVIEW_MODEL,
                json.dumps({"exchanges": exchanges}),
                json.dumps(voice_sample_ids),
                json.dumps(token_usage),
            ],
        )
    finally:
        conn.close()


def _replay_events(
    exchanges: list[dict[str, str]], usage: dict[str, int]
) -> list[tuple[str, dict[str, Any]]]:
    """Build the event sequence for a given script — same shape for cache + live."""
    events: list[tuple[str, dict[str, Any]]] = []
    for idx, ex in enumerate(exchanges):
        events.append(("exchange_start", {"index": idx, "question": ex["question"]}))
        events.append(("exchange_delta", {"index": idx, "text_delta": ex["answer"]}))
        events.append(("exchange_end", {"index": idx}))
    events.append(("script_end", {"usage": usage}))
    return events


async def generate_or_replay_script(
    *,
    client: AsyncAnthropic,
    db_path: str | Path,
    owner: str,
    repo: str,
    author: str,
    slice_: AuthorSlice,
    force: bool = False,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Yield ``(event_name, payload)`` tuples matching the SSE grammar.

    Cache-first: if a row exists in ``interviews`` for ``(owner, repo, author)``
    and ``force`` is False, replay it verbatim. Otherwise call Opus once, parse
    six exchanges, persist, then replay. The client cannot distinguish the
    two code paths — the yielded event sequence is identical.
    """
    if not force:
        cached = _load_cached(db_path, owner, repo, author)
        if cached is not None:
            exchanges = cached["script"]["exchanges"]
            usage = cached["token_usage"]
            for event in _replay_events(exchanges, usage):
                yield event
            return

    system = _build_system_prompt(owner, repo, slice_)
    user = _build_user_prompt(slice_)

    raw_text = ""
    usage: dict[str, int] = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_input_tokens": 0,
    }

    async with client.messages.stream(
        model=INTERVIEW_MODEL,
        max_tokens=INTERVIEW_MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        async for text_chunk in stream.text_stream:
            if text_chunk:
                raw_text += text_chunk
        final_message = await stream.get_final_message()
        usage_obj = final_message.usage
        usage = {
            "input_tokens": int(getattr(usage_obj, "input_tokens", 0) or 0),
            "output_tokens": int(getattr(usage_obj, "output_tokens", 0) or 0),
            "cache_read_input_tokens": int(
                getattr(usage_obj, "cache_read_input_tokens", 0) or 0
            ),
        }

    exchanges = parse_exchanges(raw_text)
    # Guard the UI: pad to exactly six exchanges if Opus returned fewer. The
    # drawer always renders 6 bubbles — an under-full script would leave a
    # half-broken row, so we fill with explicit "see the ledger" placeholders
    # rather than inventing content.
    while len(exchanges) < 6:
        exchanges.append(
            {
                "question": "(no further question)",
                "answer": "(interview ran short — see ledger directly)",
            }
        )

    voice_sample_ids = [str(q.id) for q in slice_.quotes[:VOICE_SAMPLE_COUNT]]

    # Persist BEFORE yielding the first event. A concurrent second request
    # arriving mid-replay will then hit the cache path rather than double-billing.
    _persist(
        db_path,
        owner=owner,
        repo=repo,
        author=author,
        exchanges=exchanges,
        voice_sample_ids=voice_sample_ids,
        token_usage=usage,
    )

    for event in _replay_events(exchanges, usage):
        yield event


async def stream_followup(
    *,
    client: AsyncAnthropic,
    db_path: str | Path,
    owner: str,
    repo: str,
    author: str,
    slice_: AuthorSlice,
    question: str,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Stream a single follow-up answer grounded in the cached six-exchange script.

    Raises ``ValueError`` if no cached script exists for ``(owner, repo, author)``
    — callers must short-circuit that case BEFORE attaching this generator to an
    SSE response. Exceptions inside an ``EventSourceResponse`` generator are
    swallowed into a 200 stream with an ``error`` event, which defeats the
    "/script first" contract; the router enforces the 409 synchronously.

    Message history replays the cached exchanges as alternating user/assistant
    turns so the model sees its own prior voice, with the user's new question
    appended last. Uses the same ``client.messages.stream(...)`` context-manager
    pattern as ``generate_or_replay_script`` — no ``await`` on ``.stream()``.
    """
    cached = _load_cached(db_path, owner, repo, author)
    if cached is None:
        raise ValueError("no cached script for subject — generate first")

    system = GHOST_INTERVIEW_FOLLOWUP_SYSTEM_PROMPT.format(subject=author)

    messages: list[dict[str, Any]] = []
    for ex in cached["script"]["exchanges"]:
        messages.append({"role": "user", "content": ex["question"]})
        messages.append({"role": "assistant", "content": ex["answer"]})
    messages.append({"role": "user", "content": question})

    async with client.messages.stream(
        model=INTERVIEW_MODEL,
        max_tokens=1024,
        system=system,
        messages=messages,
    ) as stream:
        async for chunk in stream.text_stream:
            if chunk:
                yield "answer_delta", {"text_delta": chunk}
        final = await stream.get_final_message()
        usage_obj = final.usage

    usage = {
        "input_tokens": int(getattr(usage_obj, "input_tokens", 0) or 0),
        "output_tokens": int(getattr(usage_obj, "output_tokens", 0) or 0),
        "cache_read_input_tokens": int(
            getattr(usage_obj, "cache_read_input_tokens", 0) or 0
        ),
    }
    yield "answer_end", {"usage": usage}


__all__ = [
    "INTERVIEW_MODEL",
    "INTERVIEW_MAX_TOKENS",
    "VOICE_SAMPLE_COUNT",
    "generate_or_replay_script",
    "parse_exchanges",
    "stream_followup",
    "_load_cached",
    "_persist",
]
