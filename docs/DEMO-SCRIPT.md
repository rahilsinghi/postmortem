# Demo script

> 2-minute walk-through of Postmortem for the submission video. Every number is
> from the live ledger at commit time; update before recording.

## Setup

```bash
# one terminal
cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8765

# another terminal
cd frontend && pnpm dev
# → http://localhost:3000
```

Keyboard shortcut: make the browser window a clean 1440x900 viewport, hide the
bookmarks bar, and disable notifications. QuickTime → "New Screen Recording" →
"Record Selected Portion" → drag over the window.

## Segment 1 — the premise (10 s)

Start on the entry screen.

> *"Engineers spend 20–30% of their time reverse-engineering why the code is the
> way it is. The answers almost never live in the code. They're buried in PR
> discussions, review threads, and the heads of people who've moved on.
> Postmortem reads that intent layer."*

On screen: three hero cards — zustand (41 decisions), shadcn-ui (15), and
Postmortem itself (6 decisions excavated from its own commit history).

## Segment 2 — the ledger comes alive (30 s)

Click `pmndrs/zustand`. The graph reveals — 41 category-coloured decision
nodes arranged on a hierarchical dagre layout, edges in amber (supersedes)
and dashed blue (depends_on). A 32px glassmorphic rail sits at the bottom
with a scrubber pinned to "present."

> *"Opus 4.7 read every merged PR, every review thread, every linked issue
> across three years of history — classified them, extracted rationales,
> stitched them into a graph. Watch it build itself."*

Hit the ▶ on the timeline rail. The scrubber glides left to 2022, the graph
clears — then animates forward, nodes fading in at their real merge dates
with an amber pulse, edges drawing themselves once both endpoints surface.
Past-state nodes tint cool slate; "present" nodes pop amber.

> *"Three years of architectural thought compressed into ten seconds. Every
> fade-in is a real PR merge date — nothing synthetic."*

Stop on "present." Click one node (say #3336, hydrationVersion counter). The
middle column opens: **Rejected Alternatives** at the top with amber
strikethrough, then the full rationale, citations ranked by kind.

> *"Every decision carries its full rationale, quoted verbatim, plus every
> alternative that was rejected and why — the unique content no static
> analyzer can ever reach."*

## Segment 3 — ask, watch, verify, navigate (60 s)

Dismiss the side panel. Click the suggested query *"Why does persist
middleware use a hydrationVersion counter?"*.

> *"Now we ask a question the code itself can't answer. Opus 4.7 holds the
> entire 41-decision ledger in one context and reasons with citations live."*

The answer streams. Below it, the **Reasoning X-Ray** expands — a cyan
scan-line at the top tracking output tokens, a vertical trace that writes
in real time:

```
⟶ 0.1s  retrieving
⟶ 0.1s  loading ledger · 41 decisions · 385 citations · 36 edges
⟶ 0.1s  scanning 41 decisions across 4 categories · token budget 4K
⟶ 0.1s  reasoning
⟶ 4.8s  resolved citation → PR #3336 · hydrationVersion counter
⟶ 6.2s  resolved citation → PR #1463 · createWithEqualityFn split
⟶ 12.4s cross-checking every cited claim against ledger text
⟶ 18.7s resolved · 252K in · 3058 out · $4.0191
⟶ 18.7s done
```

Cyan lines are live system logic; amber lines are historical data resolved
as Opus's stream names them.

> *"The cyan trace is Opus's reasoning timing — not simulated. Amber lines
> fire the moment the answer cites a real PR. Every timestamp is wall-clock
> real."*

Hover a citation chip. **Provenance Peek** unfurls — amber drop-cap, italic
serif quote, source-type glyph + author + date, and a footer link:
`12 other claims cite this thread →`.

> *"Every citation is the reviewer's actual words, quoted verbatim from the
> PR, verified by self-check against the ledger. Zero hallucinations, ever."*

Click that same chip. **Follow the Thread** — the graph pans smoothly (spring
physics, liquid-weight) to PR #3336, it pulses amber, kin decisions (same PR,
same author, or edge-connected) softly tint. Status chip top-left:
`following thread: PR #3336 · 4 kin · clear`.

> *"Citations aren't text — they're a map. Click any one and the graph
> becomes a view of that decision's neighborhood."*

Press Esc to clear.

## Segment 4 — impact ripple (25 s)

Click a node (say #3336). Toggle `impact ripple` mode.
Type: *"What breaks if the hydrationVersion counter is removed?"*
Hit Ripple.

The graph dims, the anchored subgraph lights up amber, anchor pulses brighter.
The Reasoning X-Ray re-opens with a different opener:
`bfs subgraph · 3 decisions · 2 edges · anchor PR #3336`.

> *"Impact-Ripple: BFS over the decision edges from the anchor, hand just
> the subgraph to Opus, trace cascading consequences. The X-Ray shows
> exactly which slice of the ledger the model saw."*

## Segment 5 — live ingestion (20 s)

Click the "+ ingest your own" button on the gallery. On Screen 3, paste a tiny
repo (e.g. a playground one from pmndrs), set `limit=20, min-discussion=3`, hit
Start.

Progress bar creeps forward. Left column streams classifier decisions
(green dot = accepted, open dot = rejected). Right column streams extractor
output — each accepted decision appearing with its category, citation count,
alternative count.

> *"Screen 3 is Mode B: paste any public GitHub repo and Postmortem builds the
> ledger live over Server-Sent Events from a Managed Agents-backed pipeline.
> Each event carries per-PR cost so you see what the answer will cost you
> before you pay for it."*

## Segment 6 — the meta-moment (15 s)

Navigate back to gallery. Click `rahilsinghi/postmortem`.

> *"Postmortem on its own repo. The classifier read the commit history from
> the last five days, surfaced six real architectural decisions, and stitched
> a supersedes chain through Day 1 → 2 → 3 → 4. Everything you just saw was
> built in 120 hours — and this ledger is the proof."*

Ask: *"Why does Postmortem run sub-agents outside Managed Agents?"* — the
answer cites commit b909f14 and the Day-2 ADR.

## Closing (5 s)

> *"Code lives. Intent is a ghost. Postmortem summons it."*

Fade.

## Verified query metrics (dry-run 2026-04-22)

Four canonical queries, one per hero repo, each with self-check enabled. All
cited claims verified against the ledger — zero hallucinations.

| Query | Loaded | Input | Output | Cost | Verified |
|---|---|---:|---:|---:|:---:|
| zustand — hydrationVersion counter | 41 dec / 164 cit | 252K | 3.1K | $4.02 | 12/12 |
| hono — Web Standards API rationale | 59 dec / 751 cit | 477K | 2.6K | $7.35 | 11/11 |
| shadcn-ui — multi-style registry refactor | 15 dec / 60 cit | 112K | 2.3K | $1.85 | 15/15 |
| self — sub-agents outside Managed Agents | 6 dec / 24 cit | 48K | 2.0K | $0.88 | 7/7 |
| **4 queries** | | **889K** | **10.0K** | **$14.10** | **45/45** |

All four cite every claim inline. None hallucinated. The hono run hit ~477K
input tokens — that's where prompt caching (Wave 2) will bite hardest.

## Totals at record time

Sourced from the live ledger (`ingestion_runs` + row counts at commit time).

| | Value |
|---|---|
| Hero repos | 3 (hono, zustand, shadcn-ui) + self |
| Total decisions | 59 + 41 + 15 + 6 = **121** |
| Total citations | **1,394** |
| Total rejected alternatives | **305** |
| Total edges | **76** |
| Total ingestion API spend | **$60.96** / $500 (12%) |
| Largest single ingestion | hono: 194 PRs seen, 59 decisions, $31.87 |
| Cheapest ingestion | self-graphify: 9 PRs, 6 decisions, $1.89 |
| Lines of code | ~4,500 (Python + TS) |
| Days | 5 |
