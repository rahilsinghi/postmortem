from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock
from uuid import UUID

import pytest

from app.ledger.author_slice import AuthorSlice, QuotedCitation
from app.ledger.models import CitationSourceType
from app.ledger.schema import connect
from app.query.interview import generate_or_replay_script


class _FakeTextStream:
    """Async iterator over text chunks — mirrors `stream.text_stream`."""

    def __init__(self, chunks: list[str]) -> None:
        self._chunks = chunks

    def __aiter__(self):
        return self._iter()

    async def _iter(self):
        for chunk in self._chunks:
            yield chunk


class _FakeStream:
    """Mimics the object yielded by `client.messages.stream(...)` ctx manager."""

    def __init__(self, text_chunks: list[str], usage: dict[str, int]) -> None:
        self.text_stream = _FakeTextStream(text_chunks)
        self._final = SimpleNamespace(usage=SimpleNamespace(**usage))

    async def get_final_message(self) -> Any:
        return self._final


class _FakeStreamCtx:
    """Async context manager returned by `client.messages.stream(...)`."""

    def __init__(self, stream: _FakeStream) -> None:
        self._stream = stream

    async def __aenter__(self) -> _FakeStream:
        return self._stream

    async def __aexit__(self, *_: object) -> None:
        return None


def _build_slice() -> AuthorSlice:
    return AuthorSlice(
        owner="honojs",
        repo="hono",
        author="yusukebe",
        decisions=[{"pr_number": 1234, "title": "Web Standards first"}],
        quotes=[
            QuotedCitation(
                id=UUID("00000000-0000-0000-0000-000000000001"),
                claim="Web-standards-first framework design.",
                citation_quote="we prefer fetch over node:http.",
                citation_source_type=CitationSourceType.REVIEW_COMMENT,
                citation_source_id="1234",
                citation_author="yusukebe",
                citation_timestamp=datetime(2025, 1, 9, tzinfo=UTC),
                citation_url="https://github.com/honojs/hono/pull/1234",
            )
        ],
        alternatives=[],
    )


def _scripted_output() -> str:
    return (
        'Q: What was non-negotiable?\n'
        'A: "we prefer fetch over node:http." [PR #1234, @yusukebe, 2025-01-09]\n\n'
    ) * 6


def _make_client(text: str, usage: dict[str, int]) -> MagicMock:
    client = MagicMock()
    client.messages.stream = MagicMock(
        return_value=_FakeStreamCtx(_FakeStream([text], usage))
    )
    return client


@pytest.mark.asyncio
async def test_first_call_invokes_opus_and_persists(tmp_path: Path) -> None:
    db = tmp_path / "cache.duckdb"
    connect(str(db)).close()  # seed schema

    client = _make_client(
        _scripted_output(),
        {"input_tokens": 1200, "output_tokens": 600, "cache_read_input_tokens": 0},
    )

    events: list[tuple[str, dict[str, Any]]] = []
    async for event, payload in generate_or_replay_script(
        client=client,
        db_path=db,
        owner="honojs",
        repo="hono",
        author="yusukebe",
        slice_=_build_slice(),
        force=False,
    ):
        events.append((event, payload))

    names = [e for e, _ in events]
    assert names.count("exchange_start") == 6
    assert names.count("exchange_end") == 6
    assert names[-1] == "script_end"
    # script_end must carry the usage dict from the stream's final message.
    final_payload = events[-1][1]
    assert final_payload["usage"]["input_tokens"] == 1200
    assert final_payload["usage"]["output_tokens"] == 600
    assert final_payload["usage"]["cache_read_input_tokens"] == 0
    client.messages.stream.assert_called_once()


@pytest.mark.asyncio
async def test_second_call_uses_cache(tmp_path: Path) -> None:
    db = tmp_path / "cache.duckdb"
    connect(str(db)).close()

    client = _make_client(
        _scripted_output(),
        {"input_tokens": 1200, "output_tokens": 600, "cache_read_input_tokens": 0},
    )

    events_first: list[tuple[str, dict[str, Any]]] = []
    async for event, payload in generate_or_replay_script(
        client=client,
        db_path=db,
        owner="honojs",
        repo="hono",
        author="yusukebe",
        slice_=_build_slice(),
        force=False,
    ):
        events_first.append((event, payload))

    client.messages.stream.reset_mock()

    events_second: list[tuple[str, dict[str, Any]]] = []
    async for event, payload in generate_or_replay_script(
        client=client,
        db_path=db,
        owner="honojs",
        repo="hono",
        author="yusukebe",
        slice_=_build_slice(),
        force=False,
    ):
        events_second.append((event, payload))

    # Client must not have been called on the cached path.
    client.messages.stream.assert_not_called()

    # Event sequence must be byte-identical between live + cached paths.
    assert [e for e, _ in events_second] == [e for e, _ in events_first]
    assert [p for _, p in events_second] == [p for _, p in events_first]
