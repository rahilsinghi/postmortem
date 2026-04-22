from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.ledger.models import (
    Alternative,
    Citation,
    CitationSourceType,
    DecisionCategory,
    DecisionEdge,
    DecisionEdgeKind,
    DecisionRecord,
    DecisionStatus,
)
from app.ledger.store import LedgerStore


@pytest.fixture
def store(tmp_path: Path) -> LedgerStore:
    return LedgerStore(tmp_path / "ledger.duckdb")


def _sample_record(pr_number: int = 4512) -> DecisionRecord:
    citation = Citation(
        claim="Redux's action/reducer/selector pattern imposes 30+ LoC per feature",
        citation_quote="Redux's action/reducer/selector ceremony costs us 30+ LoC.",
        citation_source_type=CitationSourceType.PR_BODY,
        citation_source_id=str(pr_number),
        citation_author="alice",
        citation_timestamp=datetime(2024, 3, 17, 14, 22, tzinfo=UTC),
        citation_url=f"https://github.com/example/repo/pull/{pr_number}",
    )
    alternative = Alternative(
        name="Redux Toolkit",
        rejection_reason="Still commits to the reducer pattern.",
        rejection_reason_quoted="RTK still commits to the reducer pattern.",
        citation_source_type=CitationSourceType.PR_COMMENT,
        citation_source_id="1847293841",
        citation_author="alice",
        citation_url=f"https://github.com/example/repo/pull/{pr_number}#issuecomment-1847293841",
        confidence=0.92,
    )
    return DecisionRecord(
        repo="example/repo",
        pr_number=pr_number,
        title="Migrate state management to Zustand",
        summary="Replace Context + useReducer boilerplate with Zustand stores.",
        category=DecisionCategory.STATE_MANAGEMENT,
        decided_at=datetime(2024, 3, 17, 15, 0, tzinfo=UTC),
        decided_by=["alice", "bob"],
        status=DecisionStatus.ACTIVE,
        commit_shas=["abc1234"],
        confidence=0.9,
        context_citations=[citation],
        decision_citations=[citation],
        forces=[],
        consequences=[],
        alternatives=[alternative],
        pr_url=f"https://github.com/example/repo/pull/{pr_number}",
    )


def test_upsert_and_count(store: LedgerStore) -> None:
    record = _sample_record()
    store.upsert_decision(record)
    assert store.count_decisions() == 1
    assert store.count_decisions("example/repo") == 1
    assert store.count_decisions("other/repo") == 0


def test_upsert_is_idempotent_on_repo_pr(store: LedgerStore) -> None:
    record = _sample_record(pr_number=4512)
    first_id = store.upsert_decision(record)

    second = _sample_record(pr_number=4512)
    second.title = "Rewritten title"
    second_id = store.upsert_decision(second)

    assert first_id == second_id
    assert store.count_decisions() == 1

    citations = store.conn.execute(
        "SELECT COUNT(*) FROM citations WHERE decision_id = ?", [str(first_id)]
    ).fetchone()
    assert citations is not None
    assert citations[0] == 2


def test_citations_and_alternatives_persist(store: LedgerStore) -> None:
    record = _sample_record()
    store.upsert_decision(record)

    citation_count = store.conn.execute("SELECT COUNT(*) FROM citations").fetchone()
    alt_count = store.conn.execute("SELECT COUNT(*) FROM alternatives").fetchone()
    assert citation_count is not None and citation_count[0] == 2
    assert alt_count is not None and alt_count[0] == 1


def test_edges_upsert(store: LedgerStore) -> None:
    a = _sample_record(pr_number=1)
    b = _sample_record(pr_number=2)
    id_a = store.upsert_decision(a)
    id_b = store.upsert_decision(b)

    edge = DecisionEdge(from_id=id_a, to_id=id_b, kind=DecisionEdgeKind.SUPERSEDES, reason="x")
    store.upsert_edge(edge)
    store.upsert_edge(edge)  # same key, should not duplicate

    count = store.conn.execute("SELECT COUNT(*) FROM decision_edges").fetchone()
    assert count is not None and count[0] == 1


def test_ingestion_run_lifecycle(store: LedgerStore) -> None:
    stats = store.start_ingestion_run("example/repo")
    stats.prs_seen = 30
    stats.decisions_written = 7
    stats.input_tokens = 100_000
    stats.output_tokens = 25_000
    stats.cost_usd = 1.23
    store.finalize_ingestion_run(stats, notes="calibration pass")

    row = store.conn.execute(
        "SELECT prs_seen, decisions_written, cost_usd, notes FROM ingestion_runs WHERE id = ?",
        [str(stats.id)],
    ).fetchone()
    assert row == (30, 7, 1.23, "calibration pass")
