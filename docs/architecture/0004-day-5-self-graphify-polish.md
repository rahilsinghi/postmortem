# ADR 0004: Day-5 self-graphify, UI polish, infra resilience

**Status:** accepted · 2026-04-22
**Supersedes:** none
**Context:** SPEC §15 Day 5 goals, §The meta-move (self-graphify)

## Decision

Day 5 locked the submission by ingesting the third hero repo (honojs/hono) and
executing three parallel threads:

1. **Self-graphify** (`scripts/self-graphify.py`) — Postmortem runs its own
   git history through the same classifier + extractor. Pseudo-PR-archaeology
   records are built from `git log`, fed to `classify_and_extract`, written to
   the shared DuckDB under `repo="rahilsinghi/postmortem"`.
2. **UI polish** — word-boundary streaming reveal with typing cursor, loading
   skeletons, error boundary, ApiHealth banner, subgraph highlight, custom
   scrollbars, focus rings, reduced-motion respect.
3. **Demo prep** — `docs/DEMO-SCRIPT.md` + a README refresh with final ledger
   totals.

## Rationale

### Commits-as-PRs for self-graphify

The Postmortem repo has been committed direct-to-main — no actual PRs to fetch.
But the SPEC §The meta-move specifically invited this: *"Write PRs like you
want the best version of Postmortem to read them two years from now."* The
commit messages carry the same narrative a PR body would.

Rather than run the existing PR-fetch pipeline against an empty GraphQL
response, a tiny shim shapes each commit into a pseudo-archaeology dict with
the same fields the classifier expects. Everything downstream reuses without
modification: same Pydantic models, same DuckDB writes, same graph stitching.

Result: 6 of 9 commits classified as decisions. The 3 rejects were the right
ones (initial scaffold, gitignore fix, black-only formatting commit). Edges
traced a real supersedes chain: Day 2 foundation → Day 2 topology → Day 3
query engine → Day 4 impact ripple.

### Word-boundary reveal is the right compromise

SPEC §14.4 asks for "subtle character-by-character reveal (not the jumpy
token-by-token; buffer and release at word boundaries)." Real
character-by-character requires a per-character timer and breaks the SSE
streaming feel — the answer should keep pace with the model, not a UI clock.

The compromise: `trimToWordBoundary(text)` — a pure derivation that clips the
rendered text at the last whitespace / punctuation boundary while streaming.
Incomplete words are held back and appear as atomic units. No timers, no
state races. When the stream closes, the full text renders.

### Subgraph highlight via shared state

The Day-4 `/api/impact` endpoint already emitted a `subgraph` SSE event
carrying `included_prs`. Wiring it to the graph required one new prop on
`AskPanel` (`onSubgraph`) and a `subgraphPrs`/`subgraphAnchorPr` prop pair on
`LedgerGraph`. Anchor pulses amber with a glow shadow, subgraph nodes ring
amber, non-subgraph nodes dim to `opacity-40` and edges to `opacity-0.2`.
Dimming is ONLY applied when a subgraph is active — when no ripple query has
run, every node renders at full opacity. A persistent "clear" chip in the
top-left of the graph pane un-dims.

### ApiHealth, ErrorBoundary, Skeleton — one of each, used everywhere

- `ApiHealth` polls `/healthz` every 20s. When down, shows a fixed-position
  bottom-right card with the exact command to start the backend.
- `ErrorBoundary` wraps the whole page tree in `layout.tsx`. Render-time
  errors show a dismiss/reload pair instead of a blank white screen.
- `Skeleton` + `LedgerPageSkeleton` handle the Next 16 `loading.tsx` slot for
  the ledger route. 404s route to a themed `not-found.tsx` with a shortcut to
  Screen 3.

### Reduced-motion respect

Every Framer-Motion and Tailwind `animate-*` transition is suppressed under
`prefers-reduced-motion: reduce`. Necessary for accessibility but also a
defensive hedge during the demo recording — if QuickTime captures the reduced
mode, nothing stutters.

## Consequences

- The gallery self-updates: any new `/api/repos` entry automatically gets a
  card. Adding a 5th hero repo is one ingestion run.
- Self-graphify is idempotent on `(repo, pr_number)`, so re-running after new
  commits only adds/updates — it doesn't duplicate.
- `/api/ingest` with a `MAX_PR_LIMIT=200` cap prevents the UI button from
  spending more than ~\$30 in one click.

## Measurements

### Day-5 ingestions

| Repo | Decisions | Citations | Alts | Edges | Cost |
|---|--:|--:|--:|--:|--:|
| honojs/hono | 59 | 236 (loaded) / ~450 (raw) | ~170 | 27 | \$31.87 |
| rahilsinghi/postmortem | 6 | 14 | 3 | 7 | \$1.89 |

### Full ledger at submission time

- **121 decisions** across 4 repos
- **~700 citations** (exact quoted text from PR / commit sources)
- **~285 rejected alternatives** with reasoning
- **76 edges** (supersedes / depends_on / related_to)
- **~\$62 total API spend** for all development + all ingestions (\$500 budget)

## Follow-ups (post-hackathon)

- LanceDB semantic retrieval for multi-repo answers (current path stuffs one
  repo's ledger into context per query; cross-repo Q&A needs embeddings).
- MA-native ingestion orchestrator that runs inside a hosted session and
  streams events directly — Day-4's SSE endpoint is a good facsimile but the
  proper shape lives in `.claude/skills/*`.
- Commit-rationale skill promoted from scaffold to runtime — the
  self-graphify script's commit-walking logic is the canonical implementation.
