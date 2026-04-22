# Ambitious Demo Bundle — Design

**Date:** 2026-04-22
**Status:** Approved for implementation
**Hackathon context:** Claude Code Hackathon, submission Sunday 2026-04-26 8pm EST
**Author:** rahil-singhi
**Scope:** Four interlocking product upgrades that headline the submission video.

---

## 1. Why this bundle

Postmortem's demo video has five locked segments (see `docs/DEMO-SCRIPT.md`).
Segments 1 (premise), 5 (live ingestion) and 6 (meta-moment) already have
strong beats. Segments 2 (ledger reveal) and 3 (ask / answer / inspect) are
the ones where a judge decides whether the product is *magical* or just
*competent*. This bundle ships four features that each own one specific beat
inside those two segments, with no overlap and no query-engine surgery:

| Segment | Beat | Feature |
|---|---|---|
| 2 — ledger reveal | "see 3 years of thought in 10 seconds" | **A — Time Machine** |
| 3 — answer streaming | "watch Opus think" | **C — Reasoning X-Ray** |
| 3 — citation inspect | "verifiable in one click" | **B — Provenance Peek** |
| 3 → 4 — answer → graph | "citations are a map, not text" | **E — Follow the Thread** |

Three of four are frontend-pure. One (`C`) adds a single new SSE event type
to the backend. Total scope: **~800 LOC net across 4 components, 1 hook, 1
event**. Zero ledger-schema changes. Zero query-engine changes. No new
dependencies.

---

## 2. Feature A — Time Machine

**Goal:** make the ledger graph feel like a history of engineering thought
that the viewer can scrub through.

### 2.1 Surface

A 32px rail pinned to the bottom of the graph pane. Rendered only when the
current repo has ≥3 decisions with `decided_at` set. The rail is wrapped in
a glassmorphic material — `backdrop-blur-lg`, semi-transparent `bg-zinc-950/60`,
1px amber-tinted top border — so the graph pane stays visually continuous
beneath it.

### 2.2 Controls

- **Scrubber handle** — a 4px-wide draggable bar, amber when active, with a
  subtle shadow that intensifies during drag
- **Play / pause** — amber-accented circular button at the rail's left edge
- **Speed chip** — `1× / 4× / 10×` toggle, far-left. Resets on repo switch.
- **Cursor date label** — mono, zinc-300, formatted `2024-Oct-27`, updates
  at ~16ms cadence directly from the MotionValue (no React re-render)
- **Keyboard** — `←/→` step prev/next decision, `Space` play/pause, `Home`
  jump to earliest, `End` jump to "present" (reset)
- **Year axis** — secondary row below the rail, tiny mono labels at computed
  pixel positions (`2022 · 2023 · 2024 · 2025 · 2026`)

### 2.3 Graph behavior — MotionValue-driven

Performance-critical: a scrubber tick should NOT cause a React state update.
The scrubber writes to a single `useMotionValue<Date>` called `cutoff`.
Each React Flow node subscribes to `cutoff` via a `useTransform` and maps its
`decided_at` → target opacity + scale + hue shift. Edges follow the minimum
of their endpoints' opacity. This guarantees 60fps scrubbing even on a
400-node synthetic stress test.

Past-state tint (for cursor < present):

```
opacity:     0.08
scale:       0.96
filter:      hue-rotate(-20deg) saturate(0.4) brightness(0.7)
             → renders as cool slate; amber "present" nodes pop dramatically
```

Newly-surfaced nodes (just crossed the cursor) fire a one-shot 400ms amber
glow pulse. Implemented as a `whileInView`-style animation keyed on the node
id so it doesn't repeat on future scrubs of the same range.

### 2.4 Tick density & clustering

Each decision gets a ~4×4px amber tick at its `decided_at` position. When any
two consecutive ticks would land < 6px apart, they collapse into a **stack
glyph** — a small amber-tinted rounded rect with a count superscript (e.g.
`³`). Hovering a stack pops a card listing the clustered decisions; clicking
one pans the scrubber to that exact date and opens the side panel.

**Scale toggle** in the rail's top-right corner: `time · uniform`.
- `time` (default) — linear time axis, faithful to chronology
- `uniform` — each decision gets an equal slot, loses chronology, scales to
  pathological density (800+ decisions) without clustering

**Auto-switch:** if `decision_count > 200`, default to `uniform` and badge
the toggle with `time ⇄` to signal the affordance. None of our 4 hero repos
trigger this; it's defensive infrastructure for `+ ingest your own`.

### 2.5 Default state

Cursor at "present" → everything visible exactly as today. Interaction is
strictly opt-in. Reduced-motion users get the rail without entrance
animations; scrubbing still drives opacity (motion is the purpose, not
ornament) but with `transition: none`.

### 2.6 Files

- `frontend/components/TimelineRail.tsx` — new, ~240 LOC
- `frontend/components/LedgerGraph.tsx` — extended: accept `cutoffMV` motion
  value, thread it into node/edge transforms, ~60 LOC added
- `frontend/app/ledger/[owner]/[repo]/LedgerPage.tsx` — host the MotionValue
  and glue, ~30 LOC
- Backend: unchanged

---

## 3. Feature B — Provenance Peek

**Goal:** upgrade the citation hover card so "every claim is verifiable" is
felt instantly and typographically, not read as a sentence.

### 3.1 Surface

Enhancement to the existing `CitationChip` hover card (shipped Wave 4). No
GitHub API calls — all data already lives in `citations.citation_quote`.

### 3.2 Content tiers

**Tier 1 — quote treatment (editorial/brutalist):**
- Large amber drop-cap on the opening letter of the quote
- Italic serif body (same family as the alternatives block)
- Proper smart quotes (` “ ” ` via typography CSS, not literal characters)
- Quote sits in a `border-l-2 border-[#d4a24c]/60 pl-4` rail

**Tier 2 — attribution chip:**
- Author styled as a chip with the source-type glyph prefix (`💬` pr_comment
  / `✏️` inline_review_comment / `🔀` commit_message / `📄` pr_body / `📝`
  review_comment). Glyph color matches citation kind (decision=amber,
  forces=amber-300, consequences=emerald-300, context=zinc-400).
- Date rendered as `Dec 29, 2025`, mono

**Tier 3 — mini "when" timeline:**
- Thin horizontal bar representing the PR's discussion window
- A single amber dot marks where this citation falls
- Tooltip on bar: `comment 7 of 12 · 3 days after PR opened`
- Pure CSS flex — no chart library

**Tier 4 — related-citations footer:**
- `3 other claims cite this same thread →` — clickable
- Clicking scrolls the answer to the next citation that shares the same
  `source_id` (i.e., the same inline review comment or PR body)

### 3.3 Entrance animation

Stagger trimmed to **50ms per tier** (was 120ms). A per-chip `Set<string>`
in a module-scope ref tracks which chips have been seen this session; on
repeat hover, animation is skipped (`initial={false}`) so the card feels
instant. The Set clears on repo switch.

### 3.4 Files

- `frontend/components/ProvenanceCard.tsx` — new, ~180 LOC (extracted from
  the inline block in `CitationChip.tsx`)
- `frontend/components/CitationChip.tsx` — slim down to trigger + mount,
  delegate rendering to `ProvenanceCard`
- Backend: unchanged

---

## 4. Feature C — Reasoning X-Ray

**Goal:** make Opus's reasoning visible — not as hand-waving, but as a live
trace that lands at meaningful beats timed to the real stream.

### 4.1 Surface

New `ReasoningXRay` panel in `AskPanel`, positioned below the streamed
answer and above the self-check block. Collapsible; collapsed by default;
remembers open/closed per session via `localStorage`.

### 4.2 Signal sources

1. **Phase events** we already emit (`retrieving` → `reasoning` →
   `self_checking` → `done`). Each becomes a trace step with its arrival
   timestamp.

2. **Client-side citation discoveries** — as the `delta` stream arrives,
   regex-scan incoming text for citation tokens (`[PR #N, @handle, DATE]`).
   First discovery of each unique token emits a synthetic
   `resolved citation → PR #N (<decision title>) — @handle, <date>` line,
   timestamped at the moment of detection. The title is resolved from the
   loaded ledger snapshot (already in client memory).

3. **Backend `thought` events** (new) — `engine.py` emits a handful of
   deterministic-but-truthful context lines at phase transitions:
   - At `retrieving`: `loading ledger · <N> decisions · <C> categories`
   - At `reasoning` (start): `scanning <N> decisions · token budget <B>K`
   - At `self_checking` (start): `cross-checking <K> citations against ledger`
   - At `done`: `resolved · <V>/<T> citations verified`

   These numbers are known from the snapshot / answer / self-check payload,
   so they are *true*, not theatrics. They hit at real timing beats because
   phase transitions fire at real timing beats.

### 4.3 Visual

- Vertical trace, each line prefixed by a timestamp like `⟶ 0:02.4s`
- Two-palette hierarchy (per design feedback):
  - **Electric cyan** (`#67e8f9`) — system-logic text: the scan-line
    progress bar, the live "thinking" label, the trace step prefixes
  - **Amber** (`#d4a24c`) — historical data: resolved citations (author,
    PR number, title), verdict counts
- Left rail `border-l-2 border-cyan-400/30`
- Typing effect per line (40ms/char, capped at 12 chars/line so long lines
  snap through quickly)
- Cumulative scan-line at the top of the panel: a horizontal progress bar
  whose width tracks output-token progress against an estimated max (8192
  tokens). Color is cyan with a subtle pulsing gradient.

### 4.4 Done-state behavior

On `done`: scan-line fades over 600ms (opacity 1 → 0, width held constant so
it reads as "finished" not "reset"), then the panel auto-collapses after a
1000ms hold. If the user has manually expanded the panel during the stream,
auto-collapse is cancelled — user intent wins.

### 4.5 Files

- `backend/app/query/engine.py` — emit `thought` events at phase transitions,
  ~25 LOC added
- `backend/app/routers/impact.py` — mirror the thought events, ~15 LOC
- `frontend/lib/query.ts` — add `onThought` to the stream subscriber, pipe
  through to `AskPanel`
- `frontend/components/ReasoningXRay.tsx` — new, ~220 LOC
- `frontend/components/AskPanel.tsx` — mount the panel, wire the callback,
  ~20 LOC changed

---

## 5. Feature E — Follow the Thread

**Goal:** turn citations from static text into a navigable graph. Click a
chip inside an answer → the graph becomes a map of that citation's kin.

### 5.1 Behavior

On `CitationChip.onClick` (separate handler from hover):

1. Graph camera pans to the cited decision — React Flow `setCenter(x, y)`
   bridged through a `useSpring` MotionValue with our Wave-4 constants
   (`stiffness: 420, damping: 32`). Feels liquid-weight, not linear.
2. Cited node receives a 2-second amber glow pulse (reuses the Time Machine
   pulse component).
3. **Kin nodes** get a soft amber tint (`stroke: #d4a24c/30`, `fill: +6%
   amber`) for the same duration. Kinship is computed client-side from the
   loaded ledger snapshot:
   - Same `pr_number` as the cited citation, OR
   - Same `citation_author` as the cited citation, OR
   - Directly connected to the cited decision via a `decision_edges` row
4. Status chip appears top-left of the graph: `following thread: PR #3336 ·
   4 kin · clear`. The chip is amber-bordered, matches the impact-ripple
   chip's visual language.
5. Clicking `clear`, clicking elsewhere on the graph, or pressing `Esc`
   restores normal state with a reverse 400ms fade on the kin tints.

### 5.2 Edge cases

- Cited PR has no match in the loaded snapshot (can happen for cross-repo
  citations in a future multi-repo world): `setCenter` is skipped, a brief
  amber shake animation plays on the citation chip itself (`keyframes:
  translateX(-2px, 2px, 0)` over 160ms).
- User clicks a different citation while a thread is active: clean transition
  — old kin tints fade out as new ones fade in, no visual flicker.

### 5.3 Files

- `frontend/hooks/useThreadFollower.ts` — new, ~80 LOC (camera MotionValue +
  kinship computation + status-chip state)
- `frontend/components/CitationChip.tsx` — accept `onFollow` callback,
  wire it to the hook
- `frontend/components/LedgerGraph.tsx` — accept `threadKinIds: Set<string>
  | null` prop, tint matching nodes
- `frontend/app/ledger/[owner]/[repo]/LedgerPage.tsx` — host the hook
- Backend: unchanged

---

## 6. Shared infrastructure

- **Motion constants** from Wave 4 (`SPRING_TACTILE`, `useReducedMotion`) are
  reused everywhere. No new motion primitives.
- **Color tokens** — add two tokens to `globals.css`:
  `--cyan-signal: #67e8f9` (reasoning X-Ray system logic),
  `--slate-past: #334155` (Time Machine past-state hue shift).
- **Graph prop surface** — `LedgerGraph` already accepts `subgraphPrs` for
  Impact Ripple. We extend with `cutoffMV?: MotionValue<Date>` (A) and
  `threadKinIds?: Set<string>` (E). Zero breaking changes.
- **New SSE event** — `thought` events are forward-compatible. Old clients
  ignore unknown events. No version bump.

---

## 7. Out of scope (explicit YAGNI list)

- **GitHub API fetches** for B — rate-limit risk, deferred; all data we need
  is already in the ledger
- **Log-time scale** for A — distorts the "3 years of thought" framing;
  linear + clustering handles everything we need
- **Real Opus tool-use integration** for C — we're not calling tool use on the
  query path, and introducing it would require query-engine surgery. The
  `thought` events we emit are deterministic and truthful, not fabricated.
- **Multi-chip thread following** for E — one active thread at a time. A
  future version could support AND/OR kinship queries; not needed for demo.
- **Persisted scrubber position** for A — resets per repo, reasonable default

---

## 8. Demo-script integration

After shipping, `docs/DEMO-SCRIPT.md` will be updated to:

- **Segment 2** — opens with the Time Machine demo. Click play, 10s
  cinematic reveal. Stop at "present."
- **Segment 3** — run the canonical query. Reasoning X-Ray expands
  automatically, scan-line and trace stream while the answer fills in.
  Collapses itself on `done`.
- **Segment 3 (hover beat)** — hover a citation chip, Provenance Peek
  unfurls. Show the drop-cap, the "when" timeline, the related-citations
  footer.
- **Segment 3 → 4 transition** — click the same citation chip. Graph pans,
  kin nodes light up. Natural camera movement into the Impact Ripple segment.

No new script words needed — the existing voiceover already frames these
moments; the visuals now live up to the claims.

---

## 9. Test plan

Unit / Vitest (frontend):
- `useThreadFollower` kinship computation: same-PR / same-author / edge-based
- `TimelineRail` tick clustering: two ticks collide → one stack glyph with count
- `ProvenanceCard` stagger-skip on repeat hover

Integration / browser smoke:
- Time Machine: play 1× and 10×, confirm 60fps (devtools performance tab)
- Reasoning X-Ray: run a real query, confirm trace steps fire at phase
  transitions and citations appear as the stream detects them
- Provenance Peek: repeat-hover same chip, confirm instant (no stagger)
- Follow the Thread: click chip, confirm camera + kin tint; click elsewhere,
  confirm clean exit

Manual demo dry-run:
- Record a 60-second take on `pmndrs/zustand` covering all 4 features;
  watch back for any jank, re-record if needed. CI is not a substitute for
  visual polish — the demo take is the real acceptance test.

---

## 10. Rollout order (for the implementation plan)

1. **E — Follow the Thread** — smallest surface, reuses existing graph-prop
   patterns, unblocks confidence
2. **A — Time Machine** — highest-viz feature, best risk/reward to build
   early so we have time to polish
3. **B — Provenance Peek** — pure polish on existing component, low risk
4. **C — Reasoning X-Ray** — backend-touch + most motion work; ship last so
   prior three are already stable

Each feature commits + pushes independently. CI must be green before the
next one starts. Browser smoke-test after each.

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| MotionValue-driven graph scrubbing drops frames at 400+ nodes | Stress-test before merging A; fall back to React-state path if frame rate drops below 45fps |
| Reasoning X-Ray trace feels contrived | Every line is sourced from real stream signal; no invented steps. If it still feels thin, add more phase granularity to the backend rather than faking. |
| Scope creep past Sunday deadline | Each feature commits independently; if we hit 11pm Saturday with C incomplete, ship the first three and update demo script to omit segment 3-C |
| A citation's `pr_number` collides with an actual decision's `pr_number` by coincidence (E) | Kinship check also requires the decision to be in the loaded snapshot; if no match, handle the "no kin found" case cleanly |

---

## 12. Estimated effort (24h work budget remaining)

| Feature | Hours | Cumulative |
|---|---:|---:|
| E — Follow the Thread | 4h | 4h |
| A — Time Machine | 7h | 11h |
| B — Provenance Peek | 4h | 15h |
| C — Reasoning X-Ray | 6h | 21h |
| Demo-script update + dry-run + video take | 3h | 24h |

Buffer: zero. If any single feature overruns by 2h, we drop the buffer; by
4h, we drop one feature (C first). This is tight. The plan is tight on
purpose — the schedule was chosen, not accidental.

---

## 13. Approval

Design validated by product owner 2026-04-22. Four redirects incorporated
(MotionValue pipeline, glassmorphic rail, stagger timing, cyan/amber
palette split). Tick density question answered with linear-plus-clustering +
scale toggle. Ready for implementation plan (next: invoke `writing-plans`).
