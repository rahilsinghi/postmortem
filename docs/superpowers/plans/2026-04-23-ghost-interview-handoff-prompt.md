# New-session prompt — Ghost Interview execution

Copy the block below into a fresh Claude Code session. It is self-contained: the next agent does not need access to this conversation.

---

RESUME POSTMORTEM HACKATHON — Ghost Interview execution.

**Context.** Postmortem is a decision-archaeology agent for GitHub repos, built for the *Built with Opus 4.7* hackathon. Today is Thursday, April 23, 2026. Submission deadline: Sunday April 26, 2026, 8:00 PM EST. Working directory: `/Users/rahilsinghi/Desktop/postmortem/postmortem`. Read `CLAUDE.md` and `docs/SPEC.md` first to ground yourself in stack, voice, and rules.

**Your task for this session.** Execute the 17-task plan at [docs/superpowers/plans/2026-04-23-ghost-interview.md](docs/superpowers/plans/2026-04-23-ghost-interview.md). Every task follows RED → GREEN → REFACTOR. The spec it implements is [docs/superpowers/specs/2026-04-23-ghost-interview-design.md](docs/superpowers/specs/2026-04-23-ghost-interview-design.md) — already user-approved. Do not re-brainstorm; the design is locked. Only pause to ask the user if a task uncovers a real conflict with the spec.

**Recommended execution model.** Invoke `superpowers:subagent-driven-development`. Tasks 1–7 are backend with hard dependencies between tasks — run them sequentially. Tasks 8–13 are frontend-lib + components that can mostly go in parallel subagents (respect the import graph: `InterviewBubble` (task 10) depends on the `InlineRich` export inside `AnswerView.tsx` → that one-line export change lands with task 10 itself). Tasks 14–16 each touch a single existing file and should be sequential so commits stay clean. Task 17 is the rehearsal + deploy gate.

**Live infra snapshot.**

- **Frontend (prod):** https://postmortem-mauve.vercel.app — Vercel project `prj_3gBiRrX1TvBrUqmcCd6nOV3YiwUD`, auto-deploys on push to `main`. Deployment was fixed on 2026-04-23 (commit 47ec5b0 — `/s` regex flag was breaking ES2017 build).
- **Backend (prod):** https://postmortem-backend.fly.dev — Fly app `postmortem-backend`, single EWR machine, 3GB volume at `/data`, ledger seeded. Deploy with `cd backend && flyctl deploy`. Secrets already set (`ANTHROPIC_API_KEY`, etc.).
- **Local backend:** uvicorn on port 8765. If PID 14727 is still running, `kill $(lsof -t -i:8765) && cd backend && nohup .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8765 > /tmp/uvicorn.log 2>&1 &` restarts it with the new router.
- **Local frontend:** Next.js dev server on port 3000. Preview MCP server is already running (use `mcp__Claude_Preview__preview_list` first tool call of the session to pick up the serverId).
- **Repo remote:** `git@github.com:rahilsinghi/postmortem.git`, default branch `main`, clean working tree as of commit `44709e2`.

**Latest commits in order** (top = newest):

```
44709e2 docs(plan): ghost interview — 17 bite-sized tasks from spec to deploy
47ec5b0 fix(build): replace /s dotall flag with [\s\S] — unsupported on ES2017 target
50bfa2d docs(spec): ghost interview — author-filtered voice synthesis with cached 6-exchange scripts
d21083e feat(ask): anchored claim cards — Title. headlines + pulled quotes + colored tail
```

**What just shipped before this session (ground truth for the UI).**

- Ask-panel *Anchored Claim Cards*: TL;DR hero (amber gradient), per-step reasoning cards with `**Title.**` bold headlines, opportunistic pulled verbatim quotes with `@author · PR · date` attribution, colored tail sections (Rejected ✕ rose, Related ⟿ cyan, Follow-ups → emerald). Files: [backend/app/query/prompts.py](backend/app/query/prompts.py), [frontend/components/AnswerView.tsx](frontend/components/AnswerView.tsx), [frontend/lib/answerParser.ts](frontend/lib/answerParser.ts), [frontend/components/AskPanel.tsx](frontend/components/AskPanel.tsx).
- Legacy `ReasoningTrace.tsx` is kept untouched — do not edit it.
- Verified live against hono ledger: 5 step cards, 4 pulled quotes, 18 citations across 7 PRs resolved cleanly.

**Hackathon scoring leverage.** Impact 30 · Demo 25 · Opus 4.7 Use 25 · Depth 20. Target prizes: Most Creative Opus 4.7, Keep Thinking, Managed Agents. Ghost Interview is the creative-prize bait. After it ships, three features remain in priority order:

1. **Extended thinking visible** — route real `extended_thinking` blocks into `ReasoningXRay` (existing component). Needs `extended-thinking-2025-05-14` / `interleaved-thinking-2025-05-14` beta headers. ~3h.
2. **Conflict Finder** — Opus scans ledger for decisions that contradict across supersedes chains, produces annotated timeline. Entry point from ledger toolbar. ~6h.
3. **Demo fixture update + cue timeline + terminal script update** — show all new features across the 3-min combined reel. Do not start this until 1 + 2 + Ghost Interview all ship.
4. **100–200 word submission writeup** — last step.

**Constraints that must survive across sessions.**

- Be direct, no long recap prose. End-of-turn summaries are one-to-two sentences.
- Skills plugin is installed: brainstorming, writing-plans, test-driven-development, executing-plans, verification-before-completion, using-git-worktrees, requesting-code-review, subagent-driven-development. Invoke the relevant skill before responding.
- Auto-memory at `/Users/rahilsinghi/.claude/projects/-Users-rahilsinghi-Desktop-postmortem/memory/MEMORY.md` — read on start, update as we learn.
- Never touch unrelated UI (gallery, graph internals, side panel, demo fixtures) while shipping Ghost Interview — the demo flow is fragile and only gets updated in task 18+ (post-Ghost-Interview).
- `ProvenanceCard.tsx` renders a `<blockquote>`. Never nest `<CitationChip>` inside a `<p>` — you will get hydration errors. Use `<div>` wrappers where citation chips may appear.
- Preserve the current demo fixtures and cue timings until every feature ships.
- Never commit `.env` files; env vars live in `.env.local` locally and in Fly secrets / Vercel env vars remotely.
- Conventional commits. Branches: features merge directly to `main` (solo dev, hackathon mode). `git push origin main` only when asked or when explicitly at the deploy step.
- Do not add "Co-Authored-By" lines for Claude.

**Deploy workflow.**

- Frontend: `git push origin main` → Vercel auto-builds. Vercel dashboard still has "Ignored Build Step = Automatic" — do not reintroduce `ignoreCommand` in `vercel.json`.
- Backend: `cd backend && flyctl deploy`. Ledger lives in `/data/ledger.duckdb` on the Fly volume; the new `interviews` table in Task 2 of the plan applies automatically on first connect because `SCHEMA_SQL` runs unconditionally.

**Before you start touching code.**

1. Read the plan top-to-bottom. It is 2,600 lines, worth a single focused read.
2. Read the spec top-to-bottom to confirm understanding.
3. Check `docs/superpowers/specs/2026-04-23-demo-layer-design.md` to understand what the demo flow currently shows — the Ghost Interview must not regress any demo beat.
4. Run `cd backend && uv run pytest tests/ -q` and `cd frontend && pnpm vitest run` to establish the green baseline.
5. Sanity-check the preview: navigate to `/ledger/honojs/hono`, confirm the Anchored Claim Cards render for a real query (`Why did Hono adopt Web Standards…`).

**When the plan is done.**

Run the full rehearsal from Task 17 (all 7 sub-steps). Push to `main`, deploy Fly, exercise the live URL at `https://postmortem-mauve.vercel.app/ledger/honojs/hono?interview=yusukebe`. Report back with: tests pass/fail counts, a screenshot of the live drawer, and the four todos that remain (extended thinking, conflict finder, demo fixtures, writeup). Do not start those four in this session — they are a separate handoff.

**Starting command.** Announce you are using `superpowers:subagent-driven-development`, then read the plan, then dispatch the first subagent for Task 1 (backend AuthorSlice). Go.
