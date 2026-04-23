from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.ledger.author_slice import (
    AuthorSlice,
    QuotedAlternative,
    QuotedCitation,
    load_author_slice,
)
from app.ledger.models import (
    Alternative,
    Citation,
    CitationSourceType,
    DecisionCategory,
    DecisionRecord,
    DecisionStatus,
)
from app.ledger.store import LedgerStore


OWNER = "honojs"
REPO = "hono"
FULL_REPO = f"{OWNER}/{REPO}"


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    return tmp_path / "ledger.duckdb"


def _decision_with_mixed_authors(pr_number: int = 1001) -> DecisionRecord:
    yusuke_citation = Citation(
        claim="Hono should stay free of Node-only APIs so it runs on Workers.",
        citation_quote=(
            "We need to keep the core runtime-agnostic; Workers is the forcing function."
        ),
        citation_source_type=CitationSourceType.PR_BODY,
        citation_source_id=str(pr_number),
        citation_author="yusukebe",
        citation_timestamp=datetime(2024, 2, 10, 9, 0, tzinfo=UTC),
        citation_url=f"https://github.com/{FULL_REPO}/pull/{pr_number}",
    )
    other_citation = Citation(
        claim="We can lean on @hono/node-server for Node compat.",
        citation_quote="node-server handles the Node integration for us.",
        citation_source_type=CitationSourceType.REVIEW_COMMENT,
        citation_source_id="rc-1",
        citation_author="someone-else",
        citation_timestamp=datetime(2024, 2, 10, 10, 0, tzinfo=UTC),
        citation_url=f"https://github.com/{FULL_REPO}/pull/{pr_number}#discussion_r1",
    )
    anon_citation = Citation(
        claim="Benchmarks against itty-router look favorable.",
        citation_quote="Faster than itty-router on a Workers cold start.",
        citation_source_type=CitationSourceType.COMMIT_MESSAGE,
        citation_source_id="abc1234",
        citation_author=None,
        citation_timestamp=datetime(2024, 2, 11, 8, 0, tzinfo=UTC),
        citation_url=f"https://github.com/{FULL_REPO}/commit/abc1234",
    )
    alt = Alternative(
        name="Express",
        rejection_reason="Ties the framework to Node-only semantics.",
        rejection_reason_quoted="Express would anchor us to Node; Workers support goes away.",
        citation_source_type=CitationSourceType.PR_COMMENT,
        citation_source_id="pc-7",
        citation_author="yusukebe",
        citation_url=f"https://github.com/{FULL_REPO}/pull/{pr_number}#issuecomment-7",
        confidence=0.88,
    )
    return DecisionRecord(
        repo=FULL_REPO,
        pr_number=pr_number,
        title="Keep core runtime-agnostic",
        summary="Core must not import Node-only modules; delegate to adapters.",
        category=DecisionCategory.UI_ARCHITECTURE,
        decided_at=datetime(2024, 2, 12, 12, 0, tzinfo=UTC),
        decided_by=["yusukebe", "someone-else"],
        status=DecisionStatus.ACTIVE,
        commit_shas=["abc1234"],
        confidence=0.91,
        context_citations=[yusuke_citation, other_citation, anon_citation],
        decision_citations=[],
        forces=[],
        consequences=[],
        alternatives=[alt],
        pr_url=f"https://github.com/{FULL_REPO}/pull/{pr_number}",
    )


def _decision_with_long_yusuke_quote(pr_number: int = 1002) -> DecisionRecord:
    long_quote = (
        "On the router architecture debate: I'm convinced the trie approach beats regex "
        "because it's deterministic, matches in O(k) on the path length, and — critically — "
        "it stays fast when we add hundreds of routes. Regex-based routers degrade linearly "
        "as users add handlers, and I've seen this kill perf on large apps. The trie also "
        "gives us the clean basis for nested apps and sub-routers, which is the direction "
        "Workers-based services actually grow in. So yes, trie, even though it's more code."
    )
    assert len(long_quote) > 400
    citation = Citation(
        claim="Trie router outperforms regex at scale.",
        citation_quote=long_quote,
        citation_source_type=CitationSourceType.PR_BODY,
        citation_source_id=str(pr_number),
        citation_author="yusukebe",
        citation_timestamp=datetime(2024, 3, 1, 9, 0, tzinfo=UTC),
        citation_url=f"https://github.com/{FULL_REPO}/pull/{pr_number}",
    )
    return DecisionRecord(
        repo=FULL_REPO,
        pr_number=pr_number,
        title="Adopt trie router",
        summary="Replace regex router with a trie for deterministic match times.",
        category=DecisionCategory.OTHER,
        decided_at=datetime(2024, 3, 2, 12, 0, tzinfo=UTC),
        decided_by=["yusukebe"],
        status=DecisionStatus.ACTIVE,
        commit_shas=["def5678"],
        confidence=0.95,
        context_citations=[citation],
        decision_citations=[],
        forces=[],
        consequences=[],
        alternatives=[],
        pr_url=f"https://github.com/{FULL_REPO}/pull/{pr_number}",
    )


def test_slice_returns_only_subject_quotes(db_path: Path) -> None:
    with LedgerStore(db_path) as store:
        store.upsert_decision(_decision_with_mixed_authors())

    slice_ = load_author_slice(db_path, owner=OWNER, repo=REPO, author="yusukebe")

    assert isinstance(slice_, AuthorSlice)
    assert len(slice_.decisions) == 1
    assert slice_.decisions[0]["pr_number"] == 1001
    assert "yusukebe" in slice_.decisions[0]["decided_by"]

    assert len(slice_.quotes) == 1
    assert isinstance(slice_.quotes[0], QuotedCitation)
    assert slice_.quotes[0].citation_author == "yusukebe"
    assert slice_.quotes[0].citation_quote.startswith("We need to keep")

    assert len(slice_.alternatives) == 1
    assert isinstance(slice_.alternatives[0], QuotedAlternative)
    assert slice_.alternatives[0].citation_author == "yusukebe"
    assert slice_.alternatives[0].name == "Express"


def test_slice_excludes_null_authors(db_path: Path) -> None:
    with LedgerStore(db_path) as store:
        store.upsert_decision(_decision_with_mixed_authors())

    slice_ = load_author_slice(db_path, owner=OWNER, repo=REPO, author="ghost-author")

    assert slice_.decisions == []
    assert slice_.quotes == []
    assert slice_.alternatives == []
    assert slice_.span() == (None, None)


def test_slice_sorts_quotes_by_length_desc(db_path: Path) -> None:
    with LedgerStore(db_path) as store:
        store.upsert_decision(_decision_with_mixed_authors())
        store.upsert_decision(_decision_with_long_yusuke_quote())

    slice_ = load_author_slice(db_path, owner=OWNER, repo=REPO, author="yusukebe")

    assert len(slice_.quotes) == 2
    assert len(slice_.quotes[0].citation_quote) > len(slice_.quotes[1].citation_quote)
    assert len(slice_.quotes[0].citation_quote) > 400

    span = slice_.span()
    assert span[0] is not None and span[1] is not None
    assert span[0] <= span[1]
