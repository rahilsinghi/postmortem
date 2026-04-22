# Day 1 Kickoff Prompt for Claude Code

> Paste this into your first Claude Code session at the start of Day 1 (Tuesday Apr 21, ~12:30 PM EST, after the virtual kickoff).
> Do NOT paste until you've:
> 1. Cloned the repo
> 2. Added the starter drop (CLAUDE.md, .claude/agents/*, .claude/skills/pr-archaeology/, README.md, docs/SPEC.md)
> 3. Committed and pushed with message: `chore: initial scaffold — hackathon Day 1`
> 4. Opened Claude Code in the repo root

---

## The prompt

```
Hi. Read CLAUDE.md, then read docs/SPEC.md sections 1, 5, 7, and 15 carefully.

We are at the start of Day 1 of the Built with Opus 4.7 hackathon. My name is Rahil. Postmortem is the project. The spec is the contract. The 5-day plan in SPEC.md §15 is the schedule. Respect the scope discipline — we ship by EOD targets; we do NOT add features not in the spec.

Today's goal (Day 1 — Tuesday):

1. Scaffold the repo structure per CLAUDE.md §Directory layout:
   - backend/ (FastAPI + uv + Python 3.11)
   - frontend/ (Next.js 15 App Router + pnpm + Tailwind v4 + TypeScript strict mode)
   - scripts/
   - docs/architecture/ (empty, ready for ADRs)

2. Backend skeleton:
   - FastAPI app with health endpoint at GET /healthz
   - Basic CORS config (allow frontend origin)
   - Ruff + black configured in pyproject.toml
   - pytest + pytest-asyncio configured
   - Dockerfile for Cloud Run

3. Frontend skeleton:
   - Next.js 15 App Router
   - Single page at / that says "Postmortem — coming online"
   - Tailwind v4 configured
   - Biome configured
   - Dark mode by default (Tailwind class strategy)

4. Two smoke-test scripts in scripts/:
   - verify-opus-4-7.py — calls the Anthropic Messages API with model="claude-opus-4-7" and a trivial "Hello Postmortem" prompt, prints the response. Uses ANTHROPIC_API_KEY from env.
   - smoke-managed-agents.py — creates a Managed Agents agent + environment, runs a toy session that executes `echo hello from the sandbox` via the agent_toolset, prints the result. Uses the managed-agents-2026-04-01 beta header.

5. GitHub Actions CI:
   - On push: lint (ruff + biome), type-check (mypy for Python, tsc for TS), unit tests
   - Must pass on the initial commit

Before you start: state your plan in 5 bullets. Wait for me to confirm. Then execute.

Rules for this session:
- Small commits. Meaningful messages. Conventional-commit prefixes.
- Don't add dependencies not listed in CLAUDE.md §Stack without asking first.
- Don't create example or placeholder files. Everything you write should compile and run.
- If you hit ambiguity, propose a choice and ask — don't just pick silently.

Let's go.
```

---

## After Day 1 kickoff

When you wrap Day 1, make sure your repo has these smoke tests passing:

```bash
# From repo root
cd backend && uv run python ../scripts/verify-opus-4-7.py   # should print a response from Opus 4.7
cd backend && uv run python ../scripts/smoke-managed-agents.py  # should print "hello from the sandbox"
cd backend && uv run pytest                                   # at least one passing test
cd ../frontend && pnpm dev                                     # renders Postmortem — coming online
```

If any of those fail at EOD, Day 2 is blocked. Fix them before sleeping.

## Day 2 prompt (a preview — write this when Day 1 ships)

Day 2's prompt will look like:

```
Day 2. We are building the ingestion pipeline end-to-end against one test repo: `pmndrs/zustand` (our small-but-famous hero).

Read docs/SPEC.md §9 (sub-agent topology), §10 (skills), §11 (Managed Agents session design), §12 (data ingestion pipeline), §15 (Day 2 goals).

By EOD today, we need:
- All three sub-agents in .claude/agents/ (decision-classifier, rationale-extractor, graph-stitcher) callable and verified on 5 hand-picked PRs from pmndrs/zustand
- pr-archaeology skill working (fetches and caches a PR's full archaeology)
- The three other skills drafted (commit-rationale, citation-formatter, ledger-writer)
- A Managed Agents session that runs the full pipeline end-to-end on pmndrs/zustand
- DuckDB ledger populated with ~30-50 decision entries, each with rationales and alternatives
- Cost of the full zustand ingestion measured and logged

Plan in 5 bullets. Then execute.
```

Don't write Day 2's prompt until Day 1 is shipped. Scope discipline starts with prompt discipline.
