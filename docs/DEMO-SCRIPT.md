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

## Segment 2 — the ledger (25 s)

Click `pmndrs/zustand`. The graph reveals — 41 category-coloured decision
nodes, edges between them.

> *"Opus 4.7 read every merged PR, every review thread, every linked issue —
> classified them, extracted rationales, and stitched this into a graph. The
> red animated edges are `supersedes`; the dashed blue are `depends_on`."*

Click one node — e.g. #3336 (hydrationVersion counter). Side panel pops.

> *"Every decision carries the full rationale, quoted verbatim from the PR
> comment that supports it, plus every alternative that was rejected and why."*

Scroll the citations + alternatives list briefly.

## Segment 3 — the query engine (45 s)

Move to the ask panel. Click the suggested query *"What changed architecturally
in Zustand v5?"*.

> *"Now we ask a question the code itself can't answer. Opus 4.7 holds the
> entire 41-decision ledger in one 125K-token context and reasons with
> citations live."*

The answer streams in with section headers (Answer / Reasoning / Rejected
alternatives / Related / Follow-ups). Citation chips render inline.

Hover one chip — the floating card shows the exact quoted PR comment, author,
timestamp, and a GitHub link.

Click through to GitHub.

> *"Every citation is verifiable in one click. That's the product: not a
> codebase chat, but a decision archaeologist that never fabricates."*

(Optional: toggle `self-check` on and re-run — chips tint green/red based on
Opus's second-pass citation verification.)

## Segment 4 — impact ripple (30 s)

Click a node (say #3336). Toggle `impact ripple` mode in the ask panel.
Type: *"What breaks if the hydrationVersion counter is removed?"*
Hit Ripple.

The graph dims, the anchored subgraph lights up amber (anchor pulses brighter).

> *"Impact-Ripple mode is the third query type from the spec: BFS over the
> decision edges from the anchor, hand just the subgraph to Opus, trace
> cascading consequences."*

Answer streams with sections: Direct impact / Second-order impact / Safe to
unwind / What's NOT in the subgraph / Follow-ups.

> *"It correctly identifies #3336 as a leaf node — nothing depends on it — and
> still enumerates the behavioral guarantees the counter was protecting, each
> cited back to the exact inline review comment."*

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
