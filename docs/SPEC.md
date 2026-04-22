# Postmortem — Hackathon Spec

> A decision-archaeology agent for any codebase. Built with Claude Opus 4.7.
> *Built with Opus 4.7: a Claude Code Hackathon — April 21–26, 2026.*
> Solo build · 5 days · $500 API credits.

---

## Table of Contents

1. [The product in one paragraph](#1-the-product-in-one-paragraph)
2. [The pitch (three tiers)](#2-the-pitch-three-tiers)
3. [Why this wins](#3-why-this-wins)
4. [Competitive landscape & differentiation](#4-competitive-landscape--differentiation)
5. [What Opus 4.7 specifically unlocks](#5-what-opus-47-specifically-unlocks)
6. [Product scope: modes & features](#6-product-scope-modes--features)
7. [System architecture](#7-system-architecture)
8. [Claude toolchain integration](#8-claude-toolchain-integration)
9. [Sub-agent topology](#9-sub-agent-topology)
10. [Agent Skills pack](#10-agent-skills-pack)
11. [Managed Agents session design](#11-managed-agents-session-design)
12. [Data ingestion pipeline](#12-data-ingestion-pipeline)
13. [Query engine & the decision ledger](#13-query-engine--the-decision-ledger)
14. [Frontend design](#14-frontend-design)
15. [5-day build plan](#15-5-day-build-plan)
16. [Demo script — minute by minute](#16-demo-script--minute-by-minute)
17. [Risk register](#17-risk-register)
18. [Cost estimate](#18-cost-estimate)
19. [Naming, positioning, submission copy](#19-naming-positioning-submission-copy)
20. [Open questions to resolve before Day 1](#20-open-questions-to-resolve-before-day-1)

---

## 1. The product in one paragraph

Postmortem is a decision-archaeology agent. You point it at any GitHub repo and it spends a Managed Agents session reading the repo's *intent layer* — every PR description, every code review comment, every commit message, every issue thread, every linked ADR — and builds a **decision ledger**: a queryable graph of *why* the code is the way it is. When you ask "why does this module exist" or "what breaks if I change this assumption," you don't get a static analysis answer. You get a cited reasoning chain that traces through actual engineering debates, resolved tradeoffs, and the specific humans who made the call, with links to every source artifact. Code lives. Intent is a ghost. Postmortem summons it.

Three sentences:

- Static tools read *code*. Postmortem reads the *history of thought behind the code*.
- Every architectural decision that matters is buried in PRs, reviews, and issues — never in the code itself. Postmortem excavates it.
- Built with Claude Opus 4.7's 1M context, self-checking, and long-horizon agentic execution — the first model with enough reasoning depth to make this tractable.

---

## 2. The pitch (three tiers)

**8-second pitch (for the mom-test):**
> Every codebase has a graveyard of decisions nobody can explain anymore. Postmortem brings them back.

**30-second pitch (for the submission copy):**
> Engineers spend 20-30% of their time trying to understand why existing code is the way it is. The answers are never in the code — they're buried in PRs, review debates, issues, and the heads of people who left. Postmortem is a decision-archaeology agent that reads all of it, builds a cited decision ledger, and lets you ask *"why is this here?"* of any codebase. Built on Claude Opus 4.7's 1M context and self-checking agentic loops, it traces architectural intent through provenance no other tool sees.

**The reviewer's question answered in one line:**
> Static analysis reads the code. Postmortem reads the history of thought behind the code — and Opus 4.7 is the first model with enough reasoning depth to traverse that provenance and synthesize it into answers.

---

## 3. Why this wins

Read against the [Opus 4.6 winners pattern](https://claude.com/blog/meet-the-winners-of-our-built-with-opus-4-6-claude-code-hackathon):

| Winner criterion | CrossBeam / PostVisit / TARA pattern | Postmortem |
|------------------|--------------------------------------|------------|
| **Specific, numbered problem** | "$30K per permit delay" / "$1–4M feasibility studies" | "20-30% of engineering time spent on codebase comprehension" (GitHub, DORA) |
| **Authentic domain expert** | Lawyer, cardiologist, ministry engineer | Builder of Brain + multi-agent second-brain stack; month of lived taste in reasoning over knowledge graphs |
| **Opus load-bearing, not decorative** | Vision-parsing dashcam, spatial indexing of blueprints | 1M ctx holds full PR history; self-checking cites every claim; extended thinking traverses the ledger |
| **Public-interest framing** | Housing, healthcare, road equity | Every engineer handed legacy code has felt this; a universal tax on the profession |
| **Pre-recorded demo friendly** | Uploaded dashcam → PDF report; patient-intake flow | Paste GitHub URL → live agent investigation → cited answer |
| **Solo-buildable in 5 days** | All winners shipped solo (and 4 of 5 were non-developers with Claude Code) | Yes, with the scope discipline in §15 |

**What Postmortem is NOT:**
- Not "another codebase chat" (Cody, Cursor, Continue, Augment): those answer *what code does* using code. Postmortem answers *why code exists* using provenance.
- Not a PR review bot (Greptile, CodeRabbit, Bugbot): those evaluate new changes. Postmortem interrogates existing decisions.
- Not Sourcegraph's "Code Graph": that's an AST/symbol graph. Postmortem's ledger is an *intent* graph.
- Not an ADR generator (Workik, futurecraft.pro): those write new ADRs from new PRs. Postmortem reconstructs the decision layer *retrospectively* from history you never documented.
- Not Brain (the author's prior work). Postmortem is a **fresh codebase** built this week, targeting a different problem with different architecture.

---

## 4. Competitive landscape & differentiation

### 4.1 The closest products and exactly where they stop

| Product | What it does | Where it stops |
|---------|--------------|----------------|
| **Sourcegraph Cody** | RAG over full codebase for chat/completions | Retrieves code by embedding similarity + AST. Has no concept of *decision rationale*. Can summarize recent commits but cannot trace the debate behind a decision. |
| **Greptile** | Codebase-aware AI PR review; graph of functions/files/deps | Reviews *new changes*. Understands *architectural drift*. But the "why" it catches is from its custom-rules files, not from reasoning through historical PR discussions. |
| **Augment Context Engine** | 400K-file semantic understanding for AI hallucination reduction | Still fundamentally a retrieval layer. No separate intent/decision model. |
| **Cursor / Continue / Claude Code** | IDE-based codebase chat | File-level RAG. Can answer questions about current code. Cannot reconstruct historical reasoning chains. |
| **CodeScene** | Temporal analysis of commits for hotspot detection | Statistical patterns (churn, authorship) — no semantic understanding of *why*. |
| **GitKraken / GitLens / Gource** | Visual git history | Visualization only. No reasoning. |
| **ADR generation tools** (Workik, joelparkerhenderson/adr, futurecraft.pro) | LLM writes *new* ADRs from *new* PRs | Prospective, not retrospective. Requires discipline to adopt. Postmortem works on repos that have *never written an ADR in their life*. |

### 4.2 Postmortem's single defensible wedge

**The provenance layer is unbuilt.** Every competitor above indexes *what code is*. Nobody indexes the archaeological record of *why it became that way* — the resolved debate in PR #4512, the rejected alternative in issue #891, the "we decided against X because Y" comment buried 47 replies deep. That record exists in every mature repo and is currently recoverable only by a human willing to dig for 2–6 hours per question. Postmortem makes it queryable in seconds.

### 4.3 Elevator objection-handling

- *"Isn't this just RAG over PRs?"* — No. RAG surfaces *relevant* text. Postmortem's decision ledger is a *structured reasoning graph* where decisions are nodes, rationales are edges, alternatives-considered are first-class, and Opus 4.7's self-checking verifies that every claim ties back to a cited artifact.
- *"Can't I just ChatGPT my PR archive?"* — You can paste a handful. You cannot hold React's 18,000 merged PRs in context. Postmortem's ingestion pipeline structures them into a ledger; Opus 4.7's 1M context holds the ledger; task budgets bound the investigation per query.
- *"Why hasn't someone done this?"* — They have tried. The reasoning quality wasn't there. Opus 4.6 could not reliably traverse a decision graph with citation discipline. Opus 4.7's self-checking and agentic reliability are what make this a product this week instead of a research paper.

---

## 5. What Opus 4.7 specifically unlocks

Four features shipped April 16 that make Postmortem tractable. Every one is load-bearing, not decorative.

| 4.7 feature | Role in Postmortem | Without it |
|-------------|---------------------|------------|
| **1M context at standard pricing** | Hold full structured decision ledger for mid-sized repo in one session | Would need aggressive retrieval + summarization, lossy |
| **Agentic self-checking** | Verify that every claim in an answer ties back to a cited commit/PR/comment before returning | Hallucinated citations would kill the product's entire value proposition |
| **Task budgets** (`task-budgets-2026-03-13`) | Expose "investigation depth" per query as a UX control — `quick`, `deep`, `exhaustive` | Either always-shallow or always-expensive |
| **xhigh effort level** | For the deepest "why did they change direction?" queries where extended thinking genuinely helps | Answers would feel surface |
| **High-res vision (2576px)** | Read architecture diagrams, whiteboard photos, and image attachments in PRs at native resolution | Miss a whole modality of intent that lives in image form |
| **Strict instruction following** | Cite-every-claim is an instruction we need followed literally | Softer citation discipline |

Also used: **Claude Managed Agents** (hosted harness for the multi-hour ingestion run), **Agent Skills** (packaged capabilities for PR parsing, decision-classification, citation-format), **Claude Code sub-agents** during the build itself (we use the tool while building the tool — good for the demo video).

---

## 6. Product scope: modes & features

### 6.1 Two modes, both live at submission

**Mode A — Pre-indexed hero mode.**
Five hero repos are pre-ingested before the demo. Each has ~500–2000 commits with rich PR discussion. The query experience is instant (sub-second).
- **Hero candidates:** React, Redux, Zustand, shadcn/ui, TanStack Query, Prettier, tRPC, Honojs. (Pick 3–5; see §20 for the final selection criteria.)
- **Demo use:** the killer query with a known historical answer the judge can verify.

**Mode B — Live small-repo mode.**
User pastes a GitHub URL for a repo under 500 commits (configurable cap). A Managed Agents session kicks off and streams progress as it ingests. Takes 30–90 seconds. Answers first query at the end.
- **Demo use:** "here, try it on your own repo" moment.
- **Cap is shown in the UI clearly.** Larger repos get a message: *"Repos over 500 commits are supported via pre-indexing — we're running a few in the hero gallery. Try one of those."*

**Explicitly out of scope for v1 (this hackathon):**
- Private repos / auth beyond a public GitHub PAT
- Continuous re-indexing on new commits (one-shot only)
- Multi-repo queries
- GitLab, Bitbucket, self-hosted git
- Anything that requires writing back to GitHub (comments, PRs, etc.)

### 6.2 Core feature list

For the submission video, the hero features are:

1. **The Decision Ledger Map.** A visual tree/graph of the repo's top ~30 architectural decisions, clustered by domain (auth, data, routing, build, etc.). Click a node → see the decision card with cited sources.
2. **The Why-Query.** Natural-language question box. Answers arrive as streamed *reasoning chains* with inline citations that link to the exact PR comment, commit, or issue.
3. **The Alternatives Panel.** For any decision, show *what else was considered* and why it lost. This is the highest-value, lowest-documented thing in a codebase.
4. **The Impact Ripple.** Given a hypothetical change ("what if I swap X for Y?"), surface decisions downstream of X that would become invalidated. This is the crown jewel of the demo.
5. **Live ingestion progress.** For Mode B — the judge sees the agent working in real time. Commits per second, PRs parsed, decisions classified, with a live log of the sub-agents' reasoning. This is demo theater *and* it's real.

### 6.3 The non-obvious feature that closes the deal

**Self-graphify on submission.** During the video, after showing Mode A and Mode B on famous repos, we end with: *"Postmortem was built this week. Here's what it looks like when Postmortem runs on itself."* We paste `github.com/<user>/postmortem` into the input, and the live ingestion shows the agent discovering its own commits from 5 days of hackathon work. The final query asked: *"What was the hardest decision made during this build?"* Answer pulls from actual commit messages and local ADR files committed during the week. Total demo time: ~20 seconds. Maximum poetic punch.

This is the moment. It's also honest — every commit it cites *is* new work from this week.

---

## 7. System architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js 15 + React + Tailwind + Framer Motion)            │
│  ┌──────────────┐  ┌───────────────┐  ┌───────────────────────────┐  │
│  │ Repo entry   │  │ Ledger Map    │  │ Why-Query chat            │  │
│  │ URL / cached │  │ (D3 / React   │  │ + Alternatives + Ripple   │  │
│  │              │  │  Flow graph)  │  │ + streamed citations      │  │
│  └──────┬───────┘  └──────┬────────┘  └───────────┬───────────────┘  │
└─────────┼─────────────────┼───────────────────────┼──────────────────┘
          │                 │                       │
          │   WebSocket + SSE for live streaming    │
          │                 │                       │
┌─────────▼─────────────────▼───────────────────────▼──────────────────┐
│  FastAPI orchestrator (Python 3.11+)                                 │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────────────┐   │
│  │ Ingestion API │  │ Query API    │  │ Cache / Ledger store     │   │
│  │ kicks off     │  │ routes to    │  │ DuckDB for structured    │   │
│  │ Managed Agent │  │ Opus 4.7     │  │ + LanceDB for embeddings │   │
│  └───────┬───────┘  └──────┬───────┘  └──────────────────────────┘   │
└──────────┼─────────────────┼────────────────────────────────────────-┘
           │                 │
           ▼                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Claude Managed Agents (hosted by Anthropic)                         │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Ingestion agent (long-running, minutes)                      │    │
│  │ ├── Fetch PRs via GitHub GraphQL (bulk)                      │    │
│  │ ├── Fetch commits via `git clone` in container               │    │
│  │ ├── Sub-agent: decision-classifier (per PR)                  │    │
│  │ ├── Sub-agent: rationale-extractor (per classified decision; │    │
│  │ │   emits rationale + rejected alternatives in one pass)     │    │
│  │ └── Write decision ledger JSON + embeddings back to cache    │    │
│  └──────────────────────────────────────────────────────────────┘    │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │ Query agent (short-lived per query)                          │    │
│  │ ├── Load decision ledger into 1M context                     │    │
│  │ ├── Extended thinking traversal                              │    │
│  │ ├── Self-checking citation verification                      │    │
│  │ └── Stream cited answer to frontend                          │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
           │                 │
           ▼                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  External: GitHub REST + GraphQL API, git itself                     │
└──────────────────────────────────────────────────────────────────────┘
```

### 7.1 Tech stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend | Next.js 15 + React 19 + Tailwind v4 + Framer Motion | Your default; you can ship it |
| Graph viz | React Flow (primary), d3-force fallback | React Flow gets a functional interactive graph fast; keep d3 as backup |
| Reasoning trace UI | Custom streamed component (server-sent events) | Need fine control over citation rendering |
| Backend | FastAPI + `uvicorn` | Your default; WebSocket + SSE both first-class |
| Ingestion runtime | Claude Managed Agents (hosted containers) | Long-running investigations with persistent sessions + built-in tool execution |
| Query runtime | Messages API with Opus 4.7 + 1M context + task budgets | Fast, stateless per-query |
| Ledger storage | DuckDB (structured) + LanceDB (embeddings) | DuckDB for fast relational queries on decisions; LanceDB for semantic search across PR text |
| Deploy (frontend) | Vercel | Your default |
| Deploy (backend) | Google Cloud Run | Your default; cheap and fast to iterate |
| Git operations | `git` CLI + `PyGithub` / `gql` | CLI for bulk commit log, GraphQL for PR history efficiency |
| Embeddings | `text-embedding-3-large` (OpenAI) OR Voyage-3 | For semantic search over decisions. Pick one before Day 2. |

### 7.2 Why Managed Agents (not a homegrown loop)

Managed Agents is the *exact* right fit for ingestion because it handles everything we'd otherwise rebuild:

- **Hosted container** — `git clone` happens inside Anthropic's environment, not our Cloud Run worker
- **Built-in tool execution** — bash, file ops, web fetch all pre-wired
- **Stateful session** — decision ledger accumulates in the session's file system across the ingestion run
- **Context compaction** — we're going to exceed 1M context during ingestion of a 1000-PR repo, and Managed Agents handles compaction for us
- **$0.08/session-hour** pricing means a 2-hour ingestion costs $0.16 on top of tokens — trivially affordable
- **It's also the prize vector** — Best Use of Managed Agents is $5K, and "multi-hour investigation of a codebase" is the canonical Managed Agents use case

---

## 8. Claude toolchain integration

The hackathon is *Built with Opus 4.7: a Claude Code hackathon*. Using Claude Code well to build the project is part of the score. Here's the full stack:

### 8.1 CLAUDE.md / AGENTS.md (project root)

A rigorous `CLAUDE.md` at the repo root that:

- States the product vision, the novelty wedge, and the non-negotiables
- Establishes coding conventions (Python: black + ruff; TS: biome; tests: pytest + vitest)
- Pins Opus 4.7 model ID (`claude-opus-4-7`) and the `managed-agents-2026-04-01` beta header
- Documents the sub-agent topology (§9) so the main session auto-delegates
- Declares the memory policy (what goes in `.claude/memory`, what doesn't)
- **This file becomes part of the submission** — judges read CLAUDE.md files

### 8.2 Sub-agents directory (`.claude/agents/`)

Four custom sub-agents, one file each, used *during the build itself* (and referenced in the demo). See §9 for detail.

### 8.3 Custom Skills (`.claude/skills/`)

Four packaged skills, each a folder with SKILL.md + supporting scripts. See §10. Skills are the *operational* layer — the sub-agents use them.

### 8.4 MCP server integration

- **GitHub MCP** — for GraphQL queries against PR archives
- **Filesystem MCP** — Managed Agents' built-in file tool, used for the ledger store
- *(Optional stretch)* A custom **Postmortem MCP server** that exposes decision-ledger queries as MCP tools. If we ship this, Claude Code users can query their own codebases directly from their terminal. Great demo sidecar, even if it's a day 5 stretch.

### 8.5 Claude Code Routines (stretch)

If time permits on day 5, ship a Routine that re-runs Postmortem nightly on a repo to catch new decisions. Demoable in 20 seconds. Pure upside — lands on Anthropic's newest product.

### 8.6 What we use *during* the build

- **Claude Code with Opus 4.7** as the primary dev environment, `xhigh` effort
- **`/ultrareview`** before merging any non-trivial PR to our own repo (meta and on-brand)
- **Parallel sub-agents in git worktrees** for independent workstreams (ingestion vs. frontend)
- **Task budgets** to cap exploration runs during development
- **Skills we load into our own Claude Code**: `frontend-design`, `skill-creator`, our own Postmortem skills as they're built
- We *commit screenshots* of Claude Code sessions to the repo in a `/claude-code-sessions/` folder. Judges opening the repo see how the tool was built. Subtle flex.

---

## 9. Sub-agent topology

Three sub-agents, defined as markdown files in `.claude/agents/`. Main Claude Code session orchestrates them.

**Day-1 decision to consolidate from four to three:** the original design had a separate `alternative-miner` agent. On Day 1 we merged it into `rationale-extractor` because rationale and rejected alternatives share their source text (the PR body, review thread, inline comments, and linked issues). Running two agents over identical artifacts meant two Managed Agents round-trips per decision for zero incremental signal. One pass, same model, richer output schema.

### 9.1 `decision-classifier`

```yaml
---
name: decision-classifier
description: Given a pull request's title, body, diff summary, and review comments, determine whether it represents an architectural decision worthy of a ledger entry. Return structured JSON with decision type, confidence, and key rationale snippets.
tools: Read, Grep
model: sonnet
---
```

**Why Sonnet, not Opus:** runs thousands of times during ingestion. Cost discipline. Opus is for reasoning, Sonnet for classification at scale.

**System prompt excerpt:**
> You are a senior engineer reading a pull request to determine whether it documents an architectural decision. You care about: new dependencies, schema changes, API contract changes, design pattern adoption/rejection, performance tradeoffs, and cases where the PR discussion shows two or more alternatives being considered. You do *not* care about: formatting, renames, typo fixes, dependency bumps without behavior change, or pure bug fixes. Return strict JSON matching the schema provided.

### 9.2 `rationale-extractor`

```yaml
---
name: rationale-extractor
description: Given a PR confirmed as an architectural decision, extract the structured rationale — context, decision, forces, consequences, deciders — AND every rejected alternative (with the reason each was rejected) from the PR body, review comments, inline comments, and linked issues. Cite every claim with a comment ID and author.
tools: Read
model: opus
---
```

**Why Opus:** this is the reasoning-heavy step. Quality here determines the product.

**Why rationale and alternatives share one agent:** see the consolidation note above §9. Both extractions operate on identical source text (the PR discussion), so a single pass is strictly cheaper than two with no loss of signal. The output schema has a top-level `alternatives[]` array alongside the rationale fields.

### 9.3 `graph-stitcher`

```yaml
---
name: graph-stitcher
description: Given a batch of newly-extracted decisions, find semantic connections to existing decisions in the ledger — decisions that supersede prior ones, decisions that depend on prior ones, decisions that cluster by domain. Return ledger edge updates.
tools: Read
model: sonnet
---
```

### 9.4 Orchestration pattern

Main ingestion loop (runs in Managed Agents session):

```
for pr_batch in chunks(all_prs, size=50):
    parallel:
        classifier_results = decision-classifier.invoke(pr_batch)
    filter_to_decisions(classifier_results)
    parallel for each decision:
        extraction = rationale-extractor.invoke(decision)
        # extraction.rationale and extraction.alternatives[] come back in one call
    graph-stitcher.invoke(batch_of_extracted_decisions)
    write_to_ledger(...)
```

**The 50-PR batch size and parallelism** are calibrated for GitHub rate limits (5,000 req/hr authenticated, 10 code-search/min) and for Managed Agents' built-in concurrency. We do NOT hit GitHub with 1000 concurrent requests.

### 9.5 The separation that matters

- **Classifier is noisy, cheap, high-recall** → Sonnet, run on everything
- **Extractor is expensive, precise, low-recall** → Opus, run only on what classifier flagged
- **Stitcher is structural glue** → Sonnet, batch-mode

This is exactly the pattern CrossBeam used: parallel sub-agents per discrete correction, each assigned a single narrow task. It worked for Mike Brown. It will work for us.

---

## 10. Agent Skills pack

Four custom Skills, each a SKILL.md + supporting scripts, in `.claude/skills/`. Skills are packaged capabilities that sub-agents invoke.

### 10.1 `pr-archaeology`

Extracts structured data from a GitHub PR: title, body, all comments, all review threads, all linked issues, all linked commits, all inline code comments, diff statistics. Handles the REST/GraphQL split efficiently. Uses ETag caching via `If-None-Match` to stay under rate limits.

### 10.2 `commit-rationale`

Given a commit SHA, extracts the full commit message, linked PR (if any), and linked issues. Also runs a quick git blame on changed lines to pull adjacent commits that may contain the *real* rationale (commit messages often say "see PR #X"). This is the kind of cross-referencing a human archaeologist does manually.

### 10.3 `citation-formatter`

Takes a structured rationale object (from `rationale-extractor`) and formats the inline citations as the specific format we want in the frontend: `[PR #4512, @alice, 2024-03-17]` with a hover card containing the full quoted comment. Centralized formatting = consistent UX.

### 10.4 `ledger-writer`

Writes a decision's structured record into the DuckDB ledger with the right schema, embeds the decision's summary + rationale using the chosen embedding model, and writes the embedding into LanceDB. Handles idempotency so reruns don't duplicate.

### 10.5 Why these are Skills, not just Python functions

Because the **hackathon is scored on creative use of Opus 4.7 and Claude Code features**. Using Skills correctly signals we understand the Anthropic stack deeply. They're also genuinely the right abstraction — each one is invoked from multiple sub-agents, has configurable behavior, and benefits from the progressive disclosure / dynamic loading architecture.

---

## 11. Managed Agents session design

### 11.1 The agent definition

```python
# create_agent.py
from anthropic import Anthropic

client = Anthropic()

agent = client.beta.agents.create(
    name="Postmortem Ingester",
    model={"id": "claude-opus-4-7"},
    system=open(".claude/agents/ingestion-orchestrator.md").read(),
    tool={"type": "agent_toolset_20260401"},  # bash + file ops + web + code exec
    # Attach our custom Skills:
    skills=[
        {"type": "custom", "skill_id": PR_ARCHAEOLOGY_ID, "version": "latest"},
        {"type": "custom", "skill_id": COMMIT_RATIONALE_ID, "version": "latest"},
        {"type": "custom", "skill_id": CITATION_FORMATTER_ID, "version": "latest"},
        {"type": "custom", "skill_id": LEDGER_WRITER_ID, "version": "latest"},
    ],
    betas=["managed-agents-2026-04-01", "skills-2025-10-02", "task-budgets-2026-03-13"],
)
```

### 11.2 The environment

```python
environment = client.beta.environments.create(
    name="postmortem-env",
    config={
        "type": "cloud",
        "networking": {
            "type": "allowlist",
            "allowed_domains": [
                "api.github.com",
                "github.com",
                "raw.githubusercontent.com",
            ]
        },
        "packages": ["git", "gh", "jq", "ripgrep"],
    },
)
```

### 11.3 Kicking off an ingestion

```python
session = client.beta.sessions.create(
    agent_id=agent.id,
    environment_id=environment.id,
)

# Stream events back to frontend via WebSocket
with client.beta.sessions.events.stream(session.id) as stream:
    client.beta.sessions.events.send(
        session.id,
        events=[{
            "type": "user.message",
            "content": [{
                "type": "text",
                "text": f"Ingest the repository at {repo_url}. Task budget: 500k tokens for small repos, 2M for medium. Produce a full decision ledger with citations.",
            }],
        }],
    )
    for event in stream:
        websocket_broadcast(event)  # → frontend live log
```

### 11.4 What judges see in the demo

The live log streams: *"[session 3:47] Using tool: bash — `git clone https://github.com/...`"*, *"[session 3:51] Using tool: pr-archaeology — fetching PR #4512"*, *"[session 3:54] Sub-agent: rationale-extractor — classifying decision: 'Migrate from Mocha to Vitest'"*. This is both *real* (Managed Agents genuinely streams these events) and *gorgeous as theater*.

---

## 12. Data ingestion pipeline

### 12.1 Data sources per repo

| Source | Via | Purpose | Rate limit consideration |
|--------|-----|---------|-------------------------|
| Commits | `git clone` + `git log --all --pretty=format:%H%n%an%n%ae%n%at%n%B` | Commit SHAs, authors, messages | No rate limit (local) |
| PRs (closed, merged) | GitHub GraphQL: `pullRequests(states: [MERGED, CLOSED])` | Title, body, reviewDecision, all timeline items | GraphQL: 5000 points/hr; 1 PR page ≈ 1 point |
| PR review comments | GraphQL: `reviewThreads` | Inline code review debate (the gold) | Same pool |
| PR conversation comments | GraphQL: `comments` | Top-level discussion | Same pool |
| Issues (closed, linked to PRs) | GraphQL: `issues(states: [CLOSED])` | Problem context that led to decisions | Same pool |
| ADR files | `git ls-tree` + `cat` | If repo has docs/adr or similar, parse ADRs natively | No rate limit |
| READMEs, design docs | `git ls-tree` + `cat` | Additional written intent | No rate limit |

### 12.2 Rate-limit discipline

- **One authenticated token** via the user's Postmortem personal access token → 5,000 REST / 5,000 GraphQL points per hour
- **GraphQL for PRs** — fetching 50 PRs with comments and review threads costs ~200 points, vs ~500 REST calls for the same data
- **ETag / `If-Modified-Since` caching** on all REST calls so reruns during the demo don't consume fresh quota
- **Exponential backoff with jitter** for any 429/403 (documented best practice)
- **For the hero repos, we ingest OFFLINE before the demo** and cache the full ledger. No live rate-limit risk during judging.

### 12.3 What the decision ledger looks like (schema)

```sql
-- DuckDB schema
CREATE TABLE decisions (
    id UUID PRIMARY KEY,
    repo TEXT NOT NULL,
    title TEXT NOT NULL,           -- 1-line headline, e.g. "Migrate state mgmt to Zustand"
    summary TEXT NOT NULL,         -- 3-5 sentence synopsis
    category TEXT,                 -- auth / data / routing / build / infra / ...
    decided_at TIMESTAMP,
    decided_by TEXT[],             -- primary authors who drove the decision
    status TEXT,                   -- 'active' | 'superseded' | 'reverted'
    superseded_by UUID REFERENCES decisions(id),
    pr_number INTEGER,
    commit_shas TEXT[],
    confidence FLOAT,              -- how sure we are this IS a decision
    extracted_at TIMESTAMP
);

CREATE TABLE rationales (
    decision_id UUID REFERENCES decisions(id),
    claim TEXT NOT NULL,           -- "Chose Zustand over Redux because boilerplate overhead on a small team"
    citation_url TEXT NOT NULL,    -- exact link to the PR comment / commit / issue
    citation_author TEXT,
    citation_timestamp TIMESTAMP,
    citation_quote TEXT            -- the actual text we're citing
);

CREATE TABLE alternatives (
    decision_id UUID REFERENCES decisions(id),
    alternative TEXT NOT NULL,     -- "Redux Toolkit"
    rejection_reason TEXT NOT NULL,
    citation_url TEXT NOT NULL
);

CREATE TABLE dependencies (
    -- edges: decision A depends on / supersedes / relates to decision B
    from_id UUID,
    to_id UUID,
    kind TEXT                      -- 'supersedes' | 'depends_on' | 'related_to'
);
```

Plus LanceDB for semantic search over rationales and summaries.

### 12.4 Expected ledger size

For a 500-commit repo with ~200 PRs: expect 30–60 ledger entries. Roughly: 1 in 4–7 PRs is an "actual" architectural decision by our classifier's bar.

---

## 13. Query engine & the decision ledger

### 13.1 Three query types, three code paths

1. **Direct "why" queries** ("Why does this module use X?") → vector search on rationale summaries + full-context Opus 4.7 answer with cited reasoning
2. **Structural queries** ("Show me all decisions related to auth") → DuckDB SQL + rendered cards
3. **Impact ripple queries** ("What breaks if I swap Y for Z?") → graph traversal on the dependencies table + Opus 4.7 reasoning over the resulting subgraph

### 13.2 The query-time Opus 4.7 call

```python
response = client.beta.messages.create(
    model="claude-opus-4-7",
    max_tokens=16000,
    output_config={
        "effort": effort_level,  # high / xhigh based on query complexity
        "task_budget": {"type": "tokens", "total": budget_tokens},
        "display": "summarized",  # show reasoning to the user
    },
    system=POSTMORTEM_QUERY_SYSTEM_PROMPT,  # see §13.3
    messages=[
        {"role": "user", "content": build_query_context(
            user_question=question,
            retrieved_decisions=top_k_decisions,
            full_ledger_summary=summary,
        )}
    ],
    betas=["task-budgets-2026-03-13"],
)
```

### 13.3 System prompt (query mode, excerpt)

```
You are Postmortem, a decision-archaeology agent answering a question about the
codebase at {repo}. You have been given the repo's decision ledger — a structured
record of architectural choices, rationales, and rejected alternatives — extracted
from the repo's PR, commit, and issue history.

# YOUR RULES

1. Answer only from the ledger. Do NOT use background knowledge of the project.
2. Every factual claim MUST cite a source from the ledger. Citations use the
   format [PR #N, @author, YYYY-MM-DD] and must correspond to actual entries.
3. If the ledger does not contain enough information to answer confidently,
   SAY SO. Suggest which PRs/commits the user should read directly.
4. Before returning your answer, check it: for every claim you made, verify you
   can point to a specific rationale or citation entry in the ledger. If you cannot,
   mark that claim explicitly as "(not in ledger — my inference)".
5. Structure answers as: (a) direct answer in 1-2 sentences, (b) reasoning chain
   with citations, (c) relevant alternatives considered, (d) suggested follow-ups.
6. Prefer quoting exact words from comments over paraphrasing.
```

### 13.4 The self-check pass

After generating the answer, we make a *second* Opus 4.7 call with `xhigh` effort whose sole job is to verify every citation in the first answer ties back to the ledger. If any claim fails verification, we flag it inline in the UI (red underline, hover → "this claim could not be verified against the ledger"). This is Opus 4.7's agentic self-checking used as a first-class product feature, not decoration.

### 13.5 Streaming

Answers stream to the frontend via SSE. Citations render as tappable cards *as they're being generated*. Reasoning chain appears word-by-word. This makes a 20-second answer feel alive, and it's a demo-differentiator vs. any batch-response tool.

---

## 14. Frontend design

### 14.1 Design principles

- **Functional over ornate.** The frontend has to work solo in 5 days. Elegant minimal > pretty broken.
- **Inspired by Linear, Vercel, and Raycast.** Keyboard-first, dark mode default, monospace for code/citations, high-contrast.
- **Citations are first-class.** Every claim has a hover card. Every hover card has a link. Judges can *verify* any claim by clicking through.
- **The reasoning chain is the hero UI element.** More than the graph viz, more than the chat, the thing that makes Postmortem feel novel is watching Opus 4.7 reason with citations live.

### 14.2 The three screens

**Screen 1 — Entry / Gallery.**
- Large input field: "Paste a GitHub URL or pick a hero repo."
- Below: 3–5 hero repo cards, each showing ledger size ("347 decisions excavated") and one teaser question.
- Minimal nav, no footer, one-page experience. Follows Vercel/Linear landing pattern.

**Screen 2 — The Ledger Map.**
- Left 40%: interactive graph (React Flow) showing decision clusters. Nodes are decisions; color = category; edges are dependencies or superseding relationships. Hover = tooltip. Click = side panel.
- Right 60%: "Ask" panel. Pre-populated with 3 suggested queries based on the repo. User can type their own.
- Bottom: live log of the last query's reasoning trace (collapsible).

**Screen 3 — The Live Ingestion.**
- Only for Mode B (user's own repo).
- Full-screen progress with:
  - Phase indicator: Cloning → Indexing PRs → Classifying → Extracting → Stitching
  - Live log streaming from the Managed Agents session
  - Counters: commits / PRs / decisions-so-far
  - Elapsed time + estimated remaining
- Ends with "Go to ledger →" button when complete.

### 14.3 The reasoning-trace component

This is the single most important UI piece. When Opus 4.7 answers a query, the trace renders like this:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Q: Why does this codebase use Zustand instead of Redux?             │
│                                                                      │
│  ▸ Searching ledger for state-management decisions...                │
│    Found 3 relevant entries.                                         │
│  ▸ Reading rationales...                                             │
│                                                                      │
│  ANSWER                                                              │
│  Zustand was chosen over Redux in March 2024 primarily for           │
│  boilerplate reduction on a small team.                              │
│                                                                      │
│  REASONING                                                           │
│  1. The decision is recorded in [PR #4512, @alice, 2024-03-17].      │
│     The author wrote: "Redux's action/reducer/selector ceremony      │
│     costs us 30+ LoC per feature that Zustand gets in 3."            │
│                                                                      │
│  2. Redux Toolkit was explicitly considered and rejected             │
│     [PR #4512 comment, @bob, 2024-03-17]: "RTK is lighter but        │
│     still commits us to the reducer pattern, which we wanted         │
│     to move away from for server-state specifically."                │
│                                                                      │
│  3. This decision depends on an earlier choice to use TanStack       │
│     Query for server state [PR #4402, @alice, 2024-02-03],           │
│     which removed Redux's strongest remaining use case.              │
│                                                                      │
│  RELATED                                                             │
│  • Supersedes: Initial Redux setup [PR #1, 2023-08-01]               │
│  • Depends on: TanStack Query adoption [PR #4402]                    │
│  • Related: React Context rejected for global UI state [PR #4299]    │
└─────────────────────────────────────────────────────────────────────┘
```

Citations are tappable chips. Hovering any chip reveals a floating card with the actual quoted text and a link out to GitHub.

### 14.4 Motion design

- Streaming text uses a subtle character-by-character reveal (not the jumpy token-by-token; buffer and release at word boundaries — feels dramatically more polished)
- Graph nodes have a small entrance animation as the ledger loads
- Citation chips have a gentle hover state with a tiny scale + shadow

Framer Motion handles all of this; budget one afternoon.

### 14.5 Honesty about scope

- **No Fibonacci sphere.** Brain's signature visual; we're not reusing it.
- **No 3D anything.** React Flow 2D graph is enough and doesn't risk looking broken.
- **Dark mode only.** Skipping light-mode design saves a day.
- **Mobile-responsive is stretch goal.** Judge will watch on desktop.

---

## 15. 5-day build plan

Every feature has a "must ship by EOD" day. Anything not shipped by its target day gets simplified, not abandoned.

### Day 1 (Tue Apr 21) — Foundations & first signal

**Ship by EOD:**
- New public GitHub repo created; README with vision; MIT license; CLAUDE.md drafted
- Next.js 15 + Tailwind + FastAPI scaffolded; deployed to Vercel + Cloud Run
- Anthropic API key tested with Opus 4.7 (hello world)
- Managed Agents beta access confirmed; first toy session creates a container and runs `git clone`
- GitHub PAT + GraphQL starter queries return real PR data from one chosen test repo (probably `honojs/hono` — mid-size)
- **First decision excavated by hand** (not by the pipeline yet): walk through one real PR from the test repo and write out what the ledger entry should look like. This is the ground truth that calibrates the classifier prompt in Day 2.

**Stretch:** Load `.claude/agents/decision-classifier.md` into Claude Code and run it against 10 sampled PRs. See how it does.

### Day 2 (Wed Apr 22) — Ingestion pipeline end-to-end on one repo

**Ship by EOD:**
- Four sub-agent markdown files (§9) committed
- Four Skills (§10) committed
- Managed Agents session runs the full ingestion on the chosen test repo (~200 PRs)
- Decision ledger populated in DuckDB; embeddings in LanceDB
- Rate-limit handling verified (no 429s, no surprise stalls)
- Cost per ingestion measured — budget target: under $10 per mid-size repo

**Simplifications if behind:** drop the `alternatives[]` extraction from `rationale-extractor`'s output schema (ship rationale-only); re-enable Day 4 once the three agents are stable on all three hero repos.

### Day 3 (Thu Apr 23) — Query engine & reasoning trace UI

**Ship by EOD:**
- `/api/query` endpoint calls Opus 4.7 with the ledger in 1M context
- Self-check pass implemented
- SSE streaming working end-to-end
- Frontend `Screen 2` — Ledger Map + Ask panel — ships with graph showing ~30 decisions and working queries
- Reasoning trace component rendering citations as hover cards with working links
- First end-to-end demo possible against a locally-cached ledger

**Stretch:** multi-repo switching in the UI.

### Day 4 (Fri Apr 24) — Live Mode B + second + third hero repos

**Ship by EOD:**
- `Screen 3` — Live Ingestion — works for a small repo (< 500 commits) end-to-end, with streaming progress
- Three hero repos fully ingested and cached; all answer queries well
- Impact Ripple feature shipped (graph traversal + Opus 4.7 reasoning)
- Entry screen (`Screen 1`) polished with hero repo gallery

**Simplifications if behind:** cut Impact Ripple, keep just Why-queries and Alternatives panel. Cut hero repo count to 2.

### Day 5 (Sat Apr 25) — Polish, self-graphify, record demo

**Morning:**
- Postmortem runs on its own repo (the self-graphify moment); cache result
- Motion polish pass on the reasoning-trace streaming
- Loading states, error states, empty states (solo devs always forget these)

**Afternoon:**
- Record demo video (see §16)
- Edit to 3:00 exactly
- Upload to YouTube (unlisted)

**Evening:**
- Write 150-word submission description
- Clean up repo (top-level README with screenshots, architecture diagram, "how we built it")
- Final commit + tag
- Submit via CV platform (deadline Sun Apr 26, 8:00 PM EST — we're 24h early, which is the whole point)

### Day 6 (Sun Apr 26) — Buffer

This day exists to absorb Murphy's Law. If we don't need it for build overflow, we spend it on:
- Extra hero repos (hitting 5 total)
- Claude Code Routines integration (stretch §8.5)
- Custom Postmortem MCP server (stretch §8.4)
- Tighter video edit

**Hard rule:** submit by 8:00 PM Sunday. No all-nighter on Monday. Past Rahil's pattern is to over-polish; we set a hard deadline we respect.

---

## 16. Demo script — minute by minute

**Total: 3:00. Pre-recorded. No live anything in the video.**

### [0:00–0:12] Cold open

Black screen. White text, monospace:

```
  Every codebase has a graveyard of decisions
  nobody can explain anymore.
```

(0.5s pause)

```
  Postmortem brings them back.
```

(Logo + hard cut to screen recording)

Narration (my voice, one take, flat and confident): *"I'm Rahil. This is Postmortem. It's built on Claude Opus 4.7."*

### [0:12–0:40] The problem, made visceral

Screen recording: GitHub, scrolled to a PR review thread. 47 comments. Highlight a buried comment that contains the actual decision.

Narration: *"This comment — buried in PR 4512, written two years ago by an engineer who's no longer at the company — is the reason this codebase uses Zustand instead of Redux. It's nowhere in the code. It's nowhere in the docs. The last time someone needed this answer, they spent two hours hunting for it. I know because my friend was the intern who did it."*

(Cut to: same comment, but now the camera pulls back to show the PR nested inside a git log of 18,000 commits.)

Narration: *"Multiply this by every architectural decision in every codebase you've ever been handed."*

### [0:40–1:30] Mode A — the hero query

Cut to Postmortem UI, Screen 1. Hover over the "React" hero repo card.

Narration: *"Postmortem reads a codebase's entire decision history. PRs. Reviews. Issues. Commits. Builds a ledger. Here's what that looks like for React."*

Click → Screen 2 loads. Ledger Map fills the left side, 340+ decision nodes clustered by category.

Narration: *"347 architectural decisions excavated. Let's ask one."*

Type: *"Why doesn't React re-render on prop identity changes by default?"*

(Streaming reasoning trace begins, with citations appearing as tappable chips.)

Narration (over streaming): *"Notice what's happening. Opus 4.7 isn't searching the code. It's traversing the decision ledger — the PR where this was debated, the alternative that was considered, the specific engineer who made the call in March of 2023. Every claim has a citation. Every citation links to the actual comment on GitHub."*

Hover over a citation chip → hover card reveals the actual quoted text.

Narration: *"You can verify any claim. This is agentic self-checking — Opus 4.7 verifies its own citations before returning the answer."*

### [1:30–2:10] Mode B — the live demonstration

Narration: *"This is Postmortem on a repo it's already indexed. But it works live, too."*

Cut to Screen 1. Paste a *different* small repo URL (one I've verified works — maybe an obscure-but-interesting 200-commit project, ideally something the viewer doesn't know).

Click → Screen 3, live ingestion begins.

Screen shows: *Cloning... [git clone output scrolling]*, *Fetching 187 PRs via GraphQL...*, *Sub-agent: decision-classifier evaluating PR #47...*

Narration (over the scrolling agent trace): *"Postmortem runs on Claude's Managed Agents platform. The Claude harness is handling session state, tool execution, and context compaction across a multi-minute investigation — which means I'm not running this on my laptop, and it doesn't matter if I close the browser. When it's done, I'll have a ledger I can query."*

Fast-forward through ingestion (timestamp visible, clear it's 60 real seconds).

Cut to Screen 2 populated with this new repo's ledger. Type a query. Answer streams with citations.

### [2:10–2:45] The self-graphify moment

Narration: *"One more thing."*

Cut to Screen 1. Paste `github.com/rahilsinghi/postmortem`.

Narration: *"Postmortem was built this week. Five days. Here's what it says about itself."*

Live ingestion on my own repo (cached result, but clearly labeled as "this is the real ledger from this project's actual commits"). Click through to Screen 2.

Type: *"What was the hardest decision made during this build?"*

Answer streams. Real citations to real commits from this week.

### [2:45–3:00] Close

Cut to black, white text:

```
  Postmortem
  github.com/rahilsinghi/postmortem

  Built with Claude Opus 4.7.
  Claude Managed Agents. Claude Code. Agent Skills.
```

Narration: *"Code lives. Intent is a ghost. Postmortem summons it."*

Fade.

### 16.1 Recording notes

- Use OBS (not QuickTime) — better control over frame rate and mouse highlight
- Zoom level 110% in browser for readability on YouTube's default player
- Background music: a single, low-key, copyright-free loop (Epidemic Sound or similar). No beats. This is a serious product, not a Karen.
- Narration recorded separately in a closet with a towel over the mic, EQ'd in Descript. Multiple takes. Use the best.
- Final export: 1080p, 30fps, MP4. YouTube upload as unlisted.

---

## 17. Risk register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Managed Agents beta instability** | Medium | Catastrophic | Day 1 smoke test. If broken, fall back to homegrown agent loop using Messages API + Python + Anthropic SDK. The sub-agent/skill pattern ports cleanly. |
| **GitHub rate limits trigger mid-demo** | Medium | High | Hero repos ingested offline + cached. Live Mode B uses user's own PAT (from form at start). Graceful degradation message if limit hit. |
| **Reasoning quality is mediocre** | Medium | Catastrophic | Day 2 is entirely for calibrating the classifier and extractor against a hand-written ground truth of 10 decisions. If Opus 4.7 can't hit 80% agreement with my ground truth, we don't ship — we rethink the prompt architecture. |
| **Ingestion takes too long / costs too much** | Medium | High | Budget ingestion: $10 per mid-size repo max. Cut ingestion scope aggressively if we overshoot (only top 200 PRs by engagement, not all). |
| **React Flow graph visual looks amateur** | Low | Medium | Have a backup plan: if graph looks bad on Day 4, replace it with a clean clustered list view. Info-equivalent, less flashy. |
| **Hallucinated citations slip past self-check** | Medium | Catastrophic (for product credibility) | Two-layer defense: (1) self-check pass, (2) every citation URL must pattern-match a real PR/commit URL in our ledger — enforced at render time. If URL is not in ledger, don't render. |
| **Demo video goes over 3:00** | High | Medium | Pre-cut to 2:50 in edit to leave buffer. Cerebral Valley has rejected videos in past events for going over. |
| **My energy tanks on day 4** | High (Karen pattern) | High | Day 6 as buffer absorbs this. Do not pull all-nighters — past Rahil knows this fails. |
| **New-work rule challenge from cross-referencers** | Low-medium | Catastrophic | Fresh repo, fresh commits starting April 21. Zero references to Brain in README/submission. All Postmortem code is new. The *idea* of reasoning over knowledge graphs isn't copyrightable but reused code is — we use none. |
| **Copyright on repo content in demo video** | Low | Medium | Hero repos are all MIT/Apache licensed; showing their code + PR discussions in a demo is fair use for the purpose of demonstrating a tool. No music lyrics. No proprietary code. |
| **The reviewer's objection returns at judging** | Medium | High | Pre-empt it: the first 40 seconds of the demo video is literally the answer to "how is this different from static analysis." Show a comment buried in a thread, explain what static analysis can never see. |

---

## 18. Cost estimate

### 18.1 Token/dollar budget against the $500 credit

| Phase | Operation | Est. tokens | Cost |
|-------|-----------|-------------|------|
| Dev | Claude Code usage during build (~5 days × 4 hrs active @ ~200K tokens/hr Opus 4.7) | 4M in / 1M out | $5 + $25 = **$30** |
| Ingestion | 5 hero repos × mid-size × full pipeline | 5 × 3M in / 5 × 500K out | $75 + $62 = **$137** |
| Ingestion | Live Mode B demo runs × ~5 rehearsals | 5 × 500K in / 5 × 100K out | $12 + $12 = **$24** |
| Query | ~500 queries during dev + demo rehearsal | 500 × 200K in / 500 × 5K out | $50 + $62 = **$112** |
| Managed Agents session-hours | ~20 hours total across dev + demos | 20 × $0.08 | **$1.60** |
| Embeddings | OpenAI text-embedding-3-large, ~10M tokens | | **$1.30** |
| Buffer (25%) | | | **$76** |
| **TOTAL** | | | **≈ $380** |

Safely under the $500 credit. Room for Day 6 extra hero repos.

### 18.2 What blows the budget if we're not careful

- Running the ingestion pipeline more than 2–3 times per repo during development — each run is ~$20
- Using `xhigh` effort level for every query (it's ~3× the tokens of `high`). Reserve `xhigh` for the demo hero queries only
- Re-ingesting hero repos late in the week. Freeze them after Day 2.

---

## 19. Naming, positioning, submission copy

### 19.1 Name

**Postmortem** is strong. Reasons:
- Universally understood; every engineer knows what a postmortem is
- Implies the product is about *what already happened* (the decision), not forecasting
- Slightly dark, slightly clinical — matches the "archaeology" frame
- Domain available: `postmortem.dev` (or a subdomain of rahilsinghi.com)

**Alternate names I considered and why not:**
- *Ledger* — too generic, crypto adjacent
- *Why* — unsearchable
- *Ossuary* — too niche/macabre
- *Provenance* — good idea, too academic
- *Archive / Archivist* — confusingly overlaps with file archiving
- *Intent* — taken by multiple products

### 19.2 Tagline

**"A decision-archaeology agent for any codebase."**

Or the more poetic: **"Code lives. Intent is a ghost. Postmortem summons it."**

### 19.3 Submission description (target: 150–200 words)

> **Postmortem** — A decision-archaeology agent for any codebase, built on Claude Opus 4.7.
>
> Engineers spend 20–30% of their time trying to understand *why* existing code is the way it is. The answers are never in the code. They're buried in PR discussions, code reviews, and issue threads — artifacts that existing tools can search but cannot reason over.
>
> Postmortem reads a repo's entire intent layer — every PR, every review comment, every issue — and builds a queryable decision ledger. You ask *"why does this module exist?"* and get back a cited reasoning chain sourced from the actual engineering debate, with links to the specific comments and the humans who made the call.
>
> Load-bearing Opus 4.7 features: **1M context** holds the full ledger in memory; **agentic self-checking** verifies every citation before returning; **task budgets** expose "investigation depth" as a UX control; **high-res vision** parses architecture diagrams posted in PRs. The multi-hour ingestion runs on **Claude Managed Agents** with four specialized sub-agents coordinated via **Claude Code** and four custom **Agent Skills**.
>
> Try it on any public GitHub repo. It will run on itself.

---

## 20. Open questions to resolve before Day 1

Small decisions that need a call so Day 1 isn't blocked:

1. **Hero repo shortlist** — pick 5 from: React, Redux, Zustand, shadcn/ui, TanStack Query, Prettier, tRPC, Hono, Drizzle, SvelteKit. Criteria: rich PR discussion, MIT/Apache license, size 500–2000 commits, mainstream recognition for a non-technical judge.
2. **Final name + domain** — Postmortem vs. alternate. If Postmortem: register domain or commit to `postmortem.rahilsinghi.com`.
3. **Embedding model** — OpenAI `text-embedding-3-large` vs. Voyage-3. Decide based on which API keys are already active.
4. **GitHub authentication approach** — user provides their own PAT (simpler, better for demo integrity) vs. Postmortem uses a shared GitHub App (more polished but adds OAuth complexity). Recommended: user-PAT for hackathon.
5. **Frontend color system** — Linear-inspired neutral grayscale + one accent, or something more distinctive? Punt to Day 3 but pre-decide the direction.
6. **Submission repo public or private-then-public?** — Public from minute one; the commit history *is* part of the story.
7. **Does Postmortem's own ledger get published at `postmortem.dev/postmortem`?** — Yes, if self-graphify works. It's a perfect sticky moment.
8. **Demo narration: my voice or synthesized?** — My voice if the audio can be clean. ElevenLabs as backup.
9. **Anthropic Discord engagement** — drop into `#office-hours` on Day 1 with one smart question. Visible presence helps if any judges spot it.
10. **The question asked during self-graphify** — pre-write the exact query. *"What was the hardest decision made during this build?"* is good; so is *"Which component went through the most iterations?"* — both will have honest, cited answers if the ledger does its job.

---

*End of spec. Read it twice before touching code.*
