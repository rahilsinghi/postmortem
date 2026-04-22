# Postmortem

> A decision-archaeology agent for any codebase. Built on Claude Opus 4.7.
> Built during *Built with Opus 4.7: a Claude Code Hackathon* (April 21–26, 2026).

---

## What Postmortem does (read this every session)

Postmortem reads a GitHub repo's **intent layer** — every PR description, every code review comment, every commit message, every issue thread, every linked ADR — and builds a queryable **decision ledger**: a structured graph of *why* the code is the way it is. Users ask "why does this module exist?" or "what breaks if I change this assumption?" and get back a cited reasoning chain traced through actual engineering debates.

**The single defensible wedge:** static analysis reads *what code is*. Postmortem reads the *history of thought behind the code*. Opus 4.7 is the first model with enough reasoning depth, self-checking, and 1M context to make this tractable as a product.

**Postmortem is NOT:** another codebase chat (Cody, Cursor, Continue), a PR review bot (Greptile, CodeRabbit), a symbol graph (Sourcegraph), or an ADR generator. Those all operate on code or on new changes. Postmortem operates on *historical provenance* — the decisions buried in artifacts no one indexes.

---

## Project rules (non-negotiable)

1. **This is the hackathon submission.** Every commit counts. Every commit must be meaningful. No "wip" commits pushed to main — squash locally.
2. **All code is new, written during the hackathon (April 21+).** No prior work is imported. No references to external prior projects in public files.
3. **Ship the spec, not the dream.** `docs/SPEC.md` is the contract. New features require spec updates first.
4. **Scope discipline over feature count.** The 5-day plan in `docs/SPEC.md` §15 has EOD targets per day. Anything not shipped by its target day gets *simplified*, not abandoned.
5. **Reasoning quality is the product.** Postmortem's answers must cite every claim. A beautiful UI on a hallucinating engine is a lost hackathon.
6. **Demo reliability beats architectural elegance.** If a feature works unreliably, it does not ship in the demo video.

---

## Product constants

- **Name:** Postmortem (always capitalized, never "PostMortem" or "postmortem" in user-facing copy)
- **Tagline:** "A decision-archaeology agent for any codebase."
- **Poetic close:** "Code lives. Intent is a ghost. Postmortem summons it."
- **Repo:** github.com/rahilsinghi/postmortem
- **Primary model:** `claude-opus-4-7` (ID exact, case-sensitive)
- **Sub-agent classifier model:** `claude-sonnet-4-6` (cost discipline — classifier runs thousands of times per ingestion)
- **Beta headers required:**
  - `managed-agents-2026-04-01`
  - `skills-2025-10-02`
  - `task-budgets-2026-03-13`
  - `code-execution-2025-08-25` (for Skills that run scripts)

---

## Hero repos (locked for Day 1)

These three get ingested, cached, and demoed. Pick queries against them whose answers are verifiable on GitHub.

| Tier | Repo | Why | Rough size |
|------|------|-----|-----------|
| Recognizable | `shadcn-ui/ui` | Judges know it; design-system decisions are vivid (Radix, CVA, tokens) | ~1,500 PRs |
| Developer-favorite | `honojs/hono` | Rich framework-wars discussion; Hono vs. Express decisions visible | ~2,000 PRs |
| Small-but-famous | `pmndrs/zustand` | One opinionated maintainer; almost every PR has "why this pattern" debate | ~800 commits |

**Fourth slot (Postmortem itself) goes in on Day 5 via the self-graphify moment.**

---

## Stack (locked)

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 15 (App Router) + React 19 + Tailwind v4 + Framer Motion 12 |
| Graph viz | React Flow (primary), d3-force as fallback |
| Backend | FastAPI (Python 3.11+) + `uvicorn` + `sse-starlette` |
| Ingestion runtime | Claude Managed Agents (beta: `managed-agents-2026-04-01`) |
| Query runtime | Anthropic Messages API with `claude-opus-4-7`, 1M context, task budgets |
| Ledger storage | DuckDB (structured) + LanceDB (embeddings) |
| Embeddings | OpenAI `text-embedding-3-large` (TBD Day 2; fallback Voyage-3) |
| Deploy | Vercel (frontend) + Google Cloud Run (backend) |
| Package mgr | `pnpm` (frontend), `uv` (Python) — both are faster and more reproducible than alternatives |
| Git operations | `git` CLI + `PyGithub` + `gql` (GraphQL) |

---

## Directory layout

```
postmortem/
├── CLAUDE.md                   # This file — every session reads this
├── README.md                   # Public-facing
├── LICENSE                     # MIT
├── docs/
│   ├── SPEC.md                 # The full product spec (source of truth)
│   ├── DEMO-SCRIPT.md          # Demo video script (locked Day 4)
│   └── architecture/           # ADRs for THIS project as we make them
├── .claude/
│   ├── agents/                 # Sub-agent definitions (see §9 of SPEC)
│   │   ├── decision-classifier.md
│   │   ├── rationale-extractor.md   # merged: rationale + rejected alternatives
│   │   └── graph-stitcher.md
│   ├── skills/                 # Custom Skills (see §10 of SPEC)
│   │   ├── pr-archaeology/
│   │   ├── commit-rationale/
│   │   ├── citation-formatter/
│   │   └── ledger-writer/
│   └── sessions/               # Screenshots of key Claude Code sessions (optional, submission flex)
├── backend/
│   ├── app/
│   │   ├── main.py             # FastAPI entry
│   │   ├── routers/
│   │   │   ├── ingest.py       # POST /ingest — kicks off Managed Agents session
│   │   │   ├── query.py        # POST /query — answers against cached ledger
│   │   │   └── stream.py       # SSE endpoint for live ingestion
│   │   ├── managed_agents/
│   │   │   ├── agent.py        # Agent/environment creation
│   │   │   └── ingestion_orchestrator.py
│   │   ├── ledger/
│   │   │   ├── schema.py       # DuckDB schema
│   │   │   ├── store.py        # CRUD on decisions/rationales/alternatives
│   │   │   └── search.py       # LanceDB semantic search
│   │   └── github/
│   │       ├── graphql.py      # PR + issue fetches
│   │       └── rate_limit.py   # ETag cache + backoff
│   ├── pyproject.toml
│   └── Dockerfile
├── frontend/
│   ├── app/                    # Next.js 15 App Router
│   │   ├── page.tsx            # Screen 1: Entry / Gallery
│   │   ├── ledger/[repo]/page.tsx  # Screen 2: Ledger Map + Ask
│   │   └── ingest/[jobId]/page.tsx # Screen 3: Live ingestion
│   ├── components/
│   │   ├── ReasoningTrace.tsx  # THE hero component — streamed citations
│   │   ├── LedgerGraph.tsx     # React Flow decision graph
│   │   ├── CitationChip.tsx    # Hover card with quoted text + link
│   │   └── AskPanel.tsx        # Query input + suggested queries
│   ├── lib/
│   │   ├── sse.ts              # EventSource wrapper
│   │   └── types.ts            # Shared types with backend
│   ├── package.json
│   └── next.config.ts
└── scripts/
    ├── bootstrap-hero-repo.sh  # Idempotent hero repo ingestion
    ├── verify-opus-4-7.py      # Day 1 smoke test
    └── smoke-managed-agents.py # Day 1 smoke test
```

---

## Sub-agent topology

Three sub-agents live in `.claude/agents/`. They are invoked by the main Claude Code session during development AND by the ingestion orchestrator (which embeds their prompts) during runtime.

| Agent | Model | Purpose | When to use |
|-------|-------|---------|-------------|
| `decision-classifier` | Sonnet 4.6 | Given a PR, determine if it's an architectural decision. Returns strict JSON. | Every PR, during ingestion. |
| `rationale-extractor` | Opus 4.7 | Given a classified decision, extract structured rationale (context, decision, forces, consequences, deciders) AND every rejected alternative with per-claim citations. | Only for classifier-confirmed decisions. |
| `graph-stitcher` | Sonnet 4.6 | Find structural connections between newly-extracted decisions and existing ledger entries. | Batch mode, after extraction. |

**Why three, not four:** rationale and rejected alternatives live in the same PR-discussion text. Splitting them into two agents meant two Managed Agents round-trips per decision over identical source material. A single `rationale-extractor` pass emits both (`rationale` fields + `alternatives[]` array) — same model, same token budget, one call.

**Orchestration pattern:** parallel-classify a batch of 50 PRs → filter to decisions → parallel-extract-rationale-and-alternatives per decision → batch-stitch new entries into ledger. Rate limits are the constraint, not concurrency.

---

## Coding conventions

### Python (backend + scripts)

- Python 3.11+; use `uv` for dependency management
- `black` + `ruff` (configured in `pyproject.toml`)
- Async everywhere FastAPI touches (`async def`, `httpx.AsyncClient`)
- Type hints required on every function signature
- Pydantic v2 models for every API boundary
- No bare `except`; catch specific exceptions
- Tests: `pytest` + `pytest-asyncio`, aim for coverage on the ledger and GitHub modules (the parts where bugs corrupt the product)

### TypeScript (frontend)

- TypeScript strict mode on
- `biome` for format + lint (faster than eslint+prettier, fewer config headaches)
- No `any` without a `// biome-ignore` comment explaining why
- Server Components by default; Client Components only where needed (interactivity, hooks)
- Tailwind utility classes preferred over custom CSS; extract to components when utility lists exceed ~4 items
- Tests: `vitest` for logic, not chasing 100% coverage — test ledger parsing, citation rendering, SSE reconnection

### Git hygiene

- Conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`
- Every commit passes CI (GitHub Actions: lint + type-check + unit tests)
- Squash locally before pushing; no "wip wip wip" commits in the public history
- PRs to main even as a solo dev — they're documentation for Postmortem to read itself later (the self-graphify moment depends on this)

---

## How to work with me (Claude Code)

### When you (Claude) are asked to build a feature

1. **Consult `docs/SPEC.md` first.** The spec is the source of truth. If a feature isn't there, push back before building.
2. **Check `CLAUDE.md` (this file) for conventions.** Stack, models, naming, directory layout — all locked.
3. **Read the relevant existing code** before writing new code. No duplicate utilities, no inconsistent patterns.
4. **Plan, then execute.** For non-trivial tasks, state the plan in 5 bullets before touching files.
5. **Small commits.** A feature is usually 3–6 commits. Not one "done feature" commit.
6. **Tests come with code.** Ledger parsing, citation formatting, and rate-limit handling must have tests — those are the parts where silent bugs destroy the product.
7. **Use sub-agents.** If exploring an unfamiliar codebase (hero repo for ingestion testing), use Explore. For big research tasks, use `/ultrareview`.

### When you (Claude) are asked a factual question

- About Anthropic's products or APIs → verify via `docs.claude.com` / `platform.claude.com/docs` before answering
- About the GitHub API, dependency versions, or external tools → verify
- About this project → read the code and `docs/SPEC.md`; don't guess

### What you (Claude) should never do unprompted

- Change the stack choices (§Stack above)
- Add new dependencies (propose first, install only after approval)
- Rename files or directories (breaks imports; propose first)
- Write "example" or "demo" files unless explicitly asked
- Reference or import code from any repo other than this one (New Work Only rule)

---

## Opus 4.7 usage notes

- **Default model:** `claude-opus-4-7` for reasoning, extractions, queries
- **Effort levels:**
  - `high` — default for most ingestion extractors and standard queries
  - `xhigh` — reserve for the demo hero queries and for hard "impact ripple" questions during judging. Expensive — do not default to this.
- **Task budgets** — set per query based on complexity. Quick query = 100K tokens; deep investigation = 500K–2M.
- **Self-checking** — the query API's second pass verifies citations. This is the product's credibility — never skip it.
- **1M context** — hold the full decision ledger in one context for query-time reasoning. No need to fragment.
- **Streaming** — always stream to the frontend via SSE. Latency-to-first-token is part of the product feel.

---

## Cost discipline

$500 API credit budget. Known expensive operations:

| Operation | Approx cost | Controls |
|-----------|-------------|----------|
| Dev-time Claude Code usage | ~$30 over 5 days | Don't run long exploration sessions on Opus when Sonnet would do |
| One hero repo ingestion | $20–30 | Run each hero repo ONCE after classifier calibration is locked on Day 2 |
| One live demo ingestion (small repo) | $2–5 | Acceptable during rehearsal |
| One query, `high` effort | $0.20–0.50 | Unconstrained — queries are cheap |
| One query, `xhigh` effort | $0.80–2.00 | Reserve for demo hero queries |
| Managed Agents session-hour | $0.08 | Trivial |

**Red flags to stop and reconsider:**
- More than 3 ingestion runs on the same hero repo
- Any single query costing more than $3
- Daily spend above $100

---

## The meta-move

Postmortem is being built using Claude Code during a Claude Code hackathon. This is not incidental — it's the submission's voice. Every PR on this repo has a rich commit message and PR description because *Postmortem will eventually index its own history*. Day 5's self-graphify moment depends on this repo having the provenance Postmortem is designed to excavate.

**Write PRs like you want the best version of Postmortem to read them two years from now.** Because — if this works — it will.
