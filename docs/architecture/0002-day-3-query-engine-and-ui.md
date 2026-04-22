# ADR 0002: Day-3 query engine + reasoning-trace UI

**Status:** accepted · 2026-04-22
**Supersedes:** none
**Context:** SPEC §13 (query engine), §14 (frontend design), §15 Day 3 goals

## Decision

Ship the SPEC §13 query path end-to-end in three layers:

- **`backend/app/query/`** loads the full ledger into a single `AsyncAnthropic.messages.stream` call against `claude-opus-4-7`, streams deltas + a structured self-check result over Server-Sent Events.
- **`backend/app/routers/{repos,query}.py`** expose `/api/repos`, `/api/repos/{owner}/{name}/ledger`, and `/api/query` (SSE) behind CORS for the frontend.
- **`frontend/`** Next.js 16 App Router with `app/ledger/[owner]/[repo]` as Screen 2: React Flow graph (left), decision side panel (middle), ask panel + streaming reasoning trace (right). Citation tokens (`[PR #N, @author, YYYY-MM-DD]`) are parsed in the stream and rendered as hoverable chips that link to GitHub.

## Rationale

### Stuff the whole ledger; skip semantic retrieval for Day 3

Zustand's 41-decision ledger serializes to ~270 KB / ~68K input tokens. Opus 4.7's 1M context swallows that with plenty of headroom. Building LanceDB retrieval before we know what queries users actually ask would be cargo-culting. Deferred to Day 4+ when ledgers start hitting 200+ decisions or multi-repo answers are in scope.

### Self-check is a product feature, not decoration

After the main answer stream closes, a second `messages.create` call (non-streaming, xhigh effort) takes the answer and the ledger and returns a strict JSON verdict (verified/unverified per token). The frontend tints every chip: green for verified, red for unverified with the reason shown in the hover card. Expensive (~$1 extra per query) so it's opt-in from the UI.

### SSE over WebSockets

One-way server→client stream, no browser headaches, no persistent connection pooling to manage, native `EventSource`. `sse-starlette`'s `EventSourceResponse` handles the framing. Avoids a WS upgrade path we don't need for this shape of work.

### Citation chips parsed on the client, resolved against the ledger

The agent emits citation tokens in a stable format the SPEC locked in §13.3 (`[PR #N, @author, YYYY-MM-DD]`). The frontend's `parseCitations` regex splits incoming text into text-and-citation segments as it streams. Each citation is resolved against the already-loaded ledger's `decisions[].citations[]` for the hover card — no extra API calls, hover cards are instant.

### Compact chronological grid for the graph

Original design laid out decisions as a timeline-per-category (x = time, y = category lane). With 41 decisions, that's 10 000 px wide. React Flow's `fitView` zoomed way out and nodes became illegible. Switched to a `ceil(sqrt(N))`-column snake grid sorted chronologically — category is encoded in node color, not position. Fits inside a 40%-viewport panel at a readable zoom. Edges still reveal the topology without needing a precomputed graph-layout lib.

### Env-scrubbing workaround

The Claude Code sandbox scrubs `ANTHROPIC_API_KEY` from subprocess env (to prevent accidental billing). Our backend reads `.env.local` directly via `resolve_secret()` — the same path the Day 2 feedback memory committed us to for all Managed Agents calls.

## Consequences

- Any cached ledger (DuckDB file) surfaces in the gallery automatically via `/api/repos`.
- Adding a second hero repo is one ingestion + one gallery row + zero UI changes.
- Self-check is honest: when the model cites something that isn't in the ledger, the chip goes red in the UI.
- Day 4's live-ingestion screen reuses the SSE infrastructure — just a different event schema.

## Measurements (first end-to-end queries on pmndrs/zustand)

| Query | Input tokens | Output tokens | Cost | Notes |
|---|---|---|---|---|
| "Why does persist use a hydrationVersion counter?" | 125 812 | 1 703 | \$2.01 | 13 citations, 3 rejected alts, related via graph edges |
| "Why did Zustand drop the default export?" | ~125 000 | ~1 400 | ~\$1.95 | Rendered in browser with inline chips |
| "What changed architecturally in v5?" (curl, streamed) | ~125 000 | ~2 000 | ~\$2.00 | 10+ citations across v5 cluster |

Self-check (opt-in) roughly doubles the cost but gives green/red chip verdicts.

## Follow-ups (Day 4+)

- Live ingestion screen (SPEC Screen 3) — reuse SSE stack.
- LanceDB embedding retrieval once the ledger exceeds ~200 decisions or multi-repo answers are in scope.
- Replace the chronological snake grid with a dagre-based hierarchical layout that puts supersedes chains on a dedicated axis.
- Self-check currently compares citation tokens; upgrade to hash-check the quoted text too (catches paraphrase fabrications).
