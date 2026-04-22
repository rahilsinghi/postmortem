# ADR 0001: Day-2 ingestion topology

**Status:** accepted · 2026-04-22
**Supersedes:** none
**Context:** SPEC §9 (sub-agent topology), §10 (skills), §11 (MA sessions), §12 (ingestion pipeline)

## Decision

Day-2 ships a **local-orchestrator ingestion pipeline** (`backend/app/ingest.py`) that calls each sub-agent via `client.messages.create`, with a **thin Managed Agents wrapper** (`backend/app/managed_agents/session.py`) that proves the MA beta integration on a single PR.

## Rationale

### Why local orchestration for the bulk ingest, not MA

The MA session model (§11) is designed for long-running, autonomous, resumable work. For bulk ingestion of a hero repo, the tradeoffs shake out differently:

- **Cost observability.** Per-call token + cost tracking is trivial when we control the loop (`CostTracker`). Inside an MA session it's one opaque bill.
- **Parallelism.** `asyncio.Semaphore` gives us tuneable concurrency across PRs. An MA session is sequential by default.
- **Iteration speed.** Tweaking the classifier threshold or min-discussion filter is one CLI flag, not a session-restart.
- **Proven.** The local orchestrator produced 41 decisions with 385 cited claims + 83 alternatives on pmndrs/zustand for \$20. MA-as-orchestrator would have been 2-3x the dev cost for equal output.

### Why a Managed Agents wrapper exists at all

The SPEC deliberately demos MA integration. Skipping it would undersell the hackathon's "creative use of Opus 4.7 + Claude Code features" criterion. The wrapper (`run_single_archaeology_session`) composes the classifier + extractor prompts into one MA agent and processes a single PR with the bash agent_toolset — cheap to run, honest about what it does, and fully on the SDK path per the feedback memory.

### Why three sub-agents instead of four (see also Day-1 consolidation note)

`alternative-miner` merged into `rationale-extractor` Day 1. Day 2 confirmed the call: the 44 extractor runs collected 83 rejected alternatives in-line with 385 rationale citations — a separate alternative-miner pass would have doubled MA round-trips for the same source text.

## Consequences

- Adding a second hero repo (shadcn-ui, honojs/hono) is just a CLI run with a higher `--limit`.
- Day 3 can layer a "proper" MA ingestion agent on top without throwing away anything built Day 2 — the sub-agent prompts, Pydantic schemas, and DuckDB store are reused directly.
- Cost predictability per run is good: \~\$0.01 per classified PR, \~\$0.30 per extracted decision (with prompt caching halving the extractor input).

## Measurements on pmndrs/zustand (Day 2 run)

| Metric | Value |
|---|---|
| PRs listed | 600 |
| After min-discussion≥3 filter | 420 |
| Classifier accepted | 44 (10.5%) |
| Decisions written to ledger | 41 |
| Citations total | 385 |
| Alternatives total | 83 |
| Decision edges (stitcher) | 36 |
| Total cost | \$19.99 |
| Classifier calls | 420 @ avg \$0.009 |
| Extractor calls | 44 @ avg \$0.36 (42% input tokens served from cache) |
| Stitcher | 1 call, \$0.06 (re-run after raising `max_tokens` from 2048 → 8192) |

## Follow-ups (Day 3+)

- Wire the local orchestrator's event stream into an MA session for the demo-UX "live log" (SPEC §11.4).
- Register the four skills as first-class MA Skills so the orchestrator agent can `skill_use` them instead of having Python call their implementations.
- Add LanceDB embedding write-path in `ledger-writer` skill.
