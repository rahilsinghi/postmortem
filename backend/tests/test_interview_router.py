from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.ledger.models import (
    Citation,
    CitationSourceType,
    DecisionCategory,
    DecisionRecord,
    DecisionStatus,
)
from app.ledger.store import LedgerStore
from app.main import app


def _seed(db: Path) -> None:
    """Seed three decisions (PRs 101/102/103) all decided by `yusukebe`,
    each with one citation authored by `yusukebe`."""
    with LedgerStore(db) as store:
        for pr in (101, 102, 103):
            day = (pr % 28) + 1
            ts = datetime(2025, 1, day, tzinfo=UTC)
            store.upsert_decision(
                DecisionRecord(
                    id=uuid4(),
                    repo="honojs/hono",
                    pr_number=pr,
                    title=f"Decision {pr}",
                    summary="seeded for router tests",
                    category=DecisionCategory.OTHER,
                    decided_at=ts,
                    decided_by=["yusukebe"],
                    status=DecisionStatus.ACTIVE,
                    superseded_by=None,
                    commit_shas=[],
                    confidence=0.9,
                    extracted_at=datetime.now(UTC),
                    pr_url=f"https://github.com/honojs/hono/pull/{pr}",
                    context_citations=[
                        Citation(
                            claim="seeded claim",
                            citation_quote=f"quote for pr {pr}",
                            citation_source_type=CitationSourceType.REVIEW_COMMENT,
                            citation_source_id=str(pr),
                            citation_author="yusukebe",
                            citation_timestamp=ts,
                            citation_url=f"https://github.com/honojs/hono/pull/{pr}",
                        ),
                    ],
                    decision_citations=[],
                    forces=[],
                    consequences=[],
                    alternatives=[],
                )
            )


async def test_subjects_returns_ranked_authors(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = tmp_path / "subjects.duckdb"
    _seed(db)
    monkeypatch.setattr(get_settings(), "ledger_db_path", str(db))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        r = await c.get(
            "/api/interview/subjects",
            params={"owner": "honojs", "repo": "hono"},
        )

    assert r.status_code == 200
    body = r.json()
    assert body["owner"] == "honojs"
    assert body["repo"] == "hono"
    assert any(s["handle"] == "yusukebe" for s in body["subjects"])
    top = next(s for s in body["subjects"] if s["handle"] == "yusukebe")
    assert top["citation_count"] >= 3
    assert top["decision_count"] >= 3


async def test_script_streams_six_exchanges(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db = tmp_path / "script.duckdb"
    _seed(db)
    monkeypatch.setattr(get_settings(), "ledger_db_path", str(db))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")

    # `_fake_gen` must be an async generator *function*, not a coroutine — the
    # router `async for`s over it. Patch the name as imported into the router
    # module, not the source path in app.query.interview.
    async def _fake_gen(*_args, **_kwargs):
        for i in range(6):
            yield "exchange_start", {"index": i, "question": f"Q{i}"}
            yield "exchange_delta", {"index": i, "text_delta": f"A{i}"}
            yield "exchange_end", {"index": i}
        yield "script_end", {"usage": {"input_tokens": 1, "output_tokens": 1}}

    with patch("app.routers.interview.generate_or_replay_script", _fake_gen):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as c:
            r = await c.get(
                "/api/interview/script",
                params={"owner": "honojs", "repo": "hono", "author": "yusukebe"},
            )

    assert r.status_code == 200
    body = r.text
    assert body.count("event: exchange_start") == 6
    assert body.count("event: exchange_end") == 6
    assert "event: script_end" in body
