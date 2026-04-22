# Handoff Prompt — Ambitious Demo Bundle

> **Purpose:** Paste the block at the bottom of this file as the first user
> message in a brand-new Claude Code session on any device. It briefs a fresh
> Claude on everything they need to execute the ambitious-demo-bundle plan
> from zero context.

---

## What this handoff covers

A new session inherits nothing — no memory, no open files, no running
servers. This prompt arms the receiving Claude with:

1. **Mission** — what Postmortem is, what the hackathon is, what the
   receiving Claude is being asked to do, and the Sunday 2026-04-26 8pm EST
   deadline
2. **Ground truth anchors** — exact file paths, repo URL, which branch,
   which spec + plan to execute
3. **Environment setup** — commands to bring backend + frontend + DB online
4. **Conventions that aren't in CLAUDE.md** — the ones we learned the hard
   way over the previous session
5. **Known risks + their mitigations** — the failure modes that ate time
   previously, so the new session can skip the rediscovery cost
6. **The final prompt block** to paste

---

## 1. Mission

Postmortem is a decision-archaeology agent for GitHub repos, built in 5 days
for the Claude Code Hackathon (2026-04-21 → 2026-04-26). The ambitious demo
bundle adds four interlocking UI features — **Follow the Thread, Time
Machine, Provenance Peek, Reasoning X-Ray** — that headline the submission
video.

The spec is frozen: `docs/superpowers/specs/2026-04-22-ambitious-demo-bundle-design.md`.
The plan is frozen: `docs/superpowers/plans/2026-04-22-ambitious-demo-bundle.md`.

The receiving Claude's job is to **execute the plan, task by task, in order**.

---

## 2. Ground-truth anchors

| Thing | Value |
|---|---|
| Repo | `github.com/rahilsinghi/postmortem` |
| Working branch | `main` (user is solo; no feature branches needed for this bundle) |
| Deadline | Sunday 2026-04-26, 8:00 PM EST |
| Remaining time budget | ~24 work-hours, zero buffer (Saturday + Sunday morning) |
| Design spec | `docs/superpowers/specs/2026-04-22-ambitious-demo-bundle-design.md` |
| Implementation plan | `docs/superpowers/plans/2026-04-22-ambitious-demo-bundle.md` |
| Rollout order | E (Follow the Thread) → A (Time Machine) → B (Provenance Peek) → C (Reasoning X-Ray) |
| If overrun by 4h | Drop feature C, keep E+A+B. Demo script falls back cleanly. |
| Submission tag | `submission-v1` (tag + push at end of Task DEMO2) |
| Primary ledger DB | `.cache/ledger.duckdb` (gitignored; ~13MB; populated Day 2–4) |
| Hero repos ingested | `honojs/hono`, `pmndrs/zustand`, `shadcn-ui/ui`, `rahilsinghi/postmortem` |

---

## 3. Environment setup (paste-ready)

### 3.1 Prerequisites

- macOS or Linux
- `uv` (Python package manager)
- `pnpm` (frontend package manager)
- Node 20+
- `git`, `gh` (GitHub CLI, authenticated)
- `.env.local` at repo root with `ANTHROPIC_API_KEY=...` and
  `GITHUB_TOKEN=...` — required for live features but **NOT** for executing
  most plan tasks (plan is frontend-heavy; only Feature C Task C1 touches
  the query engine path that needs the key)

### 3.2 First-time device setup

```bash
git clone git@github.com:rahilsinghi/postmortem.git
cd postmortem

# Backend
cd backend && uv sync
cd ..

# Frontend
cd frontend && pnpm install
cd ..

# Confirm ledger present (if not, note: plan does not require re-ingestion)
ls -lh .cache/ledger.duckdb
```

If `.cache/ledger.duckdb` is missing, the receiving Claude can still
implement and unit-test all frontend features. Backend smoke tests
(Task C1) will fail without the key + DB. User can backfill with a
quick ingestion on any small repo if needed.

### 3.3 Run backend

```bash
cd backend
uv run uvicorn app.main:app --host 127.0.0.1 --port 8765 --log-level warning
# Health: curl http://127.0.0.1:8765/healthz
```

### 3.4 Run frontend (preview server)

The previous session used the Claude Preview MCP server to run and
interact with the frontend. If the receiving session doesn't have that
MCP available, run manually:

```bash
cd frontend && pnpm dev
# → http://localhost:3000
```

For visual smoke in-conversation, use `mcp__Claude_Preview__preview_*`
tools (preview_start, preview_eval, preview_click, preview_screenshot,
preview_snapshot) if available. Otherwise, ask the user to smoke-test
manually between tasks.

### 3.5 Pre-flight checks

```bash
# Backend lint/type/test baseline
cd backend && uv run ruff check app/ && uv run black --check app/ && uv run mypy app/ && uv run pytest -q
cd ..

# Frontend lint/type baseline
cd frontend && pnpm biome check . && pnpm tsc --noEmit
cd ..

# CI baseline
gh run list --branch main --limit 1
```

All four commands should succeed on a clean checkout. If any fail
before any task runs, stop and debug that first — the plan assumes
green baseline.

---

## 4. Conventions beyond CLAUDE.md

Things the previous session learned that aren't written down elsewhere:

### 4.1 `react-resizable-panels` v4 API gotchas

- Component names: `Group`, `Panel`, `Separator` (NOT `PanelGroup`,
  `PanelResizeHandle`)
- `Panel` uses `panelRef` prop, NOT React `ref`
- Size props are **percentage strings** like `"34%"` — bare numbers are
  interpreted as **pixels** (caused multi-hour debugging in the previous
  session)
- Imperative handle methods: `collapse`, `expand`, `resize`, `getSize`,
  `isCollapsed`

### 4.2 Managed Agents — use the SDK only

`backend/app/managed_agents/*.py` routes through `client.beta.*`. Never
hand-roll `httpx` against `/v1/agents`. This is in the user's memory
already (`feedback_managed_agents_sdk.md`) but mentioning for safety.

### 4.3 Commit attribution

Per global CLAUDE.md: **never add Claude as co-author or attribution** in
commits, PRs, or any output. No `Co-Authored-By` lines.

### 4.4 Typography scale

Five sizes only: 10 / 11 / 13 / 14 / 16 (pixel values for font-size).
No arbitrary sizing. Archival amber accent `#d4a24c` is reserved for
*historical data* throughout; cyan `#67e8f9` (new in this bundle) is
reserved for *live system logic*.

### 4.5 Reduced-motion

`useReducedMotion()` from `frontend/lib/motion.ts` returns a boolean.
Every animation must short-circuit when true. Reference implementations
in `CountUp.tsx`, `ReasoningTrace.tsx`, `CitationChip.tsx`.

### 4.6 Error emission

`app/errors.py::safe_error_message(exc, context)` is the only sanctioned
way to render an exception for an SSE event. Never leak `repr(exc)` or
raw tracebacks to clients. Reference: every `except` block inside
`engine.py` and `impact.py`.

### 4.7 Prompt caching is already enabled

All system blocks in `engine.py`, `impact.py`, and the ingestion runner
already use `"cache_control": {"type": "ephemeral"}`. Don't remove.

---

## 5. Known risks + mitigations (time-saving pre-reads)

| Risk | How the previous session hit it | Pre-emptive mitigation |
|---|---|---|
| Scrubber drops frames at 400+ nodes | Stress-tested with 400-node synthetic graph in Wave 4 prototype | Spec mandates `useMotionValue` + `useTransform` per-node, NOT React state. See Task A4. |
| `/api/repos/{owner}/{name}/ledger` returns 404 on repos with no decisions | Happens during tests on fresh DBs | Skip ledger ingestion on the dev device; use the checked-in `.cache/ledger.duckdb` from the prior session's backup |
| Frontend runs but backend not up → `/api/repos` returns `[]`, gallery shows empty state | Affects Task E6 / A6 / B4 / C6 browser smoke | Every smoke task has a `curl -s http://127.0.0.1:8765/healthz` pre-check. Restart backend if down. |
| Mypy fails on `dict[str, object]` when reading SSE JSON payloads | Wave 2 hit this | Use `dict[str, Any]` with explicit `from typing import Any`. See `backend/app/routers/query.py`. |
| CI cache-restore prints "Failed to restore: Cache service responded with 400" | Previous session saw this — it's a harmless warning | Ignore unless the job actually fails |
| Black formatting breaks commits mid-flight | Hit in Wave 1 | `uv run black app/` before every commit in `backend/`. Plan tasks call this out. |

---

## 6. Execution rhythm

Per the plan's conventions section:

- Each task = one commit (unless task explicitly chains)
- No pushes without explicit user authorization
- After each feature's last task, run CI: `git push && gh run watch $(gh run list --branch main --limit 1 --json databaseId -q '.[0].databaseId') --exit-status`
- Browser smoke after each feature, using the Claude Preview MCP

---

## 7. The final prompt block

Paste this into the new session. It's self-contained.

---

```
You are continuing Postmortem, a decision-archaeology agent built during the
Claude Code Hackathon (2026-04-21 → 2026-04-26). The repo is at
github.com/rahilsinghi/postmortem. My ground-truth is on `main`.

The design and plan are already written and committed. I need you to execute
the plan task-by-task, in order, without deviating.

Read these three files FIRST before anything else:

  1. CLAUDE.md                                          (project rules)
  2. docs/superpowers/specs/2026-04-22-ambitious-demo-bundle-design.md
                                                         (what we're building)
  3. docs/superpowers/plans/2026-04-22-ambitious-demo-bundle.md
                                                         (how to build it)

Also read, for onboarding context:

  docs/superpowers/plans/2026-04-22-handoff-prompt.md
                                                         (conventions,
                                                          risks, env setup —
                                                          you are in this
                                                          file's §7 right now)

Four features to ship, in this exact order: E → A → B → C.

  E  Follow the Thread     (~4h)  — click citation → graph pans + kin tint
  A  Time Machine         (~7h)  — scrubber + animated graph reveal
  B  Provenance Peek      (~4h)  — editorial citation hover card
  C  Reasoning X-Ray      (~6h)  — live trace panel w/ cyan scan-line

Submission deadline: Sunday 2026-04-26, 8pm EST. Buffer is zero. If any
feature overruns by 4h, drop feature C and keep E+A+B.

Execution protocol:

  - Use superpowers:subagent-driven-development (recommended) or
    superpowers:executing-plans to run the plan.
  - Every task is Red → Green → Commit for logic; browser-smoke for pure-
    visual components. The plan spells this out per task.
  - Never push without my explicit `push` instruction. Every `git commit`
    in the plan is fine to run without asking; `git push` is not.
  - Conventional commit format enforced: feat(follow-thread),
    feat(timeline), feat(provenance), feat(x-ray), feat(demo).
  - Do NOT add Claude as co-author or attribution. No Co-Authored-By
    lines. (Global CLAUDE.md rule.)

Environment:

  Backend:  cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8765 --log-level warning
  Frontend: cd frontend && pnpm dev   (or Claude Preview MCP if available)
  Baseline: cd backend && uv run ruff check app/ && uv run mypy app/ && uv run pytest -q
            cd frontend && pnpm biome check . && pnpm tsc --noEmit
  Before starting: confirm baseline is green.

Ledger database: .cache/ledger.duckdb (gitignored, ~13MB). Should already be
on disk. If missing, I'll ingest; you proceed without it — most tasks are
frontend-pure.

Previous session shipped Waves 1 (security), 3 (design tokens), 4 (motion),
5 (layout), 6 (verification), and 2 (cost engine). All green, all on main.
Don't touch any of that code unless a plan task explicitly edits it.

Key files you'll interact with most:

  frontend/components/CitationChip.tsx          — existing, extend for E + B
  frontend/components/LedgerGraph.tsx           — existing, extend for E + A
  frontend/components/AskPanel.tsx              — existing, extend for C
  frontend/components/ReasoningTrace.tsx        — existing, small prop add
  frontend/lib/query.ts                         — existing, onThought add
  frontend/lib/citations.ts                     — existing, uses parseCitations
  frontend/lib/motion.ts                        — existing, reuse SPRING_TACTILE
  frontend/app/ledger/[owner]/[repo]/LedgerPage.tsx  — existing, extend
  backend/app/query/engine.py                   — existing, emit `thought`
  backend/app/routers/impact.py                 — existing, mirror `thought`
  backend/app/errors.py::safe_error_message     — use this for any SSE error

New files you'll create (full paths in the plan):

  frontend/hooks/useThreadFollower.ts           + .test.ts
  frontend/components/TimelineRail.tsx          + .test.tsx
  frontend/components/ProvenanceCard.tsx        + .test.tsx
  frontend/components/ReasoningXRay.tsx
  backend/tests/test_thought_events.py

Conventions to not rediscover the hard way:

  - react-resizable-panels v4 API: `Group`/`Panel`/`Separator`, size props
    are PERCENTAGE STRINGS ("34%"), Panel uses `panelRef` not React ref.
  - Typography scale is fixed: 10/11/13/14/16 px.
  - Accent colors: amber #d4a24c for historical data, cyan #67e8f9 for
    live system logic. Add both as CSS custom properties (Task A1).
  - Mypy doesn't like `dict[str, object]` when reading SSE JSON — use
    `dict[str, Any]` with explicit Any import.
  - Managed Agents calls go through client.beta.* — never raw httpx.
  - Every animation respects useReducedMotion() (boolean hook).

Start by reading the three files listed above. Then confirm baseline is
green. Then invoke superpowers:subagent-driven-development (or
superpowers:executing-plans for an inline run) and begin with Task E1.

Acknowledge the brief and tell me which execution mode you're using, then
begin.
```

---

## 8. What you (current session) should do now

1. Commit this file to git alongside the plan
2. Show the user the final prompt block so they can copy it to the new
   session. (They can copy from this file in their editor, or you can echo
   the block into terminal.)
3. Mark the writing-plans work as complete
