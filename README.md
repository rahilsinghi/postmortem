# Postmortem

**A decision-archaeology agent for any GitHub repo.**
Point it at a codebase — it reads every PR review, every rejected alternative, every architectural debate, and builds a queryable ledger. Ask it anything; get a cited answer back in seconds.

Built in 5 days during [*Built with Opus 4.7: a Claude Code Hackathon*](https://cerebralvalley.ai/events/~/e/built-with-4-7-hackathon) — April 21–26, 2026.

> *Code lives. Intent is a ghost. Postmortem summons it.*

---

## At a glance

| | |
|---|---|
| **Live app** | **[postmortem-mauve.vercel.app](https://postmortem-mauve.vercel.app/)** — gallery, ledger graph, ask panel, 3-min autoplay demo |
| **Live API** | **[postmortem-backend.fly.dev](https://postmortem-backend.fly.dev/healthz)** — FastAPI + SSE streaming + DuckDB ledger (EWR region, Fly.io) |
| **MCP server** | `claude mcp add postmortem -- uv run --project /path/to/backend python -m app.mcp_server` (click **Connect to Claude Code** on the gallery for a one-click copy) |
| **Stack** | Next.js 16 · FastAPI · DuckDB · Anthropic Opus 4.7 · 1M context · self-check · SSE streaming |
| **Hero ledgers** | hono · zustand · next.js · shadcn/ui · self-graphify · supabase — **155 decisions, 1,876 citations, $85** |
| **License** | MIT |

---

## The problem

Engineers spend 20–30% of their time reverse-engineering *why* existing code is the way it is. The answers almost never live in the code. They're buried in PR discussions, review threads, and the heads of engineers who've moved on.

Static analysis reads *what code is*. **Postmortem reads the history of thought behind it** — and Claude Opus 4.7 is the first model with the reasoning depth, agentic self-checking, and 1M context to make this tractable.

---

## What it does

Point Postmortem at any public GitHub repo. It reads the entire intent layer — every PR, every review comment, every issue thread — and builds a structured **decision ledger**:

- A queryable graph of architectural decisions with rationale and rejected alternatives
- Every claim cites an exact reviewer quote, verified by a second-pass self-check (unverified citations render red)
- Three query modes: **Query** (ask anything), **Impact Ripple** (what breaks if X changes?), **Open Decision** (full rationale for one PR)

Sample questions it answers well:

- *"Why does this codebase use Uint8Array instead of Buffer?"*
- *"What alternatives did the maintainers reject when they chose this routing scheme?"*
- *"What breaks if we relax the `node:*`-modules ban in core?"*

---

## Feature tour

The web UI has four signature interactions. A 3-minute autoplay on the gallery walks through every one.

| Feature | What it does |
|---|---|
| **Time Machine** | Scrub through the ledger's chronology. Nodes fade in at their real PR-merge dates; three years of architectural thought compressed into a 10-second reveal. |
| **Reasoning X-Ray** | Cyan scan-line + live trace while Opus answers — phase events, citation-token discoveries, self-check verdict. Not fabricated; every line is real signal. |
| **Provenance Peek** | Hover any citation chip → editorial card unfurls with the verbatim reviewer quote, source-type glyph, author, timestamp, related-thread link. |
| **Follow the Thread** | Click a citation → the graph spring-pans to the cited decision, kin nodes (same PR / same author / edge-connected) soft-tint. Citations become a map. |

Plus:

- **Impact Ripple** — BFS over the decision graph from any anchor, hand only that slice to Opus, traces cascading consequences with cited claims.
- **Live ingestion** — paste any public repo, watch classifier + extractor stream in real time with per-PR cost.
- **Cost engine** — every ingestion and query persists to `query_runs` / `ingestion_runs`; gallery cards show lifetime spend per repo.

---

## Hero ledgers shipped

Numbers are sourced from `.cache/ledger.duckdb` at commit time — not hand-tallied.

| Repo | Decisions | Citations | Alternatives | Edges | Ingested | Queried |
|---|--:|--:|--:|--:|--:|--:|
| `honojs/hono` | 59 | 751 | 190 | 27 | $31.87 | $14.78 |
| `pmndrs/zustand` | 41 | 385 | 83 | 36 | $19.99 | $4.02 |
| `vercel/next.js` | 33 | 468 | 104 | 14 | $22.50 | — |
| `shadcn-ui/ui` | 15 | 181 | 27 | 6 | $7.21 | $1.85 |
| `rahilsinghi/postmortem` *(self-graphify)* | 6 | 77 | 5 | 7 | $1.89 | $1.83 |
| `supabase/supabase` | 1 | 14 | 1 | 0 | $1.57 | — |
| **Total** | **155** | **1,876** | **410** | **90** | **$85.03** | **$22.48** |

22% of the $500 hackathon budget — all 9 ingestion runs + 8 query/impact runs.

---

## Performance envelope

Measured end-to-end against the live Fly deployment. Numbers are representative, not worst-case.

| Call | Time-to-first-token | Full response | Notes |
|---|--:|--:|---|
| `/api/repos` (cached ledgers list) | 80–200 ms | 80–200 ms | served from DuckDB, warm machine |
| `/api/query` — high effort, 4K tokens | ~1.0–2.0 s | **10–25 s** | Opus 4.7, inline citation, self-check pass adds 3–6 s |
| `/api/query` — xhigh effort | ~1.2–2.5 s | 25–45 s | reserved for deep questions; used sparingly |
| `/api/impact` — BFS + reasoning | ~1.5–3.0 s | 15–40 s | scales with subgraph depth (typically 6–12 nodes) |
| `/api/ingest` — SSE stream start | ~200 ms | — | ingestion runs in the background via the orchestrator |

**Ingestion throughput** (mixed parallelism, rate-limit-bound on GitHub GraphQL):

| Phase | Model | Per-PR cost | Per-decision cost | Wall-clock |
|---|---|--:|--:|--:|
| Fetch (GraphQL + ETag cache) | — | — | — | ~1–3 s/PR |
| Classify | Sonnet 4.6 | $0.008–$0.015 | — | ~3–6 s/PR |
| Extract (rationale + alternatives) | Opus 4.7 | — | $0.15–$0.30 | ~15–30 s/decision |
| Stitch (supersedes / depends_on edges) | Sonnet 4.6 | — | $0.005–$0.01 | ~2–4 s/decision |

**Rules of thumb:**
- A typical 100-PR ingestion run finishes in **6–12 minutes** and costs **$3–$8**. hono (~1,500 PRs ingested over a bounded window) cost $31.87.
- Every run — ingest, query, impact — persists a row in `ingestion_runs` / `query_runs` so lifetime cost is live in the gallery.
- The hosted Fly backend uses a single 1GB-RAM machine in EWR with a 3GB persistent volume. Streaming never breaks on CORS; `FRONTEND_ORIGIN` is pinned to the Vercel deploy.
- **Hosted demo is read-only for public traffic:** queries and impact ripples against the 6 pre-ingested hero ledgers work against the hosted API; live ingestion of a new repo requires running the backend locally (see below).

---

## Postmortem as an MCP server

**Postmortem ships as an MCP stdio server.** Claude Code users can register it in one command and get five new tools. The live gallery has a **`Connect to Claude Code`** button that opens a modal with the exact command pre-filled for your clone path — click-to-copy, no hand-editing.

```bash
claude mcp add postmortem -- \
  uv run --project /absolute/path/to/postmortem/backend python -m app.mcp_server
```

Then from any Claude Code session:

```
» claude "list postmortem ledgers"
» claude "why does hono reject node:* modules in core?"
» claude "open PR 3813 in hono"
» claude "impact ripple from hono PR 3813"
```

| Tool | Needs API key? | What it does |
|---|:---:|---|
| `postmortem_list_repos` | no | markdown table of cached ledgers + lifetime spend |
| `postmortem_list_decisions` | no | summary list per repo, optional category filter |
| `postmortem_open_decision` | no | full rationale + rejected alternatives for one PR |
| `postmortem_query` | yes | Opus 4.7 cited answer + self-check verdict |
| `postmortem_impact` | yes | BFS subgraph + cascading consequences |

Read-only tools are offline-capable — they hit the local DuckDB directly. Live query / impact calls the Anthropic API. Full docs in [`docs/MCP-SERVER.md`](docs/MCP-SERVER.md).

---

## Running it locally

**Prereqs:** `uv` · `pnpm` · `GITHUB_TOKEN` + `ANTHROPIC_API_KEY` in `.env.local`

```bash
# Clone + install
git clone https://github.com/rahilsinghi/postmortem.git
cd postmortem

# Backend
cd backend && uv sync && \
  uv run uvicorn app.main:app --host 127.0.0.1 --port 8765

# Frontend (other terminal)
cd frontend && pnpm install && pnpm dev
# → http://localhost:3000

# Ingest a new repo
uv run --project backend python scripts/ingest.py pmndrs/zustand \
  --limit 200 --min-discussion 3 --db .cache/ledger.duckdb
```

**Point the frontend at the hosted backend instead:** set `NEXT_PUBLIC_API_BASE=https://postmortem-backend.fly.dev` in `frontend/.env.local` and you get the 6 hero ledgers without running Python. Ingestion still requires a local backend because it needs your `GITHUB_TOKEN` and an `INGEST_AUTH_TOKEN` header.

**Demo layer is cold-boot capable.** The 3-minute autoplay (click `▶ Play the Postmortem demo` on the gallery) runs entirely from `frontend/public/demo/*.json` fixtures — no backend process, no API key required. Useful for recording videos.

---

## Deploying your own

Both halves deploy with one command each. This is the exact pipeline behind the live app.

**Frontend → Vercel:**

```bash
cd frontend
vercel --prod
# set env vars once on the Vercel dashboard:
#   NEXT_PUBLIC_API_BASE=https://<your-fly-app>.fly.dev
#   NEXT_PUBLIC_INGEST_TOKEN=<matches backend INGEST_AUTH_TOKEN>
```

**Backend → Fly.io:**

```bash
cd backend
flyctl launch --no-deploy           # uses backend/fly.toml
flyctl volumes create ledger_data --size 3 --region ewr
flyctl secrets set ANTHROPIC_API_KEY=... GITHUB_TOKEN=... \
  INGEST_AUTH_TOKEN=... FRONTEND_ORIGIN=https://<your>.vercel.app
flyctl deploy
# seed the volume with a pre-built ledger:
flyctl ssh sftp shell
> put .cache/ledger.duckdb /data/ledger.duckdb
```

Config lives at [`frontend/vercel.json`](frontend/vercel.json) and [`backend/fly.toml`](backend/fly.toml). DuckDB's file lock keeps the backend single-writer; `fly.toml` pins `min_machines_running = 1` and single-process uvicorn so the volume stays consistent.

---

## Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                         Postmortem ingestion                      │
│                                                                   │
│   GitHub GraphQL  ─▶  decision-classifier (Sonnet)                │
│                             │                                     │
│                             ▼ accepted PRs only                   │
│                       rationale-extractor (Opus)                  │
│                             │                                     │
│                             ▼                                     │
│                       graph-stitcher (Sonnet) ─▶ DuckDB           │
│                                                     │             │
│                                                     ▼             │
└──────────────────────────────────────────────────  ledger.duckdb  ┘
                                                     │
          ┌──────────────────┬──────────────────────┐│
          ▼                  ▼                      ▼▼
    FastAPI /api        MCP stdio server      scripts/ingest.py
      • /query            • postmortem_query    (CLI path)
      • /impact           • postmortem_impact
      • /ingest (SSE)     • postmortem_list_*
      • /repos, /ledger   • postmortem_open_decision
          │                       │
          ▼                       ▼
    Next.js frontend         Claude Code
     • entry gallery          • tool invocations
     • ledger graph           • streaming answers
     • ask panel              • citation brackets
     • live ingest UI
     • demo layer
```

- **Frontend** — Next.js 16 App Router · Tailwind v4 · Framer Motion 12 · React Flow (dagre LR layout) · Biome · Vitest
- **Backend** — FastAPI · sse-starlette · Anthropic SDK · httpx · pydantic v2 · DuckDB
- **Ingestion** — GraphQL-first fetcher with ETag cache + exponential backoff · parallel classify → filter → extract → stitch orchestrator
- **Storage** — DuckDB ledger: `decisions` · `citations` · `alternatives` · `decision_edges` · `ingestion_runs` · `query_runs` · idempotent upsert on `(repo, pr_number)`
- **Cost engine** — every run (ingest, query, impact) persists a row; gallery + ledger header surface lifetime spend live

Three sub-agents live in [`backend/app/agents/`](backend/app/agents/):

| Agent | Model | Role |
|---|---|---|
| `decision-classifier` | Sonnet 4.6 | Per PR: "is this an architectural decision?" |
| `rationale-extractor` | Opus 4.7 | Per accepted decision: pulls rationale + rejected alternatives with per-claim citations |
| `graph-stitcher` | Sonnet 4.6 | Finds `supersedes` / `depends_on` / `related_to` edges between decisions |

---

## What makes this possible

Claude Opus 4.7 shipped on April 16, 2026. Postmortem uses its new capabilities as load-bearing infrastructure:

- **1M-token context** — full decision ledger in one pass at query time (hono's 59 decisions serialise to ~145K tokens — plenty of headroom)
- **Agentic self-checking** — every inline citation is verified against the ledger before the answer is returned; unverified claims tinted red
- **Prompt caching** — system prompts cached via `cache_control: ephemeral`, cuts extractor cost ~40% on the second call in a batch
- **Streaming** — SSE word-boundary reasoning surfaces live; citation chips resolved client-side against the loaded ledger

Three sub-agents live in `.claude/agents/`, four Skills in `.claude/skills/` cover supporting capabilities (PR archaeology, commit rationale, citation formatting, ledger writing).

---

## Demo + voiceover scripts

- [`docs/DEMO-VOICEOVER.md`](docs/DEMO-VOICEOVER.md) — ElevenLabs-ready voiceover script for the 3-min combined reel. Cue-mapped, pronunciation glossary, music direction.
- [`docs/DEMO-MCP.md`](docs/DEMO-MCP.md) — terminal-native MCP demo script (live-terminal recording workflow as an alternative to the web emulator).
- [`docs/DEMO-SCRIPT.md`](docs/DEMO-SCRIPT.md) — legacy 2-min manual demo walkthrough.

---

## Design docs

Every major wave of work has an approved design spec in [`docs/superpowers/specs/`](docs/superpowers/specs/) and an implementation plan in [`docs/superpowers/plans/`](docs/superpowers/plans/):

- `ambitious-demo-bundle` — Time Machine + Reasoning X-Ray + Provenance Peek + Follow the Thread
- `demo-layer` — 3-minute cinematic autoplay architecture (URL-flag driven, fixture-replay, zero-backend)

Full SPEC of the underlying product: [`docs/SPEC.md`](docs/SPEC.md) (locked Day 1, 975 lines).

---

## Submission status

Submission: Sunday, April 26, 2026, 8:00 PM EST.

Postmortem ships with its own commit history in the ledger — the classifier accepted 6 of its own architectural decisions, and the graph-stitcher traced supersedes chains through the build days. Follow the commits to see how this repo became its own test case.

## License

MIT.
