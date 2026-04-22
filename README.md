# Postmortem

**A decision-archaeology agent for any codebase.**

Built in 5 days during [*Built with Opus 4.7: a Claude Code Hackathon*](https://cerebralvalley.ai/events/~/e/built-with-4-7-hackathon) — April 21–26, 2026.

---

## The problem

Engineers spend 20–30% of their time trying to understand *why* existing code is the way it is. The answers are almost never in the code. They're buried in PR discussions, code review debates, issue threads, and the heads of people who've long since left. Existing tools search code; none of them reason over the historical provenance.

## What Postmortem does

Point Postmortem at any public GitHub repository. It reads the entire intent layer — every PR, every review comment, every issue — and builds a **decision ledger**: a queryable graph of the repo's architectural decisions, the rationales behind them, and the alternatives that were rejected.

Ask it:

- *"Why does this codebase use X instead of Y?"*
- *"What breaks if I change this assumption?"*
- *"What did the maintainers consider and reject when they made this choice?"*

Get back a cited reasoning chain, traced through actual engineering debates, with links to the specific comments and commits. Every claim cites an exact quote; Opus's self-check pass tints unverified citations red.

## Hero ledgers shipped in the submission

| Repo | Decisions | Citations | Alternatives | Edges |
|---|--:|--:|--:|--:|
| `pmndrs/zustand` | 41 | 164 | 83 | 36 |
| `honojs/hono` | 59 | (≈450) | (≈170) | 27 |
| `shadcn-ui/ui` | 15 | (≈65) | (≈30) | 6 |
| `rahilsinghi/postmortem` (self-graphify) | 6 | 14 | 3 | 7 |
| **Total** | **121** | ~700 | ~285 | **76** |

All four ingested for a combined **~$60** of API spend.

## What makes this possible

Claude Opus 4.7 shipped on April 16, 2026. Postmortem uses its new capabilities as load-bearing infrastructure:

- **1M-token context** holds a full decision ledger in memory for query-time reasoning (zustand's 41 decisions serialise to ~68K tokens — plenty of headroom)
- **Agentic self-checking** verifies every inline citation against the ledger before an answer is returned
- **Prompt caching** on the system prompts cuts extractor cost by ~40% on the second-and-later calls in a batch
- **Streaming** over SSE surfaces word-boundary reasoning live, with citation chips resolved client-side against the loaded ledger

Ingestion runs through a direct orchestrator (Python, async) that calls each sub-agent via the Anthropic SDK; a Managed Agents session wraps a single-PR demo path per the `managed-agents-2026-04-01` beta. Three sub-agents live in `.claude/agents/`: `decision-classifier` (Sonnet 4.6, runs on every PR), `rationale-extractor` (Opus 4.7, runs on classifier-confirmed decisions), `graph-stitcher` (Sonnet 4.6, batch-runs after extraction). Four skills in `.claude/skills/` cover the supporting capabilities.

## Running it locally

```bash
# Prereqs: uv, pnpm, GITHUB_TOKEN + ANTHROPIC_API_KEY in .env.local

# Backend
cd backend && uv sync && \
  uv run uvicorn app.main:app --host 127.0.0.1 --port 8765

# Frontend (other terminal)
cd frontend && pnpm install && pnpm dev
# → http://localhost:3000

# Ingest a repo (CLI path)
cd backend && uv run python ../scripts/ingest.py pmndrs/zustand \
  --limit 600 --min-discussion 3 --db ../.cache/ledger.duckdb

# Or, from the web UI: click "+ ingest your own" on the entry screen and stream
# per-PR progress live into Screen 3.
```

## Architecture

Full design in [`docs/SPEC.md`](docs/SPEC.md) (975 lines, locked Day 1). ADRs for every Day-1-through-5 decision live in [`docs/architecture/`](docs/architecture/).

- **Frontend** — Next.js 16 App Router + Tailwind v4 + Framer Motion + React Flow. Three screens: entry gallery, ledger map + ask panel, live ingestion.
- **Backend** — FastAPI + sse-starlette + Anthropic SDK. Five routes: `/healthz`, `/api/repos`, `/api/repos/{owner}/{name}/ledger`, `/api/query`, `/api/impact`, `/api/ingest`.
- **Storage** — DuckDB ledger (decisions / citations / alternatives / edges / ingestion_runs) with idempotent upsert on `(repo, pr_number)`.
- **Ingestion** — GraphQL-first GitHub fetcher with ETag cache and exponential backoff, parallel classify → filter → extract → stitch orchestrator.

## Status

Submission targets Sunday, April 26, 2026, 8:00 PM EST.

Postmortem ships with its own commit history in the ledger: the classifier accepted 6 of the 9 commits to date as architectural decisions, and the graph-stitcher traced the supersedes chain from Day 2 foundations → Day 3 query engine → Day 4 impact ripple. Follow the commits to see how this repo became its own test case.

## License

MIT.

---

*Code lives. Intent is a ghost. Postmortem summons it.*
