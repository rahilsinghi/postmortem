# ADR 0003: Day-4 live ingestion + Impact Ripple

**Status:** accepted · 2026-04-22
**Supersedes:** none
**Context:** SPEC §13.1 (three query types), §14.2 (three screens), §15 Day 4 goals

## Decision

Ship SPEC Day-4's three marquee deliverables as tight additions to the Day-3
query stack rather than rewrites:

- **Screen 3 — Live ingestion** (`/ingest`): a new page that drives
  `GET /api/ingest` via SSE. Refactored `app.ingest.ingest_repo` to accept an
  `on_event` async callback so the same function powers both the
  `scripts/ingest.py` CLI (no callback) and the streaming HTTP endpoint
  (callback → queue → SSE). One orchestrator, two surfaces.
- **Impact Ripple** (`/api/impact`): BFS on the existing `decision_edges`
  table from an anchor decision up to `max_depth=2`, hand the subgraph to
  Opus 4.7 with a specialized "what breaks if this reverted" prompt. Costs
  ~4–10× less per query than full-ledger queries because the subgraph is
  much smaller (~6 decisions vs 41 for zustand).
- **Entry polish**: three-card gallery with teaser queries, Framer Motion
  stagger reveal + subtle hover lift, and a "+ ingest your own" affordance
  that deep-links into Screen 3.

## Rationale

### One orchestrator, two surfaces

The original `ingest_repo` printed progress to stdout. Day 4 needed the same
progress observable from a browser for Screen 3. Two implementations would
drift. Adding an optional `on_event: Callable[[dict], Awaitable[None]]`
parameter keeps the CLI unchanged (callback=None) and lets the SSE router
reuse the same logic. Events are emitted at every natural seam — list, filter,
per-PR classify, per-decision extract, persist, stitch, done — so the UI can
render counters + a live classification log without guessing what the
orchestrator is doing.

### Impact Ripple is cheap by construction

A full-ledger query on zustand costs ~\$2 because Opus reads 68K tokens of
decision JSON. The user pays that even to answer "what breaks if I revert PR
#3336?" where most decisions are irrelevant. Impact mode runs a BFS on the
precomputed edges, keeps ~6 decisions in context, and costs ~\$0.25-0.50
per query. It also produces *better* answers — the model isn't distracted
by unrelated history.

The anchor resolution is pragmatic: the caller can pass `anchor_pr` explicitly,
or the server does a fuzzy title/summary match against the question text
(weighted: title match > summary match > none). Scales fine at ledger sizes
< 200; a proper embedding lookup is Day 5+ if we hit larger repos.

### Fuzzy anchor instead of an anchor picker UI

A dropdown to pick the anchor would be one more UI surface. Clicking the node
in the graph already sets `selectedDecision` — the AskPanel pulls the anchor
from there. If nothing is selected, the "impact ripple" toggle is disabled
with a tooltip explaining why. Zero new UI, all demo-friendly.

### Why not register the live ingestion as a Managed Agents session

The SPEC §11 shape for live ingestion is an MA session that autonomously
drives the pipeline. We already have a working local orchestrator (\$20
zustand proof, \$7 shadcn proof). Wrapping it in an MA session would be
ceremony for Day 4, worth zero demo value today, and risks ingestion
reliability. The existing `backend/app/managed_agents/session.py`
single-PR demo from Day 2 keeps the MA-beta story alive in the submission.

## Consequences

- Adding any future ingestion event (ETag cache hit, rate-limit pause) is a
  one-line `emit(...)` call in `ingest_repo`.
- Screen 3's UI is stateless beyond its EventSource. If the browser closes
  mid-run, the task is cancelled on the server — intentionally simple; no
  job-id bookkeeping.
- Impact Ripple reuses the Day-3 SSE consumer on the frontend (same event
  types) via a `mode: "query" | "impact"` flag on `startQuery`.

## Measurements

### Hero repo ingestions

| Repo | PRs listed | After filter | Accepted | Decisions | Cost |
|---|---|---|---|---|---|
| shadcn-ui/ui | 600 | 65 (min-disc ≥ 4) | 15 (23%) | 15 | **\$7.21** |
| honojs/hono | (in progress) | | | | |
| pmndrs/zustand | 600 | 420 (min-disc ≥ 3) | 44 (10%) | 41 | \$20.00 (Day 2) |

### First impact-ripple run (zustand, anchor = #3336)

- Subgraph: 6 decisions, 8 edges (vs 41 / 36 for the whole ledger)
- Answer covered Direct impact / Second-order / Safe-to-unwind / What's-not-in-subgraph per the prompt
- Correctly identified #3336 as a leaf node with no direct dependents, then enumerated the behavioral guarantees that break if reverted
- Cost: ~\$0.30 (streaming, no self-check)

## Follow-ups (Day 5)

- Register the live orchestrator as a Managed Agents session for the
  submission's "built with Claude Code" theater.
- Replace fuzzy anchor matching with embedding-based retrieval when we
  hit 200+ decisions per repo (zustand/shadcn/hono fit in linear scan).
- Add a subgraph-highlight overlay on the graph so the Impact Ripple
  response visually pulses the anchored subgraph.
