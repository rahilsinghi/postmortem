# Ghost Interview — Design Spec

Date: 2026-04-23
Status: Approved for implementation
Author: Postmortem hackathon session

---

## 1. Summary

Ghost Interview is a new mode on the ledger page: the user picks a maintainer whose voice the agent will wear, and Opus 4.7 conducts a six-exchange scripted interview with that person, grounded in their own verbatim quotes from the ledger. A text input at the bottom accepts one follow-up.

The feature exists to make Postmortem's thesis — *"code lives; intent is a ghost; Postmortem summons it"* — visible in one surface. It is the strongest creative-prize bait in the plan.

## 2. Goals and non-goals

**Goals.**

- Turn the decision ledger into a first-person conversation with a specific maintainer.
- Every factual sentence cites a real ledger entry via the existing `CitationChip` / `ProvenanceCard` pair.
- Demo-reliable: the six scripted exchanges are pre-generated once per subject and cached, so demo playback costs zero Opus tokens and renders instantly.
- Four discoverable entry points so the mode is hard to miss.
- Beautiful UI that is also collapsible — the user can dock it down to a thin rail without losing state.

**Non-goals.**

- Multi-author round-tables. One subject per interview.
- Unlimited back-and-forth. After the scripted six, exactly one follow-up, then the input disables.
- Self-check verification on the streamed answers. The prompt rule ("wrap quotes in double quotes immediately before the citation token") plus the chip resolver is enough credibility for the demo; adding a self-check pass would double roundtrip latency.

## 3. Subject model

**Subject = single author.** The ledger stores `citation_author` on every quoted line. A subject qualifies if they are named in at least three ledger citations across the repo. Subjects are ranked by citation count descending; the top eight are offered in the picker.

## 4. Entry points (four surfaces → one drawer)

1. **Ledger-page toolbar button** — `👁 Interview a maintainer`, amber accent, top-right, always visible.
2. **Graph-node hover affordance** — the existing hover card on each decision node gains a one-line `👁 interview @author` row.
3. **AnswerView cross-link** — inside the Ask panel's Answer card, when >60% of the resolved citations belong to one author, a thin underlined CTA appears under the TL;DR: `this decision was shaped by @author — interview them →`.
4. **URL parameter** — `?interview=<handle>` opens the drawer on page load. Shareable.

All four converge on the same drawer component; the surface only determines which author is preselected.

## 5. Subject picker

Modal, reuses `MCPConnectModal`'s backdrop and transitions.

- Two-column desktop layout, single-column mobile.
- **Left column.** Up to eight maintainer rows: avatar (GitHub CDN), `@handle`, aggregate stats (`N decisions · M quoted lines · YYYY–YYYY`), a tiny cadence sparkline.
- **Right column (hover preview).** On row hover, the right pane renders the subject's top three decisions, a signature phrase lifted from their longest quoted line, and the first scripted question Opus is about to ask them. Click the row to launch.
- Fuzzy search bar at the top filters by handle or decision title.
- Arrow keys navigate. `Enter` launches. `Esc` closes.
- Empty state: if no author qualifies, every entry point disables with tooltip `not enough quoted material yet — ingest more PRs`.

## 6. Drawer

Right-side drawer, slides in over the existing right panel (Ask panel real estate). Graph remains visible on the left.

**Header (sticky, 56px).**
- Avatar + `@handle` + short bio derived from ledger (`creator of {repo} · N decisions · YYYY–YYYY`).
- `⌘I collapse` and `✕ close` controls.
- Thin amber progress line fills left-to-right across six segments as exchanges stream in.

**Body (scrolls).**
- Chat column, max-width 560px, centered.
- **Interviewer bubble** — left-aligned, zinc background, monospace small caps. Feels like a transcript cue.
- **Subject bubble** — right-aligned, amber-bordered `rounded-lg`. Answers are assembled from the author's verbatim quotes wherever possible; neutral bridge sentences get `(paraphrased — see [PR #N])` appended so voice and grounding are legible at a glance.
- Shared `InlineRich` renderer from `AnswerView.tsx` handles `**bold**` and citation chips so nothing new leaks raw markdown.
- 500ms pause between scripted exchanges to pace the recording.
- `TypingCursor` (reused) blinks during streaming.
- Each subject bubble carries a `⤴ trace` affordance that scrolls the graph to center the primary cited decision node. No-op if graph is collapsed.

**Footer (sticky, revealed after the 6th exchange).**
- Single input: `ask one follow-up…`. Submitting runs a one-shot Opus call with the full thread history plus the author-filtered ledger. The answer streams into a new subject bubble. After that answer, the input disables and shows `interview complete · start another →` which reopens the picker.

**Collapse.** Expanded = 440px wide, full height. Collapsed = 44px vertical rail pinned to the right edge showing the rotated `@handle` glyph. `⌘I` or clicking the rail toggles. State survives page navigation via the `InterviewProvider` context + URL.

**Error handling.** If the stream fails mid-interview, already-rendered bubbles stay, a rose-bordered `interview interrupted · retry` row appears. No silent failures.

**Responsive + a11y.**
- `role="dialog" aria-label="interview with @{author}"`, focus-trapped while expanded.
- Mobile viewport goes full-screen instead of side-docked; rail collapses to a bottom pill.
- Reduced motion drops transitions to instant via the existing `useReducedMotion` hook.

## 7. Voice conditioning

Before generating the script, backend pulls the subject's ten-to-fifteen longest verbatim quotes from the ledger, sorted by length descending. Those are injected into the system prompt as *"here is how @subject writes — match this register."*

Every scripted answer must be one of:
- A direct quote from the subject, wrapped in double quotes and followed immediately by `[PR #N, @subject, YYYY-MM-DD]`, or
- A neutral bridge sentence ending with `(paraphrased — see [PR #N])`.

The prompt forbids invented quotes and forbids paraphrase that does not end with the disclosure tag. This rule plus the existing chip resolver is the credibility contract.

## 8. Backend

**New DuckDB table** (migration adds it if missing):

```sql
CREATE TABLE IF NOT EXISTS interviews (
  repo_owner        VARCHAR NOT NULL,
  repo_name         VARCHAR NOT NULL,
  subject_author    VARCHAR NOT NULL,
  generated_at      TIMESTAMP NOT NULL,
  model             VARCHAR NOT NULL,     -- 'claude-opus-4-7'
  script_json       JSON    NOT NULL,     -- {exchanges: [{question, answer, citations}]}
  voice_sample_ids  JSON    NOT NULL,     -- citation ids used as voice samples
  token_usage       JSON    NOT NULL,     -- {input, output, cache_read, cache_creation}
  PRIMARY KEY (repo_owner, repo_name, subject_author)
);
```

One row per (repo, author). Regenerate only if the request carries `force: true`.

**New router** `backend/app/routers/interview.py`, mounted under `/api/interview`.

| Route | Verb | Purpose |
|---|---|---|
| `/subjects` | GET | Up to eight qualifying authors for a repo, with aggregate stats for the picker. |
| `/script` | POST | Stream the six scripted exchanges. Hits DuckDB cache if present, otherwise runs one Opus call and persists. |
| `/followup` | POST | Stream a single follow-up answer. No persistence. |

**Author slice helper** — `backend/app/ledger/store.py::load_author_slice(owner, repo, author) -> AuthorSlice`. Returns a pydantic model containing: decisions authored by the subject, every citation where `citation_author == author`, rejected alternatives the subject argued for or against, and edges into related decisions. Excludes citations with `citation_author is None`.

**System prompt** lives in `backend/app/query/prompts.py` as `GHOST_INTERVIEW_SYSTEM_PROMPT`. Structure:

- Role statement: reconstruct an interview with `@{subject}` about `{owner}/{repo}`.
- Grounding rule: every sentence is either a verbatim quote (double-quoted, citation token immediately after) or a bridge sentence ending with `(paraphrased — see [PR #N])`.
- Shape rule: exactly six exchanges, each a `Q:` line and an `A:` block of two to four sentences in first person, in the subject's register.
- Topic coverage menu (pick across, no duplicates): the decision they're most associated with, something they rejected and why, a review where they pushed back, a trade-off they accepted reluctantly, a supersedes-chain decision, a flagged follow-up.
- Voice samples block: the ten-to-fifteen longest verbatim quotes by the subject, verbatim, preserved exactly.

**Model and betas.** `claude-opus-4-7` with beta headers `managed-agents-2026-04-01` and `extended-thinking-2026-01-12`. Extended thinking is enabled with `budget_tokens: 4096` so the reasoning blocks are available for the separate ReasoningXRay task. Managed-agents path keeps the feature consistent with the submission's Managed-Agents prize angle.

**Streaming event grammar** (SSE, matches `sse-starlette` conventions already used elsewhere):

```
event: subject_meta       data: {handle, avatar_url, span, counts}
event: exchange_start     data: {index, question}
event: exchange_delta     data: {index, text_delta}
event: exchange_citations data: {index, tokens: [...]}
event: exchange_end       data: {index}
event: script_end         data: {usage: {input, output, cache_read}}
event: error              data: {code, message}
```

The cached path replays the same event sequence from DuckDB with zero Opus calls. The client cannot distinguish cached from live — important so demo playback looks identical to first generation.

## 9. Frontend

**New files.**

- `frontend/lib/interview.ts` — SSE client. Exports `fetchSubjects(owner, repo)`, `startInterview(owner, repo, author, onEvent)`, `askFollowup(owner, repo, author, history, question, onEvent)`. Mirrors the shape of `frontend/lib/query.ts`. Handles reconnect on the `error` frame.
- `frontend/lib/InterviewProvider.tsx` — React Context + `useReducer` following the existing `DemoProvider.tsx` pattern. State shape `{open, collapsed, subject, exchanges, followup, status, error}`. Hooks sync state to `?interview=<handle>` via `useSearchParams` + `router.replace`.
- `frontend/components/InterviewButton.tsx` — one component with a `variant` prop (`"toolbar" | "node" | "answer-inline"`) so all four surfaces (three in-app variants plus the URL auto-open) share one code path.
- `frontend/components/InterviewPicker.tsx` — subject modal. Subjects list fetched on first open and memoized per `(owner, repo)` on the provider.
- `frontend/components/InterviewDrawer.tsx` — the drawer itself. Sticky header, scrollable bubble column, sticky footer. Framer Motion manages the width transition between expanded (`w-[440px]`) and collapsed rail (`w-[44px]`).
- `frontend/components/InterviewBubble.tsx` — single bubble, two variants. Shares `InlineRich` from `AnswerView.tsx`.

**Changes to existing files.**

- `frontend/app/ledger/[owner]/[repo]/LedgerPage.tsx` — mount `<InterviewDrawer />` at page root, place `<InterviewButton variant="toolbar" />` next to the existing toolbar.
- `frontend/components/LedgerGraph.tsx` (node hover card) — inject `<InterviewButton variant="node" author={…} />`.
- `frontend/components/AnswerView.tsx` — compute `dominantAuthor(steps)`; if one author holds >60% of resolvable chips, render `<InterviewButton variant="answer-inline" author={…} />` under the TL;DR. ~15 lines.

**URL state.** `useSearchParams` reads `?interview=…` on mount; the store writes it back via shallow `router.replace`. Back-and-forward behave correctly.

## 10. Data flow (one frame)

```
User click  → InterviewButton(author)
            → InterviewProvider dispatch({type: "open", author})
            → URL gains ?interview=author
            → InterviewDrawer mounts, POSTs /api/interview/script
              → backend checks DuckDB
                  hit:  stream cached events
                  miss: Opus call, persist row, stream events
              → drawer renders Interviewer/Subject bubbles as events arrive
              → after exchange 6: footer input reveals
User types  → POST /api/interview/followup
            → Opus call with history + author slice
            → new subject bubble streams in
            → input disables, swap to "start another →" pill
```

## 11. Testing strategy

Targeted, not blanket.

**Backend (pytest).**

- `test_interview_router.py` — fixture ledger, hit all three endpoints, assert SSE event order matches the grammar, assert the cached second call returns DuckDB-sourced events with no Opus invocation. Uses `respx` to record/replay Opus responses so CI is free.
- `test_load_author_slice.py` — synthetic three-author ledger, slice for each author returns only their quotes and decisions; citations with `citation_author is None` are excluded.
- `test_interview_prompt.py` — golden-file test on the rendered `GHOST_INTERVIEW_SYSTEM_PROMPT` for a fixed slice. Catches accidental prompt drift.

**Frontend (vitest).**

- `interview.test.ts` — SSE parser handles `exchange_delta` streaming, out-of-order deltas, mid-stream `error` frames. Follow-up extends history correctly.
- `InterviewProvider.test.tsx` — URL round-trips, collapse state survives navigation, follow-up pushes onto history.
- `InterviewBubble.test.tsx` — renders `**bold**` + citation chips through `InlineRich`, no raw `**` leaks to the DOM.

**Manual demo-rehearsal gate** (part of the Finishing step, not CI).

1. Run a full scripted interview on the hono ledger. Every citation chip resolves. Voice feels recognizable against three random exchanges spot-checked on GitHub.
2. Run one on the zustand ledger. Same checks.
3. Cached re-open is instant (< 300ms to first bubble).

## 12. Rollout and scope control

This spec is sized to ~4 hours of focused work across one session. The deadline is Sunday April 26 20:00 EST. If any of the following slip, cut in this order:

1. **Cut first:** the AnswerView cross-link (`answer-inline` variant). Keep the toolbar button and the graph hover affordance; the cross-link is the nicest-to-have surface but also the one that requires new logic in `AnswerView.tsx`.
2. **Cut second:** the `⤴ trace` graph-scroll affordance on each bubble.
3. **Cut third:** the follow-up footer. The scripted six alone carry the demo; the follow-up is the live-demo wow, and it can ship Sunday morning.

Under no circumstances cut the voice-samples block, the paraphrase disclosure tag, or the DuckDB cache — those three are what make the feature credible, reliable, and cheap.
