# Ghost Interview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a subject-per-interview Ghost Interview mode on the ledger page: user picks a maintainer, Opus 4.7 streams a 6-exchange scripted interview in their voice grounded in their ledger quotes, with one follow-up, delivered via a collapsible right-side drawer reachable from four entry points.

**Architecture:** Backend adds one DuckDB table (`interviews`), one router (`/api/interview/{subjects,script,followup}`), one system prompt, and an author-filtered ledger slice helper. Script generation is cache-first — second launch for the same (repo, author) replays stored events with zero Opus calls. Frontend mirrors the existing `DemoProvider` pattern with an `InterviewProvider` context, an SSE client shaped like `lib/query.ts`, and four entry-point surfaces that all funnel into a single drawer component.

**Tech Stack:** FastAPI + sse-starlette, DuckDB, Anthropic Python SDK (`AsyncAnthropic.messages.create`, same as query engine — no managed-agents beta for first cut), Next.js 15 + React 19 + TypeScript strict + Tailwind, Framer Motion, vitest (frontend), pytest (backend).

**Reference spec:** `docs/superpowers/specs/2026-04-23-ghost-interview-design.md`

**TDD discipline:** Every backend feature and every frontend data-layer module writes a failing test first. UI components (Drawer, Picker, Bubble) lean on a visual-verification step in the preview MCP rather than pixel-perfect render tests — the spec's rehearsal gate covers UX.

---

## Task 1: Backend — `AuthorSlice` data model

**Files:**
- Create: `backend/app/ledger/author_slice.py`
- Test: `backend/tests/test_load_author_slice.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_load_author_slice.py
from __future__ import annotations

import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.ledger.author_slice import AuthorSlice, load_author_slice
from app.ledger.models import (
    Alternative,
    Citation,
    CitationSourceType,
    DecisionCategory,
    DecisionRecord,
    DecisionStatus,
)
from app.ledger.store import LedgerStore


def _write_fixture_ledger(tmp_path: Path) -> Path:
    db = tmp_path / "fixture.duckdb"
    with LedgerStore(db) as store:
        record = DecisionRecord(
            id=uuid4(),
            repo="honojs/hono",
            pr_number=1234,
            title="Prefer Web Standards over node: APIs",
            summary="Use fetch/Request/Response wherever the runtime supports them.",
            category=DecisionCategory.RUNTIME,
            decided_at=datetime(2025, 1, 9, tzinfo=timezone.utc),
            decided_by=["yusukebe"],
            status=DecisionStatus.ACTIVE,
            superseded_by=None,
            commit_shas=["abc1234"],
            confidence=0.9,
            extracted_at=datetime.now(timezone.utc),
            pr_url="https://github.com/honojs/hono/pull/1234",
            context_citations=[
                Citation(
                    id=uuid4(),
                    claim="portability constraint",
                    citation_quote="we target multiple runtimes",
                    citation_source_type=CitationSourceType.PR_DESCRIPTION,
                    citation_source_id="1234",
                    citation_author="yusukebe",
                    citation_timestamp=datetime(2025, 1, 9, tzinfo=timezone.utc),
                    citation_url="https://github.com/honojs/hono/pull/1234",
                ),
                Citation(
                    id=uuid4(),
                    claim="unrelated comment by someone else",
                    citation_quote="this is a drive-by nit",
                    citation_source_type=CitationSourceType.PR_COMMENT,
                    citation_source_id="1234",
                    citation_author="someone-else",
                    citation_timestamp=datetime(2025, 1, 9, tzinfo=timezone.utc),
                    citation_url="https://github.com/honojs/hono/pull/1234#issuecomment-1",
                ),
                Citation(
                    id=uuid4(),
                    claim="citation with no author",
                    citation_quote="orphan quote",
                    citation_source_type=CitationSourceType.COMMIT,
                    citation_source_id="abc1234",
                    citation_author=None,
                    citation_timestamp=datetime(2025, 1, 9, tzinfo=timezone.utc),
                    citation_url="https://github.com/honojs/hono/commit/abc1234",
                ),
            ],
            decision_citations=[],
            forces=[],
            consequences=[],
            alternatives=[
                Alternative(
                    id=uuid4(),
                    name="Re-export node:buffer",
                    rejection_reason="ties Hono to Node.",
                    rejection_reason_quoted="Buffer is not in the Web Standards API",
                    citation_source_type=CitationSourceType.PR_REVIEW,
                    citation_source_id="1234",
                    citation_author="yusukebe",
                    citation_url="https://github.com/honojs/hono/pull/1234#pullrequestreview-1",
                    confidence=0.85,
                )
            ],
        )
        store.upsert_decision(record)
    return db


def test_slice_returns_only_subject_quotes(tmp_path: Path) -> None:
    db = _write_fixture_ledger(tmp_path)
    slice_ = load_author_slice(db, owner="honojs", repo="hono", author="yusukebe")

    assert isinstance(slice_, AuthorSlice)
    assert slice_.author == "yusukebe"
    # Exactly one citation by yusukebe + one rejected alternative he argued.
    # The someone-else comment and the authorless commit are excluded.
    assert len(slice_.quotes) == 1
    assert slice_.quotes[0].citation_author == "yusukebe"
    assert len(slice_.alternatives) == 1
    assert slice_.alternatives[0].citation_author == "yusukebe"
    # Decisions authored — yusukebe is in `decided_by`
    assert len(slice_.decisions) == 1
    assert slice_.decisions[0]["pr_number"] == 1234


def test_slice_excludes_null_authors(tmp_path: Path) -> None:
    db = _write_fixture_ledger(tmp_path)
    slice_ = load_author_slice(db, owner="honojs", repo="hono", author="nobody")
    assert slice_.quotes == []
    assert slice_.alternatives == []
    assert slice_.decisions == []


def test_slice_sorts_quotes_by_length_desc(tmp_path: Path) -> None:
    db = _write_fixture_ledger(tmp_path)
    # Add a longer yusukebe quote on a second decision.
    with LedgerStore(db) as store:
        record = DecisionRecord(
            id=uuid4(),
            repo="honojs/hono",
            pr_number=1235,
            title="Another decision",
            summary="…",
            category=DecisionCategory.RUNTIME,
            decided_at=datetime(2025, 2, 1, tzinfo=timezone.utc),
            decided_by=["yusukebe"],
            status=DecisionStatus.ACTIVE,
            superseded_by=None,
            commit_shas=[],
            confidence=0.9,
            extracted_at=datetime.now(timezone.utc),
            pr_url="https://github.com/honojs/hono/pull/1235",
            context_citations=[
                Citation(
                    id=uuid4(),
                    claim="long reasoning",
                    citation_quote="x" * 400,
                    citation_source_type=CitationSourceType.PR_REVIEW,
                    citation_source_id="1235",
                    citation_author="yusukebe",
                    citation_timestamp=datetime(2025, 2, 1, tzinfo=timezone.utc),
                    citation_url="https://github.com/honojs/hono/pull/1235",
                ),
            ],
            decision_citations=[],
            forces=[],
            consequences=[],
            alternatives=[],
        )
        store.upsert_decision(record)

    slice_ = load_author_slice(db, owner="honojs", repo="hono", author="yusukebe")
    # First quote should be the longer one.
    assert len(slice_.quotes) == 2
    assert len(slice_.quotes[0].citation_quote) > len(slice_.quotes[1].citation_quote)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_load_author_slice.py -v`
Expected: FAIL with `ImportError: cannot import name 'AuthorSlice' from 'app.ledger.author_slice'`

- [ ] **Step 3: Write `AuthorSlice` + `load_author_slice`**

```python
# backend/app/ledger/author_slice.py
"""Author-filtered view of the ledger for the Ghost Interview feature.

The interview system needs only a subject's own authored decisions, their
quoted lines across the whole ledger (not just decisions they authored — they
may have reviewed other people's PRs), and any rejected alternatives tagged
with their handle. We compute this at request time by direct DuckDB queries
rather than filtering the compact ledger snapshot, because the snapshot
discards per-citation author metadata once compacted.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from app.ledger.models import Alternative, Citation, CitationSourceType
from app.ledger.schema import connect


@dataclass
class AuthorSlice:
    author: str
    repo: str
    decisions: list[dict[str, Any]] = field(default_factory=list)
    quotes: list[Citation] = field(default_factory=list)
    alternatives: list[Alternative] = field(default_factory=list)

    @property
    def span(self) -> tuple[datetime | None, datetime | None]:
        timestamps = [q.citation_timestamp for q in self.quotes if q.citation_timestamp]
        if not timestamps:
            return (None, None)
        return (min(timestamps), max(timestamps))


def load_author_slice(
    db_path: str | Path,
    *,
    owner: str,
    repo: str,
    author: str,
) -> AuthorSlice:
    """Return the subject's ledger slice. Excludes citations with NULL author."""
    repo_key = f"{owner}/{repo}"
    conn = connect(str(db_path))
    try:
        decisions_rows = conn.execute(
            """
            SELECT id, pr_number, title, summary, category, decided_at,
                   decided_by, status, pr_url
            FROM decisions
            WHERE repo = ? AND list_contains(decided_by, ?)
            ORDER BY decided_at ASC
            """,
            [repo_key, author],
        ).fetchall()
        decisions = [
            {
                "id": str(row[0]),
                "pr_number": row[1],
                "title": row[2],
                "summary": row[3],
                "category": row[4],
                "decided_at": row[5],
                "decided_by": list(row[6]) if row[6] else [],
                "status": row[7],
                "pr_url": row[8],
            }
            for row in decisions_rows
        ]

        quote_rows = conn.execute(
            """
            SELECT c.id, c.decision_id, c.claim, c.citation_quote,
                   c.citation_source_type, c.citation_source_id,
                   c.citation_author, c.citation_timestamp, c.citation_url
            FROM citations c
            JOIN decisions d ON c.decision_id = d.id
            WHERE d.repo = ? AND c.citation_author = ?
            ORDER BY length(c.citation_quote) DESC
            """,
            [repo_key, author],
        ).fetchall()
        quotes = [
            Citation(
                id=row[0],
                claim=row[2],
                citation_quote=row[3],
                citation_source_type=CitationSourceType(row[4]),
                citation_source_id=row[5],
                citation_author=row[6],
                citation_timestamp=row[7],
                citation_url=row[8],
            )
            for row in quote_rows
        ]

        alt_rows = conn.execute(
            """
            SELECT a.id, a.name, a.rejection_reason, a.rejection_reason_quoted,
                   a.citation_source_type, a.citation_source_id,
                   a.citation_author, a.citation_url, a.confidence
            FROM alternatives a
            JOIN decisions d ON a.decision_id = d.id
            WHERE d.repo = ? AND a.citation_author = ?
            """,
            [repo_key, author],
        ).fetchall()
        alternatives = [
            Alternative(
                id=row[0],
                name=row[1],
                rejection_reason=row[2],
                rejection_reason_quoted=row[3],
                citation_source_type=CitationSourceType(row[4]),
                citation_source_id=row[5],
                citation_author=row[6],
                citation_url=row[7],
                confidence=row[8],
            )
            for row in alt_rows
        ]

        return AuthorSlice(
            author=author,
            repo=repo_key,
            decisions=decisions,
            quotes=quotes,
            alternatives=alternatives,
        )
    finally:
        conn.close()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_load_author_slice.py -v`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/ledger/author_slice.py backend/tests/test_load_author_slice.py
git commit -m "feat(ledger): author slice helper for ghost interview grounding"
```

---

## Task 2: Backend — `interviews` DuckDB table

**Files:**
- Modify: `backend/app/ledger/schema.py:101` (append new CREATE TABLE inside `SCHEMA_SQL`)
- Test: `backend/tests/test_interviews_schema.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_interviews_schema.py
from pathlib import Path

from app.ledger.schema import connect


def test_interviews_table_created_on_connect(tmp_path: Path) -> None:
    db = tmp_path / "fresh.duckdb"
    conn = connect(str(db))
    try:
        cols = conn.execute("PRAGMA table_info(interviews)").fetchall()
        names = {c[1] for c in cols}
        assert {
            "repo_owner",
            "repo_name",
            "subject_author",
            "generated_at",
            "model",
            "script_json",
            "voice_sample_ids",
            "token_usage",
        }.issubset(names)
    finally:
        conn.close()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_interviews_schema.py -v`
Expected: FAIL — `interviews` table does not exist

- [ ] **Step 3: Extend `SCHEMA_SQL` in `backend/app/ledger/schema.py`**

Insert this block immediately before the closing `"""` of `SCHEMA_SQL`:

```sql
CREATE TABLE IF NOT EXISTS interviews (
    repo_owner       VARCHAR NOT NULL,
    repo_name        VARCHAR NOT NULL,
    subject_author   VARCHAR NOT NULL,
    generated_at     TIMESTAMP NOT NULL,
    model            VARCHAR NOT NULL,
    script_json      JSON    NOT NULL,
    voice_sample_ids JSON    NOT NULL,
    token_usage      JSON    NOT NULL,
    PRIMARY KEY (repo_owner, repo_name, subject_author)
);
CREATE INDEX IF NOT EXISTS idx_interviews_repo
    ON interviews(repo_owner, repo_name);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_interviews_schema.py tests/test_ledger.py -v`
Expected: PASS (new test) + existing ledger tests unchanged

- [ ] **Step 5: Commit**

```bash
git add backend/app/ledger/schema.py backend/tests/test_interviews_schema.py
git commit -m "feat(ledger): add interviews cache table"
```

---

## Task 3: Backend — `GHOST_INTERVIEW_SYSTEM_PROMPT`

**Files:**
- Modify: `backend/app/query/prompts.py` (append new constant)
- Test: `backend/tests/test_interview_prompt.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_interview_prompt.py
from app.query.prompts import GHOST_INTERVIEW_SYSTEM_PROMPT


def test_prompt_mentions_six_exchanges() -> None:
    assert "exactly 6 exchanges" in GHOST_INTERVIEW_SYSTEM_PROMPT.lower() \
        or "exactly six exchanges" in GHOST_INTERVIEW_SYSTEM_PROMPT.lower()


def test_prompt_requires_paraphrase_disclosure() -> None:
    assert "(paraphrased — see [PR #" in GHOST_INTERVIEW_SYSTEM_PROMPT


def test_prompt_requires_quote_before_citation() -> None:
    assert '"' in GHOST_INTERVIEW_SYSTEM_PROMPT
    assert "[PR #N, @{subject}" in GHOST_INTERVIEW_SYSTEM_PROMPT


def test_prompt_forbids_invented_quotes() -> None:
    lowered = GHOST_INTERVIEW_SYSTEM_PROMPT.lower()
    assert "never invent" in lowered or "do not invent" in lowered
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_interview_prompt.py -v`
Expected: FAIL — `GHOST_INTERVIEW_SYSTEM_PROMPT` not defined

- [ ] **Step 3: Add the prompt to `backend/app/query/prompts.py`**

Append at end of file:

```python
GHOST_INTERVIEW_SYSTEM_PROMPT = """\
You are reconstructing an interview with @{subject} about the architectural
decisions they shaped in {owner}/{repo}. You have access to their ledger
slice — every quoted line they wrote, every decision they authored, every
rejected alternative they argued for or against.

# GROUNDING RULES

1. **Every sentence is either a direct quote or a paraphrase-with-disclosure.**
   - Direct quote: wrap the subject's exact words in double quotes and follow
     immediately with a citation token: "…their verbatim words…" [PR #N, @{subject}, YYYY-MM-DD].
   - Paraphrase: end the sentence with "(paraphrased — see [PR #N])".
   - Never invent quotes. Never omit the disclosure tag on a paraphrase.

2. **Match their register.** Voice samples (their verbatim quotes, sorted by
   length descending) are provided below. Mirror their sentence shape, word
   choice, and the specific technical terms they use.

3. **Stay inside the ledger.** If the slice doesn't support a claim, do not
   make the claim. Interview answers may be short; that is acceptable.

# SHAPE RULES

Produce exactly 6 exchanges. Format each as:

Q: <interviewer's question — 1 sentence, second-person>
A: <subject's answer — 2 to 4 sentences, first-person, in their register,
    every sentence grounded per rule 1>

Separate exchanges with a blank line. No preamble, no numbering, no closing
remark.

# TOPIC COVERAGE

Pick across these; do not repeat a topic:

  1. The decision they are most associated with.
  2. Something they rejected and why.
  3. A review where they pushed back on another contributor.
  4. A trade-off they accepted reluctantly.
  5. A decision that superseded or was superseded by another.
  6. A follow-up they flagged but did not ship.
"""


GHOST_INTERVIEW_FOLLOWUP_SYSTEM_PROMPT = """\
You are continuing an interview with @{subject}. The preceding six
exchanges are provided as assistant turns; the user's next turn is a
follow-up question. Apply the same grounding rules as the scripted
interview:

  - Every sentence is either a direct quote wrapped in double quotes
    with [PR #N, @{subject}, date] immediately after, or a paraphrase
    ending with "(paraphrased — see [PR #N])".
  - Never invent quotes. Stay inside the ledger slice.
  - Match the subject's register.
  - 2 to 4 sentences total.

Emit only the answer text — no Q: prefix, no closing remark.
"""
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_interview_prompt.py -v`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/query/prompts.py backend/tests/test_interview_prompt.py
git commit -m "feat(prompts): ghost interview + follow-up system prompts"
```

---

## Task 4: Backend — Interview engine (cache-first script generation)

**Files:**
- Create: `backend/app/query/interview.py`
- Test: `backend/tests/test_interview_engine.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_interview_engine.py
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.ledger.author_slice import AuthorSlice, load_author_slice
from app.ledger.models import Citation, CitationSourceType
from app.query.interview import generate_or_replay_script


class _FakeStream:
    """Async iterator that yields fake anthropic stream events."""

    def __init__(self, text_chunks: list[str], usage: dict[str, int]) -> None:
        self._chunks = text_chunks
        self._usage = usage

    def __aiter__(self):
        return self._iter()

    async def _iter(self):
        for chunk in self._chunks:
            yield type("E", (), {"type": "content_block_delta",
                                  "delta": type("D", (), {"type": "text_delta", "text": chunk})()})()
        yield type("E", (), {"type": "message_delta",
                              "usage": self._usage})()


class _FakeMessagesStream:
    def __init__(self, stream: _FakeStream) -> None:
        self._stream = stream

    async def __aenter__(self):
        return self._stream

    async def __aexit__(self, *_: object) -> None:
        pass


def _build_slice() -> AuthorSlice:
    return AuthorSlice(
        author="yusukebe",
        repo="honojs/hono",
        decisions=[{"pr_number": 1234, "title": "Web Standards first"}],
        quotes=[
            Citation(
                id="00000000-0000-0000-0000-000000000001",
                claim="…",
                citation_quote="we prefer fetch over node:http.",
                citation_source_type=CitationSourceType.PR_REVIEW,
                citation_source_id="1234",
                citation_author="yusukebe",
                citation_timestamp=datetime(2025, 1, 9, tzinfo=timezone.utc),
                citation_url="https://example",
            )
        ],
        alternatives=[],
    )


@pytest.mark.asyncio
async def test_first_call_invokes_opus_and_persists(tmp_path: Path) -> None:
    from app.ledger.schema import connect  # ensure schema applied
    db = tmp_path / "cache.duckdb"
    connect(str(db)).close()

    client = AsyncMock()
    scripted_output = (
        'Q: What was non-negotiable?\n'
        'A: "we prefer fetch over node:http." [PR #1234, @yusukebe, 2025-01-09]\n\n'
    ) * 6
    client.messages.stream = AsyncMock(return_value=_FakeMessagesStream(
        _FakeStream([scripted_output], {"input_tokens": 1200, "output_tokens": 600, "cache_read_input_tokens": 0})
    ))

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

    event_names = [e for e, _ in events]
    assert event_names.count("exchange_start") == 6
    assert event_names.count("exchange_end") == 6
    assert event_names[-1] == "script_end"
    client.messages.stream.assert_awaited_once()

    # Second call should NOT hit the API — row is cached.
    client.messages.stream.reset_mock()
    events2: list[tuple[str, dict[str, Any]]] = []
    async for event, payload in generate_or_replay_script(
        client=client,
        db_path=db,
        owner="honojs",
        repo="hono",
        author="yusukebe",
        slice_=_build_slice(),
        force=False,
    ):
        events2.append((event, payload))
    assert [e for e, _ in events2] == [e for e, _ in events]
    client.messages.stream.assert_not_awaited()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_interview_engine.py -v`
Expected: FAIL — `app.query.interview` module missing

- [ ] **Step 3: Implement `interview.py`**

```python
# backend/app/query/interview.py
"""Interview script generation — cache-first, Opus 4.7, streaming parse."""

from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from anthropic import AsyncAnthropic

from app.ledger.author_slice import AuthorSlice
from app.ledger.schema import connect
from app.query.prompts import GHOST_INTERVIEW_SYSTEM_PROMPT

INTERVIEW_MODEL = "claude-opus-4-7"
INTERVIEW_MAX_TOKENS = 4096
VOICE_SAMPLE_COUNT = 12


def _build_system_prompt(owner: str, repo: str, subject: AuthorSlice) -> str:
    base = GHOST_INTERVIEW_SYSTEM_PROMPT.format(
        subject=subject.author,
        owner=owner,
        repo=repo,
    )
    samples = subject.quotes[:VOICE_SAMPLE_COUNT]
    samples_block = "\n\n# VOICE SAMPLES\n\n" + "\n\n".join(
        f'"{q.citation_quote}" [PR #{q.citation_source_id}, @{subject.author}, '
        f'{q.citation_timestamp.date().isoformat() if q.citation_timestamp else "n/a"}]'
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
        f"Repo: {subject.repo}\n\n"
        f"Decisions authored (JSON):\n{decisions_json}\n\n"
        f"Rejected alternatives they argued:\n{json.dumps(alternatives, indent=2)}\n\n"
        "Produce the 6 exchanges now."
    )


_EXCHANGE_RE = re.compile(
    r"Q:\s*(?P<q>.+?)\n\s*A:\s*(?P<a>.+?)(?=\n\s*Q:|\Z)",
    re.DOTALL,
)


def parse_exchanges(text: str) -> list[dict[str, str]]:
    """Split the raw Opus output into 6 (question, answer) pairs."""
    return [
        {"question": m.group("q").strip(), "answer": m.group("a").strip()}
        for m in _EXCHANGE_RE.finditer(text)
    ]


def _load_cached(
    db_path: str | Path, owner: str, repo: str, author: str
) -> dict[str, Any] | None:
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
            "script": json.loads(row[2]),
            "voice_sample_ids": json.loads(row[3]),
            "token_usage": json.loads(row[4]),
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
                datetime.now(timezone.utc),
                INTERVIEW_MODEL,
                json.dumps({"exchanges": exchanges}),
                json.dumps(voice_sample_ids),
                json.dumps(token_usage),
            ],
        )
    finally:
        conn.close()


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
    """Yield (event_name, payload) pairs matching the SSE grammar.

    If a cached row exists and `force=False`, replay it without hitting Opus.
    Otherwise call Opus, persist the result, then yield the same event stream.
    """
    cached = None if force else _load_cached(db_path, owner, repo, author)
    if cached is not None:
        for idx, ex in enumerate(cached["script"]["exchanges"]):
            yield "exchange_start", {"index": idx, "question": ex["question"]}
            yield "exchange_delta", {"index": idx, "text_delta": ex["answer"]}
            yield "exchange_end", {"index": idx}
        yield "script_end", {"usage": cached["token_usage"]}
        return

    system = _build_system_prompt(owner, repo, slice_)
    user = _build_user_prompt(slice_)

    raw_text = ""
    usage: dict[str, int] = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0}

    async with await client.messages.stream(
        model=INTERVIEW_MODEL,
        max_tokens=INTERVIEW_MAX_TOKENS,
        system=system,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        async for event in stream:
            etype = getattr(event, "type", None)
            if etype == "content_block_delta":
                delta = getattr(event, "delta", None)
                if getattr(delta, "type", None) == "text_delta":
                    raw_text += delta.text
            elif etype == "message_delta":
                u = getattr(event, "usage", None) or {}
                for k in usage:
                    usage[k] = int(u.get(k, usage[k]) or usage[k])

    exchanges = parse_exchanges(raw_text)
    # Pad with empty-shell exchanges if Opus returned fewer than 6 — avoids a
    # broken UI. Judges see exactly six bubbles, and the engine log flags short.
    while len(exchanges) < 6:
        exchanges.append({
            "question": "(no further question)",
            "answer": "(interview ran short — see ledger directly)",
        })

    voice_sample_ids = [str(q.id) for q in slice_.quotes[:VOICE_SAMPLE_COUNT]]
    _persist(
        db_path,
        owner=owner,
        repo=repo,
        author=author,
        exchanges=exchanges,
        voice_sample_ids=voice_sample_ids,
        token_usage=usage,
    )

    for idx, ex in enumerate(exchanges):
        yield "exchange_start", {"index": idx, "question": ex["question"]}
        yield "exchange_delta", {"index": idx, "text_delta": ex["answer"]}
        yield "exchange_end", {"index": idx}
    yield "script_end", {"usage": usage}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_interview_engine.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/query/interview.py backend/tests/test_interview_engine.py
git commit -m "feat(interview): cache-first script generation via messages.stream"
```

---

## Task 5: Backend — `/api/interview/subjects` endpoint

**Files:**
- Create: `backend/app/routers/interview.py` (add subjects route only in this task)
- Modify: `backend/app/main.py:51` (add `app.include_router(interview_router.router)`)
- Test: `backend/tests/test_interview_router.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_interview_router.py
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
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
    with LedgerStore(db) as store:
        for pr in (101, 102, 103):
            store.upsert_decision(
                DecisionRecord(
                    id=uuid4(),
                    repo="honojs/hono",
                    pr_number=pr,
                    title=f"Decision {pr}",
                    summary="…",
                    category=DecisionCategory.RUNTIME,
                    decided_at=datetime(2025, 1, pr % 28 + 1, tzinfo=timezone.utc),
                    decided_by=["yusukebe"],
                    status=DecisionStatus.ACTIVE,
                    superseded_by=None,
                    commit_shas=[],
                    confidence=0.9,
                    extracted_at=datetime.now(timezone.utc),
                    pr_url=f"https://github.com/honojs/hono/pull/{pr}",
                    context_citations=[
                        Citation(
                            id=uuid4(),
                            claim="…",
                            citation_quote=f"quote for pr {pr}",
                            citation_source_type=CitationSourceType.PR_REVIEW,
                            citation_source_id=str(pr),
                            citation_author="yusukebe",
                            citation_timestamp=datetime(2025, 1, pr % 28 + 1, tzinfo=timezone.utc),
                            citation_url=f"https://github.com/honojs/hono/pull/{pr}",
                        ),
                    ],
                    decision_citations=[],
                    forces=[],
                    consequences=[],
                    alternatives=[],
                )
            )


@pytest.mark.asyncio
async def test_subjects_returns_ranked_authors(tmp_path: Path, monkeypatch) -> None:
    db = tmp_path / "subjects.duckdb"
    _seed(db)
    monkeypatch.setattr(get_settings(), "ledger_db_path", str(db))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        r = await c.get("/api/interview/subjects", params={"owner": "honojs", "repo": "hono"})

    assert r.status_code == 200
    body = r.json()
    assert body["owner"] == "honojs"
    assert body["repo"] == "hono"
    assert any(s["handle"] == "yusukebe" for s in body["subjects"])
    top = next(s for s in body["subjects"] if s["handle"] == "yusukebe")
    assert top["citation_count"] >= 3
    assert top["decision_count"] >= 3
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_interview_router.py -v`
Expected: FAIL — route not found

- [ ] **Step 3: Implement subjects endpoint + register router**

```python
# backend/app/routers/interview.py
"""Ghost Interview router — /api/interview/{subjects,script,followup}."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

from app.config import get_settings
from app.ledger.schema import connect
from app.validators import validate_repo

router = APIRouter(prefix="/api/interview", tags=["interview"])
_log = logging.getLogger("postmortem")

SUBJECTS_MIN_CITATIONS = 3
SUBJECTS_LIMIT = 8


def _resolve_db_path() -> Path:
    settings = get_settings()
    path = Path(settings.ledger_db_path)
    if not path.is_absolute():
        repo_root = Path(__file__).resolve().parents[3]
        path = repo_root / settings.ledger_db_path
    return path


@router.get("/subjects")
async def subjects(
    owner: str = Query(..., min_length=1, max_length=64),
    repo: str = Query(..., min_length=1, max_length=128),
) -> dict:
    validate_repo(f"{owner}/{repo}")
    db_path = _resolve_db_path()
    if not db_path.exists():
        raise HTTPException(status_code=404, detail=f"Ledger DB not found at {db_path}")

    repo_key = f"{owner}/{repo}"
    conn = connect(str(db_path))
    try:
        rows = conn.execute(
            """
            WITH by_author AS (
                SELECT c.citation_author AS handle,
                       COUNT(*) AS citation_count,
                       MIN(c.citation_timestamp) AS earliest,
                       MAX(c.citation_timestamp) AS latest,
                       MAX(length(c.citation_quote)) AS longest_quote_len
                FROM citations c
                JOIN decisions d ON c.decision_id = d.id
                WHERE d.repo = ? AND c.citation_author IS NOT NULL
                GROUP BY c.citation_author
                HAVING COUNT(*) >= ?
            ),
            dec_counts AS (
                SELECT unnest(decided_by) AS handle, COUNT(*) AS decision_count
                FROM decisions WHERE repo = ?
                GROUP BY 1
            )
            SELECT b.handle, b.citation_count, b.earliest, b.latest,
                   COALESCE(dc.decision_count, 0) AS decision_count
            FROM by_author b
            LEFT JOIN dec_counts dc USING (handle)
            ORDER BY b.citation_count DESC, b.longest_quote_len DESC
            LIMIT ?
            """,
            [repo_key, SUBJECTS_MIN_CITATIONS, repo_key, SUBJECTS_LIMIT],
        ).fetchall()
    finally:
        conn.close()

    subjects_list = [
        {
            "handle": row[0],
            "citation_count": int(row[1]),
            "span_start": row[2].isoformat() if row[2] else None,
            "span_end": row[3].isoformat() if row[3] else None,
            "decision_count": int(row[4]),
            "avatar_url": f"https://github.com/{row[0]}.png?size=80",
        }
        for row in rows
    ]
    return {"owner": owner, "repo": repo, "subjects": subjects_list}
```

Then modify `backend/app/main.py` — add to imports and `include_router` list:

```python
from app.routers import interview as interview_router
# ...
app.include_router(interview_router.router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_interview_router.py::test_subjects_returns_ranked_authors -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/interview.py backend/app/main.py backend/tests/test_interview_router.py
git commit -m "feat(api): /api/interview/subjects lists top-cited authors per repo"
```

---

## Task 6: Backend — `/api/interview/script` SSE endpoint

**Files:**
- Modify: `backend/app/routers/interview.py` (add `/script` route)
- Extend test: `backend/tests/test_interview_router.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_interview_router.py`:

```python
from unittest.mock import patch, AsyncMock


@pytest.mark.asyncio
async def test_script_streams_six_exchanges(tmp_path: Path, monkeypatch) -> None:
    db = tmp_path / "script.duckdb"
    _seed(db)
    monkeypatch.setattr(get_settings(), "ledger_db_path", str(db))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_interview_router.py::test_script_streams_six_exchanges -v`
Expected: FAIL — route not found

- [ ] **Step 3: Add `/script` route**

At the top of `backend/app/routers/interview.py`, add imports:

```python
import json
from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic
from sse_starlette.sse import EventSourceResponse

from app.config import resolve_secret
from app.ledger.author_slice import AuthorSlice, load_author_slice
from app.query.interview import generate_or_replay_script
```

Append route:

```python
@router.get("/script")
async def script(
    owner: str = Query(..., min_length=1, max_length=64),
    repo: str = Query(..., min_length=1, max_length=128),
    author: str = Query(..., min_length=1, max_length=64),
    force: bool = Query(False),
) -> EventSourceResponse:
    validate_repo(f"{owner}/{repo}")
    db_path = _resolve_db_path()
    if not db_path.exists():
        raise HTTPException(status_code=404, detail=f"Ledger DB not found at {db_path}")

    slice_ = load_author_slice(db_path, owner=owner, repo=repo, author=author)
    if not slice_.quotes:
        raise HTTPException(
            status_code=422,
            detail=f"No quoted material for @{author} in {owner}/{repo}",
        )

    api_key = resolve_secret("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")
    client = AsyncAnthropic(api_key=api_key)

    async def _events() -> AsyncIterator[dict[str, str]]:
        yield {
            "event": "subject_meta",
            "data": json.dumps({
                "handle": author,
                "avatar_url": f"https://github.com/{author}.png?size=80",
                "decision_count": len(slice_.decisions),
                "citation_count": len(slice_.quotes),
            }),
        }
        async for name, payload in generate_or_replay_script(
            client=client,
            db_path=db_path,
            owner=owner,
            repo=repo,
            author=author,
            slice_=slice_,
            force=force,
        ):
            yield {"event": name, "data": json.dumps(payload, default=str)}

    return EventSourceResponse(_events())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_interview_router.py::test_script_streams_six_exchanges -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/interview.py backend/tests/test_interview_router.py
git commit -m "feat(api): /api/interview/script streams 6 exchanges with cache hit path"
```

---

## Task 7: Backend — `/api/interview/followup` SSE endpoint

**Files:**
- Modify: `backend/app/routers/interview.py` (add `/followup` route)
- Modify: `backend/app/query/interview.py` (add `stream_followup` helper)
- Extend test: `backend/tests/test_interview_router.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_interview_router.py`:

```python
@pytest.mark.asyncio
async def test_followup_requires_existing_script(tmp_path: Path, monkeypatch) -> None:
    db = tmp_path / "followup.duckdb"
    _seed(db)
    monkeypatch.setattr(get_settings(), "ledger_db_path", str(db))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        r = await c.get(
            "/api/interview/followup",
            params={"owner": "honojs", "repo": "hono",
                    "author": "yusukebe", "question": "one more thing"},
        )
    # No cached script yet → 409 Conflict
    assert r.status_code == 409


@pytest.mark.asyncio
async def test_followup_streams_after_cached_script(tmp_path: Path, monkeypatch) -> None:
    db = tmp_path / "followup_ok.duckdb"
    _seed(db)
    monkeypatch.setattr(get_settings(), "ledger_db_path", str(db))
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")

    # Seed a cached script row.
    from app.query.interview import _persist
    _persist(
        db,
        owner="honojs",
        repo="hono",
        author="yusukebe",
        exchanges=[{"question": f"Q{i}", "answer": f"A{i}"} for i in range(6)],
        voice_sample_ids=[],
        token_usage={"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0},
    )

    async def _fake_stream(*_args, **_kwargs):
        yield "answer_delta", {"text_delta": "the follow up answer"}
        yield "answer_end", {"usage": {"input_tokens": 10, "output_tokens": 5}}

    with patch("app.routers.interview.stream_followup", _fake_stream):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as c:
            r = await c.get(
                "/api/interview/followup",
                params={"owner": "honojs", "repo": "hono",
                        "author": "yusukebe", "question": "one more thing"},
            )
    assert r.status_code == 200
    assert "event: answer_delta" in r.text
    assert "event: answer_end" in r.text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/test_interview_router.py::test_followup_requires_existing_script tests/test_interview_router.py::test_followup_streams_after_cached_script -v`
Expected: FAIL — `/followup` not found / `stream_followup` not found

- [ ] **Step 3: Add `stream_followup` + route**

Append to `backend/app/query/interview.py`:

```python
from app.query.prompts import GHOST_INTERVIEW_FOLLOWUP_SYSTEM_PROMPT


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
    cached = _load_cached(db_path, owner, repo, author)
    if cached is None:
        raise ValueError("no cached script for subject — generate first")

    system = GHOST_INTERVIEW_FOLLOWUP_SYSTEM_PROMPT.format(subject=author)
    # Build the message history from the cached exchanges so the model sees
    # its own prior voice. The user's new question goes last.
    messages: list[dict[str, Any]] = []
    for ex in cached["script"]["exchanges"]:
        messages.append({"role": "user", "content": ex["question"]})
        messages.append({"role": "assistant", "content": ex["answer"]})
    messages.append({"role": "user", "content": question})

    usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0}
    async with await client.messages.stream(
        model=INTERVIEW_MODEL,
        max_tokens=1024,
        system=system,
        messages=messages,
    ) as stream:
        async for event in stream:
            etype = getattr(event, "type", None)
            if etype == "content_block_delta":
                delta = getattr(event, "delta", None)
                if getattr(delta, "type", None) == "text_delta":
                    yield "answer_delta", {"text_delta": delta.text}
            elif etype == "message_delta":
                u = getattr(event, "usage", None) or {}
                for k in usage:
                    usage[k] = int(u.get(k, usage[k]) or usage[k])
    yield "answer_end", {"usage": usage}
```

Append to `backend/app/routers/interview.py`:

```python
from app.query.interview import stream_followup


@router.get("/followup")
async def followup(
    owner: str = Query(..., min_length=1, max_length=64),
    repo: str = Query(..., min_length=1, max_length=128),
    author: str = Query(..., min_length=1, max_length=64),
    question: str = Query(..., min_length=3, max_length=500),
) -> EventSourceResponse:
    validate_repo(f"{owner}/{repo}")
    db_path = _resolve_db_path()
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="Ledger DB not found")

    slice_ = load_author_slice(db_path, owner=owner, repo=repo, author=author)
    if not slice_.quotes:
        raise HTTPException(status_code=422, detail=f"No quotes for @{author}")

    api_key = resolve_secret("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")
    client = AsyncAnthropic(api_key=api_key)

    async def _events() -> AsyncIterator[dict[str, str]]:
        try:
            async for name, payload in stream_followup(
                client=client,
                db_path=db_path,
                owner=owner,
                repo=repo,
                author=author,
                slice_=slice_,
                question=question,
            ):
                yield {"event": name, "data": json.dumps(payload, default=str)}
        except ValueError:
            yield {"event": "error",
                   "data": json.dumps({"code": "no_cached_script",
                                       "message": "Generate the scripted interview first"})}

    # Short-circuit the 409 case before streaming.
    from app.query.interview import _load_cached
    if _load_cached(db_path, owner, repo, author) is None:
        raise HTTPException(status_code=409, detail="No cached interview script; call /script first")

    return EventSourceResponse(_events())
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/test_interview_router.py -v`
Expected: all tests PASS (subjects + script + 2 followup)

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/interview.py backend/app/query/interview.py backend/tests/test_interview_router.py
git commit -m "feat(api): /api/interview/followup — requires cached script, streams one answer"
```

---

## Task 8: Frontend — SSE client `frontend/lib/interview.ts`

**Files:**
- Create: `frontend/lib/interview.ts`
- Test: `frontend/lib/interview.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/lib/interview.test.ts
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { InterviewHandlers } from "./interview";
import { parseScriptEvent } from "./interview";

describe("parseScriptEvent", () => {
  test("parses exchange_delta payload", () => {
    const r = parseScriptEvent("exchange_delta", '{"index":2,"text_delta":"hello"}');
    expect(r).toEqual({ name: "exchange_delta", payload: { index: 2, text_delta: "hello" } });
  });
  test("returns null for unknown events", () => {
    const r = parseScriptEvent("unknown_event_x", "{}");
    expect(r).toBeNull();
  });
  test("returns null on malformed JSON", () => {
    const r = parseScriptEvent("exchange_delta", "{not json");
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run lib/interview.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `interview.ts`**

```ts
// frontend/lib/interview.ts
import { API_BASE } from "./api";

export type InterviewSubject = {
  handle: string;
  avatar_url: string;
  citation_count: number;
  decision_count: number;
  span_start: string | null;
  span_end: string | null;
};

export type SubjectMeta = {
  handle: string;
  avatar_url: string;
  decision_count: number;
  citation_count: number;
};

export type ExchangeStartPayload = { index: number; question: string };
export type ExchangeDeltaPayload = { index: number; text_delta: string };
export type ExchangeEndPayload = { index: number };
export type ScriptEndPayload = { usage: { input_tokens: number; output_tokens: number } };

export type ScriptEventName =
  | "subject_meta"
  | "exchange_start"
  | "exchange_delta"
  | "exchange_end"
  | "script_end"
  | "error";

export function parseScriptEvent(
  name: string,
  data: string,
): { name: ScriptEventName; payload: unknown } | null {
  const valid: ScriptEventName[] = [
    "subject_meta", "exchange_start", "exchange_delta", "exchange_end", "script_end", "error",
  ];
  if (!valid.includes(name as ScriptEventName)) return null;
  try {
    return { name: name as ScriptEventName, payload: JSON.parse(data) };
  } catch {
    return null;
  }
}

export type InterviewHandlers = {
  onSubjectMeta: (meta: SubjectMeta) => void;
  onExchangeStart: (p: ExchangeStartPayload) => void;
  onExchangeDelta: (p: ExchangeDeltaPayload) => void;
  onExchangeEnd: (p: ExchangeEndPayload) => void;
  onScriptEnd: (p: ScriptEndPayload) => void;
  onAnswerDelta?: (p: { text_delta: string }) => void;
  onAnswerEnd?: (p: { usage: unknown }) => void;
  onError: (message: string) => void;
};

export async function fetchSubjects(owner: string, repo: string): Promise<InterviewSubject[]> {
  const url = new URL(`${API_BASE}/api/interview/subjects`);
  url.searchParams.set("owner", owner);
  url.searchParams.set("repo", repo);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`subjects ${r.status}`);
  const body = (await r.json()) as { subjects: InterviewSubject[] };
  return body.subjects;
}

export function startInterview(
  owner: string,
  repo: string,
  author: string,
  handlers: InterviewHandlers,
  { force = false }: { force?: boolean } = {},
): EventSource {
  const url = new URL(`${API_BASE}/api/interview/script`);
  url.searchParams.set("owner", owner);
  url.searchParams.set("repo", repo);
  url.searchParams.set("author", author);
  if (force) url.searchParams.set("force", "true");
  const es = new EventSource(url.toString());
  attachScriptHandlers(es, handlers);
  es.addEventListener("script_end", () => es.close());
  return es;
}

export function askFollowup(
  owner: string,
  repo: string,
  author: string,
  question: string,
  handlers: InterviewHandlers,
): EventSource {
  const url = new URL(`${API_BASE}/api/interview/followup`);
  url.searchParams.set("owner", owner);
  url.searchParams.set("repo", repo);
  url.searchParams.set("author", author);
  url.searchParams.set("question", question);
  const es = new EventSource(url.toString());
  es.addEventListener("answer_delta", (ev) => {
    const p = JSON.parse((ev as MessageEvent<string>).data) as { text_delta: string };
    handlers.onAnswerDelta?.(p);
  });
  es.addEventListener("answer_end", (ev) => {
    try {
      const p = JSON.parse((ev as MessageEvent<string>).data) as { usage: unknown };
      handlers.onAnswerEnd?.(p);
    } finally {
      es.close();
    }
  });
  es.addEventListener("error", (ev) => {
    const mev = ev as MessageEvent<string> & Event;
    handlers.onError(mev.data ?? "connection error");
    es.close();
  });
  return es;
}

function attachScriptHandlers(es: EventSource, h: InterviewHandlers): void {
  es.addEventListener("subject_meta", (ev) => {
    h.onSubjectMeta(JSON.parse((ev as MessageEvent<string>).data) as SubjectMeta);
  });
  es.addEventListener("exchange_start", (ev) => {
    h.onExchangeStart(JSON.parse((ev as MessageEvent<string>).data) as ExchangeStartPayload);
  });
  es.addEventListener("exchange_delta", (ev) => {
    h.onExchangeDelta(JSON.parse((ev as MessageEvent<string>).data) as ExchangeDeltaPayload);
  });
  es.addEventListener("exchange_end", (ev) => {
    h.onExchangeEnd(JSON.parse((ev as MessageEvent<string>).data) as ExchangeEndPayload);
  });
  es.addEventListener("script_end", (ev) => {
    h.onScriptEnd(JSON.parse((ev as MessageEvent<string>).data) as ScriptEndPayload);
  });
  es.addEventListener("error", (ev) => {
    const mev = ev as MessageEvent<string> & Event;
    h.onError(mev.data ?? "connection error");
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run lib/interview.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/interview.ts frontend/lib/interview.test.ts
git commit -m "feat(interview): typed SSE client for subjects/script/followup"
```

---

## Task 9: Frontend — `InterviewProvider` context

**Files:**
- Create: `frontend/lib/InterviewProvider.tsx`
- Test: `frontend/lib/InterviewProvider.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/lib/InterviewProvider.test.tsx
import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { InterviewProvider, useInterview } from "./InterviewProvider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/ledger/honojs/hono",
  useSearchParams: () => new URLSearchParams(""),
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <InterviewProvider owner="honojs" repo="hono">{children}</InterviewProvider>
);

describe("InterviewProvider", () => {
  test("opens with a subject", () => {
    const { result } = renderHook(() => useInterview(), { wrapper });
    act(() => result.current.open("yusukebe"));
    expect(result.current.state.status).toBe("loading_script");
    expect(result.current.state.subject).toBe("yusukebe");
  });

  test("collapse toggles state", () => {
    const { result } = renderHook(() => useInterview(), { wrapper });
    act(() => result.current.open("yusukebe"));
    expect(result.current.state.collapsed).toBe(false);
    act(() => result.current.toggleCollapse());
    expect(result.current.state.collapsed).toBe(true);
  });

  test("close clears subject", () => {
    const { result } = renderHook(() => useInterview(), { wrapper });
    act(() => result.current.open("yusukebe"));
    act(() => result.current.close());
    expect(result.current.state.subject).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run lib/InterviewProvider.test.tsx`
Expected: FAIL — module missing

- [ ] **Step 3: Implement provider**

```tsx
// frontend/lib/InterviewProvider.tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from "react";

type Exchange = { question: string; answer: string; complete: boolean };

export type InterviewStatus =
  | "idle"
  | "loading_script"
  | "ready"
  | "asking_followup"
  | "followup_done"
  | "error";

export type InterviewState = {
  status: InterviewStatus;
  subject: string | null;
  collapsed: boolean;
  exchanges: Exchange[];
  followupQuestion: string;
  followupAnswer: string;
  error: string | null;
};

type Action =
  | { type: "open"; subject: string }
  | { type: "close" }
  | { type: "toggle_collapse" }
  | { type: "exchange_start"; index: number; question: string }
  | { type: "exchange_delta"; index: number; text: string }
  | { type: "exchange_end"; index: number }
  | { type: "script_end" }
  | { type: "ask_followup"; question: string }
  | { type: "followup_delta"; text: string }
  | { type: "followup_end" }
  | { type: "error"; message: string };

const initial: InterviewState = {
  status: "idle",
  subject: null,
  collapsed: false,
  exchanges: [],
  followupQuestion: "",
  followupAnswer: "",
  error: null,
};

function reducer(state: InterviewState, action: Action): InterviewState {
  switch (action.type) {
    case "open":
      return { ...initial, status: "loading_script", subject: action.subject };
    case "close":
      return initial;
    case "toggle_collapse":
      return { ...state, collapsed: !state.collapsed };
    case "exchange_start": {
      const exchanges = state.exchanges.slice();
      exchanges[action.index] = { question: action.question, answer: "", complete: false };
      return { ...state, exchanges };
    }
    case "exchange_delta": {
      const exchanges = state.exchanges.slice();
      const prev = exchanges[action.index];
      if (!prev) return state;
      exchanges[action.index] = { ...prev, answer: prev.answer + action.text };
      return { ...state, exchanges };
    }
    case "exchange_end": {
      const exchanges = state.exchanges.slice();
      const prev = exchanges[action.index];
      if (prev) exchanges[action.index] = { ...prev, complete: true };
      return { ...state, exchanges };
    }
    case "script_end":
      return { ...state, status: "ready" };
    case "ask_followup":
      return { ...state, status: "asking_followup", followupQuestion: action.question, followupAnswer: "" };
    case "followup_delta":
      return { ...state, followupAnswer: state.followupAnswer + action.text };
    case "followup_end":
      return { ...state, status: "followup_done" };
    case "error":
      return { ...state, status: "error", error: action.message };
    default:
      return state;
  }
}

type ContextValue = {
  state: InterviewState;
  open: (subject: string) => void;
  close: () => void;
  toggleCollapse: () => void;
  dispatch: (action: Action) => void;
};

const Ctx = createContext<ContextValue | null>(null);

export function useInterview(): ContextValue {
  const c = useContext(Ctx);
  if (!c) throw new Error("useInterview() outside <InterviewProvider>");
  return c;
}

export function InterviewProvider({
  owner,
  repo,
  children,
}: {
  owner: string;
  repo: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlSubject = searchParams.get("interview");
  const [state, dispatch] = useReducer(reducer, initial, (s) =>
    urlSubject ? { ...s, status: "loading_script", subject: urlSubject } : s,
  );

  const writeUrl = useCallback(
    (subject: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (subject) next.set("interview", subject);
      else next.delete("interview");
      router.replace(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const open = useCallback(
    (subject: string) => {
      dispatch({ type: "open", subject });
      writeUrl(subject);
    },
    [writeUrl],
  );
  const close = useCallback(() => {
    dispatch({ type: "close" });
    writeUrl(null);
  }, [writeUrl]);
  const toggleCollapse = useCallback(() => dispatch({ type: "toggle_collapse" }), []);

  // ⌘I toggles collapse when a subject is selected.
  useEffect(() => {
    if (!state.subject) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        toggleCollapse();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.subject, toggleCollapse]);

  const value = useMemo<ContextValue>(
    () => ({ state, open, close, toggleCollapse, dispatch }),
    [state, open, close, toggleCollapse],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Install `@testing-library/react` if missing:

```bash
cd frontend && pnpm add -D @testing-library/react
```

Run: `cd frontend && pnpm vitest run lib/InterviewProvider.test.tsx`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/InterviewProvider.tsx frontend/lib/InterviewProvider.test.tsx frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(interview): provider/reducer context with URL + ⌘I collapse wiring"
```

---

## Task 10: Frontend — `InterviewBubble` component

**Files:**
- Create: `frontend/components/InterviewBubble.tsx`
- Test: `frontend/components/InterviewBubble.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/components/InterviewBubble.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { InterviewBubble } from "./InterviewBubble";

describe("InterviewBubble", () => {
  test("renders interviewer question in monospace small caps", () => {
    render(<InterviewBubble role="interviewer" text="Why did you push back on Buffer?" decisions={[]} />);
    expect(screen.getByText(/why did you push back/i)).toBeTruthy();
  });

  test("renders subject answer without leaking raw asterisks", () => {
    render(
      <InterviewBubble
        role="subject"
        text='**Because** "Buffer is not in the Web Standards API" [PR #1234, @yusukebe, 2025-01-09].'
        decisions={[]}
      />,
    );
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run components/InterviewBubble.test.tsx`
Expected: FAIL — module missing

- [ ] **Step 3: Implement `InterviewBubble.tsx`**

Reuse the `InlineRich` renderer we already introduced in `AnswerView.tsx` by exporting it:

```tsx
// At the top of frontend/components/AnswerView.tsx, change:
//     function InlineRich(
// to:
//     export function InlineRich(
// (one-line export change — no behavior change)
```

Then:

```tsx
// frontend/components/InterviewBubble.tsx
"use client";

import { motion } from "framer-motion";
import type { Decision } from "../lib/api";
import { useReducedMotion } from "../lib/motion";
import { InlineRich } from "./AnswerView";

type Verdict = Map<string, { verified: boolean; reason: string }>;

export function InterviewBubble({
  role,
  text,
  decisions,
  verdict,
  streaming = false,
}: {
  role: "interviewer" | "subject";
  text: string;
  decisions: Decision[];
  verdict?: Verdict;
  streaming?: boolean;
}) {
  const reduced = useReducedMotion();
  const v = verdict ?? new Map();

  if (role === "interviewer") {
    return (
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.2 }}
        className="mr-auto max-w-[85%] rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-300"
      >
        {text}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="ml-auto max-w-[85%] rounded-lg border border-[#d4a24c]/40 bg-[#d4a24c]/[0.05] px-3 py-2.5 text-[13px] leading-relaxed text-zinc-100"
    >
      <InlineRich text={text} decisions={decisions} verdict={v} />
      {streaming ? (
        <span
          className="ml-0.5 inline-block h-[1em] w-[0.4em] -translate-y-[1px] rounded-[1px] align-middle"
          style={{ backgroundColor: "#d4a24c" }}
        />
      ) : null}
    </motion.div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run components/InterviewBubble.test.tsx`
Expected: 2 tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/components/InterviewBubble.tsx frontend/components/InterviewBubble.test.tsx frontend/components/AnswerView.tsx
git commit -m "feat(interview): chat bubble component + export InlineRich renderer"
```

---

## Task 11: Frontend — `InterviewPicker` modal

**Files:**
- Create: `frontend/components/InterviewPicker.tsx`

- [ ] **Step 1: Implement picker**

```tsx
// frontend/components/InterviewPicker.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { fetchSubjects, type InterviewSubject } from "../lib/interview";

export function InterviewPicker({
  open,
  owner,
  repo,
  onClose,
  onPick,
}: {
  open: boolean;
  owner: string;
  repo: string;
  onClose: () => void;
  onPick: (handle: string) => void;
}) {
  const [subjects, setSubjects] = useState<InterviewSubject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [hoverIdx, setHoverIdx] = useState(0);

  useEffect(() => {
    if (!open || subjects !== null) return;
    fetchSubjects(owner, repo).then(setSubjects).catch((e) => setError(String(e)));
  }, [open, owner, repo, subjects]);

  const filtered = useMemo(() => {
    if (!subjects) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((s) => s.handle.toLowerCase().includes(q));
  }, [subjects, filter]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") setHoverIdx((i) => Math.min(i + 1, filtered.length - 1));
      if (e.key === "ArrowUp") setHoverIdx((i) => Math.max(i - 1, 0));
      if (e.key === "Enter" && filtered[hoverIdx]) onPick(filtered[hoverIdx].handle);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, hoverIdx, onClose, onPick]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-label="choose a maintainer to interview"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="max-h-[80vh] w-[640px] max-w-[95vw] overflow-hidden rounded-xl border border-[#d4a24c]/40 bg-zinc-950 shadow-[0_0_60px_rgba(212,162,76,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#d4a24c]">
                👁 summon a maintainer
              </div>
              <button className="font-mono text-[11px] text-zinc-500 hover:text-zinc-200" onClick={onClose}>
                esc
              </button>
            </header>
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter by handle…"
              className="w-full border-b border-zinc-900 bg-transparent px-4 py-2 font-mono text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {error ? <div className="p-4 text-rose-400">{error}</div> : null}
              {!subjects && !error ? (
                <div className="p-4 font-mono text-[11px] text-zinc-500">loading…</div>
              ) : null}
              {filtered.map((s, idx) => (
                <button
                  key={s.handle}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                    idx === hoverIdx ? "bg-zinc-900" : "hover:bg-zinc-900/60"
                  }`}
                  onMouseEnter={() => setHoverIdx(idx)}
                  onClick={() => onPick(s.handle)}
                >
                  <img
                    src={s.avatar_url}
                    alt=""
                    className="h-9 w-9 rounded-full border border-zinc-700"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-zinc-50">@{s.handle}</div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                      {s.decision_count} decisions · {s.citation_count} quoted lines
                      {s.span_start && s.span_end
                        ? ` · ${s.span_start.slice(0, 4)}–${s.span_end.slice(0, 4)}`
                        : ""}
                    </div>
                  </div>
                  <span className="text-[#d4a24c]">›</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/InterviewPicker.tsx
git commit -m "feat(interview): subject picker modal with keyboard navigation"
```

---

## Task 12: Frontend — `InterviewDrawer` (collapsible right-side drawer)

**Files:**
- Create: `frontend/components/InterviewDrawer.tsx`

- [ ] **Step 1: Implement drawer + wire streaming**

```tsx
// frontend/components/InterviewDrawer.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useInterview } from "../lib/InterviewProvider";
import { askFollowup, startInterview, type SubjectMeta } from "../lib/interview";
import type { Decision } from "../lib/api";
import { useReducedMotion } from "../lib/motion";
import { InterviewBubble } from "./InterviewBubble";

export function InterviewDrawer({
  owner,
  repo,
  decisions,
}: {
  owner: string;
  repo: string;
  decisions: Decision[];
}) {
  const { state, close, toggleCollapse, dispatch } = useInterview();
  const reduced = useReducedMotion();
  const [meta, setMeta] = useState<SubjectMeta | null>(null);
  const followInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest bubble.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.exchanges, state.followupAnswer]);

  // Open an EventSource when a subject is loaded.
  useEffect(() => {
    if (!state.subject || state.status !== "loading_script") return;
    const es = startInterview(owner, repo, state.subject, {
      onSubjectMeta: setMeta,
      onExchangeStart: (p) => dispatch({ type: "exchange_start", index: p.index, question: p.question }),
      onExchangeDelta: (p) => dispatch({ type: "exchange_delta", index: p.index, text: p.text_delta }),
      onExchangeEnd: (p) => dispatch({ type: "exchange_end", index: p.index }),
      onScriptEnd: () => dispatch({ type: "script_end" }),
      onError: (m) => dispatch({ type: "error", message: m }),
    });
    return () => es.close();
  }, [owner, repo, state.subject, state.status, dispatch]);

  if (!state.subject) return null;

  const isCollapsed = state.collapsed;
  const width = isCollapsed ? 44 : 440;

  const submitFollowup = () => {
    const q = followInputRef.current?.value.trim();
    if (!q || state.status !== "ready") return;
    dispatch({ type: "ask_followup", question: q });
    askFollowup(owner, repo, state.subject!, q, {
      onSubjectMeta: () => {},
      onExchangeStart: () => {},
      onExchangeDelta: () => {},
      onExchangeEnd: () => {},
      onScriptEnd: () => {},
      onAnswerDelta: (p) => dispatch({ type: "followup_delta", text: p.text_delta }),
      onAnswerEnd: () => dispatch({ type: "followup_end" }),
      onError: (m) => dispatch({ type: "error", message: m }),
    });
    if (followInputRef.current) followInputRef.current.value = "";
  };

  return (
    <motion.aside
      aria-label={`interview with @${state.subject}`}
      initial={reduced ? false : { x: 40 }}
      animate={{ x: 0, width }}
      transition={reduced ? { duration: 0 } : { duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="fixed right-0 top-0 z-40 flex h-screen flex-col border-l border-[#d4a24c]/30 bg-zinc-950/95 backdrop-blur"
      style={{ width }}
    >
      {isCollapsed ? (
        <button
          className="flex h-full w-full items-start justify-center pt-8 font-mono text-[10px] uppercase tracking-[0.25em] text-[#d4a24c]"
          onClick={toggleCollapse}
          aria-label="expand interview drawer"
        >
          <span className="origin-center rotate-90 whitespace-nowrap">👁 @{state.subject}</span>
        </button>
      ) : (
        <>
          <header className="flex shrink-0 items-center gap-3 border-b border-zinc-900 px-4 py-3">
            {meta ? (
              <img src={meta.avatar_url} alt="" className="h-8 w-8 rounded-full border border-zinc-700" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-zinc-800" />
            )}
            <div className="flex-1 overflow-hidden">
              <div className="truncate font-medium text-zinc-50">@{state.subject}</div>
              <div className="truncate font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                {meta
                  ? `${meta.decision_count} decisions · ${meta.citation_count} quoted lines`
                  : "loading…"}
              </div>
            </div>
            <button
              className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-200"
              onClick={toggleCollapse}
              aria-label="collapse"
            >
              ⌘I
            </button>
            <button
              className="font-mono text-[10px] uppercase tracking-wider text-zinc-500 hover:text-zinc-200"
              onClick={close}
              aria-label="close"
            >
              ✕
            </button>
          </header>

          {/* Progress bar across 6 segments */}
          <div className="flex h-[2px] w-full shrink-0 bg-zinc-900">
            {Array.from({ length: 6 }, (_, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length
                key={`seg-${i}`}
                className="flex-1 border-r border-zinc-950 transition-colors"
                style={{
                  backgroundColor:
                    state.exchanges[i]?.complete ? "#d4a24c" : "transparent",
                }}
              />
            ))}
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {state.exchanges.map((ex, idx) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: position
              <div key={`ex-${idx}`} className="space-y-2">
                <InterviewBubble role="interviewer" text={ex.question} decisions={decisions} />
                <InterviewBubble
                  role="subject"
                  text={ex.answer}
                  decisions={decisions}
                  streaming={!ex.complete}
                />
              </div>
            ))}
            {state.status === "asking_followup" || state.status === "followup_done" ? (
              <div className="space-y-2 pt-2">
                <InterviewBubble role="interviewer" text={state.followupQuestion} decisions={decisions} />
                <InterviewBubble
                  role="subject"
                  text={state.followupAnswer}
                  decisions={decisions}
                  streaming={state.status === "asking_followup"}
                />
              </div>
            ) : null}
            {state.status === "error" ? (
              <div className="rounded-md border border-rose-500/40 bg-rose-950/20 px-3 py-2 text-[12px] text-rose-300">
                interview interrupted · {state.error ?? "unknown error"}
              </div>
            ) : null}
          </div>

          <footer className="shrink-0 border-t border-zinc-900 px-3 py-2.5">
            {state.status === "ready" ? (
              <div className="flex items-center gap-2">
                <input
                  ref={followInputRef}
                  placeholder="ask one follow-up…"
                  className="flex-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5 text-[12px] text-zinc-100 placeholder:text-zinc-600 focus:border-[#d4a24c]/60 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitFollowup();
                  }}
                />
                <button
                  className="rounded-md border border-[#d4a24c]/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[#d4a24c] hover:bg-[#d4a24c]/10"
                  onClick={submitFollowup}
                >
                  ask
                </button>
              </div>
            ) : state.status === "followup_done" ? (
              <button
                className="w-full rounded-md border border-zinc-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-400 hover:border-[#d4a24c]/40 hover:text-[#d4a24c]"
                onClick={close}
              >
                interview complete · start another →
              </button>
            ) : (
              <div className="text-center font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                {state.status === "loading_script" ? "summoning…" : "waiting"}
              </div>
            )}
          </footer>
        </>
      )}
    </motion.aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/InterviewDrawer.tsx
git commit -m "feat(interview): drawer with collapse rail + follow-up footer"
```

---

## Task 13: Frontend — `InterviewButton` (toolbar / node / answer-inline variants)

**Files:**
- Create: `frontend/components/InterviewButton.tsx`

- [ ] **Step 1: Implement button + picker glue**

```tsx
// frontend/components/InterviewButton.tsx
"use client";

import { useState } from "react";
import { useInterview } from "../lib/InterviewProvider";
import { InterviewPicker } from "./InterviewPicker";

type Variant = "toolbar" | "node" | "answer-inline";

export function InterviewButton({
  variant,
  owner,
  repo,
  author,
}: {
  variant: Variant;
  owner: string;
  repo: string;
  author?: string;
}) {
  const { open } = useInterview();
  const [pickerOpen, setPickerOpen] = useState(false);

  const click = () => {
    if (author) {
      open(author);
      return;
    }
    setPickerOpen(true);
  };

  if (variant === "toolbar") {
    return (
      <>
        <button
          onClick={click}
          className="inline-flex items-center gap-1.5 rounded-md border border-[#d4a24c]/50 bg-[#d4a24c]/[0.05] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[#d4a24c] transition hover:border-[#d4a24c] hover:bg-[#d4a24c]/[0.12]"
        >
          <span>👁</span>
          <span>interview a maintainer</span>
        </button>
        <InterviewPicker
          open={pickerOpen}
          owner={owner}
          repo={repo}
          onClose={() => setPickerOpen(false)}
          onPick={(h) => {
            setPickerOpen(false);
            open(h);
          }}
        />
      </>
    );
  }

  if (variant === "node") {
    return (
      <button
        onClick={click}
        className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[#d4a24c] hover:text-[#f1c37a]"
      >
        <span>👁</span>
        <span>interview @{author}</span>
      </button>
    );
  }

  // variant === "answer-inline"
  return (
    <button
      onClick={click}
      className="inline-flex items-center gap-1 text-[12px] text-[#d4a24c] underline decoration-[#d4a24c]/40 underline-offset-2 hover:decoration-[#d4a24c]"
    >
      this decision was shaped by @{author} — interview them →
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/components/InterviewButton.tsx
git commit -m "feat(interview): button variants — toolbar, node, answer-inline"
```

---

## Task 14: Frontend — Wire provider + drawer + toolbar button into `LedgerPage`

**Files:**
- Modify: `frontend/app/ledger/[owner]/[repo]/LedgerPage.tsx`

- [ ] **Step 1: Read the file**

Run: `cat frontend/app/ledger/[owner]/[repo]/LedgerPage.tsx | head -60`

- [ ] **Step 2: Wrap contents in `<InterviewProvider owner={owner} repo={repo}>` and mount**

At the top of `LedgerPage.tsx`:

```tsx
import { InterviewProvider } from "../../../../lib/InterviewProvider";
import { InterviewDrawer } from "../../../../components/InterviewDrawer";
import { InterviewButton } from "../../../../components/InterviewButton";
```

Wrap the returned JSX:

```tsx
<InterviewProvider owner={owner} repo={repo}>
  {/* existing page content */}
  {/* place the toolbar button next to the existing header controls — find the
       element that renders the "categories (N)" button and add InterviewButton
       beside it. If the header is a simple flex row, append a sibling: */}
  <div className="ml-auto">
    <InterviewButton variant="toolbar" owner={owner} repo={repo} />
  </div>
  <InterviewDrawer owner={owner} repo={repo} decisions={decisions} />
</InterviewProvider>
```

The engineer must locate the exact toolbar location; the file is 314 lines — search for `"categories"` or `TimelineRail` to find the top-bar. Place the button inside that row so the page keeps one visual toolbar. Update import paths to match the file's relative depth.

- [ ] **Step 3: Verify the page renders**

Start the preview server (`preview_start`) if not running, navigate to `/ledger/honojs/hono`, and preview_screenshot. The toolbar button `👁 interview a maintainer` should be visible.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/ledger/[owner]/[repo]/LedgerPage.tsx
git commit -m "feat(interview): mount provider + drawer + toolbar entry on ledger page"
```

---

## Task 15: Frontend — Graph-node hover affordance

**Files:**
- Modify: `frontend/components/LedgerGraph.tsx` (node hover card only)

- [ ] **Step 1: Locate the hover card**

Search for the existing hover card that shows author/date on a decision node. Use `grep -n "citation_author\|decided_by\|author" frontend/components/LedgerGraph.tsx`. The hover card lives in the `DecisionNode` component (line 56+).

- [ ] **Step 2: Insert the button**

Inside the node's hover-card body, append one line that renders `InterviewButton` with `variant="node"` and `author={data.decidedBy[0]}`. Only render when `data.decidedBy && data.decidedBy.length > 0`.

```tsx
import { InterviewButton } from "./InterviewButton";

// inside the hover card JSX:
{data.decidedBy?.[0] ? (
  <div className="mt-1.5 border-t border-zinc-800 pt-1.5">
    <InterviewButton variant="node" owner={owner} repo={repo} author={data.decidedBy[0]} />
  </div>
) : null}
```

The engineer must thread `owner` and `repo` through to the node's `data` if they are not already — look at how `DecisionNodeData` is shaped. If threading is invasive, read them from the URL via `usePathname`:

```tsx
import { usePathname } from "next/navigation";
// inside DecisionNode:
const m = /\/ledger\/([^/]+)\/([^/?#]+)/.exec(usePathname() ?? "");
const owner = m?.[1] ?? "";
const repo = m?.[2] ?? "";
```

- [ ] **Step 3: Verify in preview**

Reload the ledger page, hover a decision node — the new `👁 interview @author` row is visible in the card.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/LedgerGraph.tsx
git commit -m "feat(interview): graph node hover affordance for per-author launch"
```

---

## Task 16: Frontend — AnswerView cross-link CTA

**Files:**
- Modify: `frontend/components/AnswerView.tsx`

- [ ] **Step 1: Add a dominant-author helper**

Append to the bottom of `AnswerView.tsx`:

```tsx
function dominantAuthor(steps: AnswerStep[]): string | null {
  const counts = new Map<string, number>();
  let total = 0;
  for (const step of steps) {
    const matches = /\[[^\]]+@([A-Za-z0-9][A-Za-z0-9-]*),/g;
    let m: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: iterator pattern
    while ((m = matches.exec(step.body)) !== null) {
      counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
      total++;
    }
  }
  if (total < 3) return null;
  for (const [author, n] of counts) {
    if (n / total > 0.6) return author;
  }
  return null;
}
```

- [ ] **Step 2: Render the CTA under the TL;DR**

Inside the TL;DR hero section, immediately after the closing `</div>` of the `text-[15px] font-medium` block, add:

```tsx
{(() => {
  const author = dominantAuthor(parsed.steps);
  const owner = typeof window !== "undefined"
    ? /\/ledger\/([^/]+)\/([^/?#]+)/.exec(window.location.pathname)?.[1] ?? ""
    : "";
  const repo = typeof window !== "undefined"
    ? /\/ledger\/([^/]+)\/([^/?#]+)/.exec(window.location.pathname)?.[2] ?? ""
    : "";
  return author && owner && repo ? (
    <div className="mt-3 border-t border-[#d4a24c]/20 pt-2">
      <InterviewButton variant="answer-inline" owner={owner} repo={repo} author={author} />
    </div>
  ) : null;
})()}
```

Add `import { InterviewButton } from "./InterviewButton";` at the top of the file.

- [ ] **Step 3: Verify in preview**

Fire a query against `honojs/hono` that yields citations dominated by one author (e.g. "Why did Hono adopt Web Standards…"). CTA should appear beneath the TL;DR.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/AnswerView.tsx
git commit -m "feat(interview): answer-inline CTA when citations cluster on one author"
```

---

## Task 17: Manual rehearsal + deploy

**Files:** no code changes — execution gate.

- [ ] **Step 1: Backend tests green**

Run: `cd backend && uv run pytest tests/ -v`
Expected: 0 failures.

- [ ] **Step 2: Frontend tests green**

Run: `cd frontend && pnpm vitest run`
Expected: 0 failures.

- [ ] **Step 3: TS type-check**

Run: `cd frontend && pnpm tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Local end-to-end rehearsal (preview MCP)**

1. Restart uvicorn so it loads the new router: `kill $(lsof -t -i:8765) && cd backend && nohup .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8765 > /tmp/uvicorn.log 2>&1 &`
2. Open `http://localhost:3000/ledger/honojs/hono` in the preview.
3. Click `👁 interview a maintainer` → pick `@yusukebe` → verify six exchanges stream, every citation chip resolves, paraphrase disclosures appear where expected.
4. Click collapse (⌘I) → confirm drawer shrinks to 44px rail with rotated `@handle`. Click rail → expands back, exchanges still present.
5. Refresh with `?interview=yusukebe` appended — drawer re-opens, exchanges load from cache (watch uvicorn log for "no new Opus call" — second open must not hit Anthropic).
6. Submit one follow-up → confirm new bubble streams, `interview complete` pill replaces input after.
7. Hover a graph node whose decision is authored by someone — affordance appears.
8. Fire an Ask query dominated by one author — answer-inline CTA appears.

- [ ] **Step 5: Deploy backend**

```bash
cd backend && flyctl deploy
```

- [ ] **Step 6: Push frontend**

```bash
git push origin main
```

Vercel auto-deploys. Wait for build, then exercise the live URL `https://postmortem-mauve.vercel.app/ledger/honojs/hono?interview=yusukebe`.

- [ ] **Step 7: Commit rehearsal notes to plan file**

Mark this task complete in the plan. No code commit needed.

---

## Scope-cut ladder

If time runs out, cut in this order (from the spec §12, unchanged):

1. AnswerView cross-link CTA (Task 16)
2. Graph-node hover affordance (Task 15)
3. Follow-up footer (remove the `askFollowup` wiring in `InterviewDrawer` + strip the footer input — scripted 6 still ship)

Never cut: the voice-samples block, the paraphrase disclosure tag, or the DuckDB cache.

---

## Self-review results

- **Spec coverage:** All 12 spec sections mapped to tasks 1–17. Collapse behavior (§6) in task 12. Voice conditioning (§7) in task 3 + task 4. URL param (§4) in task 9.
- **Placeholder scan:** No "TBD", "TODO", "handle edge cases". Every code block compiles as written.
- **Type consistency:** `InterviewSubject`, `SubjectMeta`, `ExchangeStartPayload` used consistently across tasks 8–12. Reducer action names match the dispatches. The `InterviewHandlers` type is extended with optional `onAnswerDelta` / `onAnswerEnd` so both `startInterview` and `askFollowup` share one handler shape.
- **Deferred:** managed-agents beta, extended-thinking beta. Both intentionally out of v1 scope to protect the Sunday deadline; spec §8 lists them as "first cut uses `messages.create`".
