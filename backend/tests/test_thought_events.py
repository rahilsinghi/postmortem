from __future__ import annotations

from typing import Any, ClassVar

from app.ledger.load import LedgerSnapshot
from app.query.engine import QueryOptions, stream_query


class _FakeAsyncStream:
    async def __aenter__(self) -> _FakeAsyncStream:
        return self

    async def __aexit__(self, *_: Any) -> None:
        return None

    @property
    def text_stream(self) -> Any:
        async def gen() -> Any:
            yield "## Answer\nok [PR #1, @alice, 2024-01-01]\n"

        return gen()

    async def get_final_message(self) -> Any:
        class _Usage:
            input_tokens = 12_000
            output_tokens = 42
            cache_creation_input_tokens = 0
            cache_read_input_tokens = 0

        class _Final:
            usage = _Usage()

        return _Final()


class _FakeMessages:
    def stream(self, **_: Any) -> _FakeAsyncStream:
        return _FakeAsyncStream()

    async def create(self, **_: Any) -> Any:
        class _Usage:
            input_tokens = 500
            output_tokens = 100
            cache_creation_input_tokens = 0
            cache_read_input_tokens = 0

        class _Resp:
            content: ClassVar[list[Any]] = []
            usage = _Usage()

        return _Resp()


class _FakeClient:
    messages = _FakeMessages()


def _snapshot() -> LedgerSnapshot:
    return LedgerSnapshot(
        repo="demo/repo",
        decisions=[
            {
                "id": "1",
                "pr_number": 1,
                "title": "t",
                "summary": "",
                "category": "architecture",
                "citations": {"context": [], "decision": [], "forces": [], "consequences": []},
                "alternatives": [],
            }
        ],
        edges=[],
    )


def _collect_thoughts(chunks: list[str]) -> list[str]:
    thoughts: list[str] = []
    for chunk in chunks:
        lines = chunk.split("\n")
        event_name = None
        for line in lines:
            if line.startswith("event: "):
                event_name = line[len("event: ") :]
            elif line.startswith("data: ") and event_name == "thought":
                thoughts.append(line[len("data: ") :])
    return thoughts


async def test_thought_events_fire_at_key_phases_without_self_check() -> None:
    chunks: list[str] = []
    async for chunk in stream_query(
        _FakeClient(),  # type: ignore[arg-type]
        _snapshot(),
        "why?",
        options=QueryOptions(self_check=False),
    ):
        chunks.append(chunk)

    thoughts = _collect_thoughts(chunks)
    # Expect three thoughts: loading, scanning, resolved (self-check skipped).
    assert len(thoughts) == 3
    assert "loading ledger" in thoughts[0]
    assert "scanning 1 decisions across 1 categories" in thoughts[1]
    assert "resolved" in thoughts[2]


async def test_self_check_adds_a_fourth_thought() -> None:
    chunks: list[str] = []
    async for chunk in stream_query(
        _FakeClient(),  # type: ignore[arg-type]
        _snapshot(),
        "why?",
        options=QueryOptions(self_check=True),
    ):
        chunks.append(chunk)

    thoughts = _collect_thoughts(chunks)
    assert len(thoughts) == 4
    assert "cross-checking" in thoughts[2]
    assert "resolved" in thoughts[3]
