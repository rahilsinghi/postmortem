# Demo Layer — Design

**Date:** 2026-04-23
**Status:** Approved for implementation
**Hackathon context:** Claude Code Hackathon, submission Sunday 2026-04-26 8pm EST
**Author:** rahil-singhi
**Scope:** A single `▶ PLAY 3-MIN DEMO` button on the gallery that choreographs a cinematic walkthrough of every Postmortem feature, designed for screen-recording + post-production editing.

---

## 1. Goal

Produce a **166-second autoplay experience** that walks through the full Postmortem product — from gallery entry, through live ingestion, graph exploration, query engine, Reasoning X-Ray, Provenance Peek, Follow the Thread, and Impact Ripple — at cinematic timings optimized for screen-record → zoom-in-post video editing. The user clicks play, screen-records, and hands off to post-production software for zoom/pan effects and final cuts.

## 2. Why this matters for the submission

The judges watch a 2-3 minute video. The previous demo-script (`docs/DEMO-SCRIPT.md`) assumes the demonstrator manually clicks through at optimal pace. That's fragile for a live recording. The demo layer replaces that manual choreography with a deterministic, repeatable, screen-record-safe playback.

Secondary benefit: the demo serves as a regression artifact. Any UI change that breaks the demo breaks the video — self-policing against feature-rot.

## 3. Fixed architectural decisions

These are locked per brainstorming session 2026-04-23:

1. **Fixture-driven real components.** A `DemoProvider` context intercepts `startQuery`, `startIngest`, and `fetch('/api/repos/...')` when the URL carries `?demo=1`. Real components (`IngestClient`, `LedgerPage`, `AskPanel`, `LedgerGraph`) render with fixture data served on a scripted clock. Zero duplicate UI code. Features automatically inherit future polish.

2. **Repos: `honojs/hono` primary + `NousResearch/hermes-agent` secondary.** Hono's 4-year span makes the Time Machine reveal land hard; its 59 decisions + 27 edges are the graph visual density sweet spot. Hermes-agent is the "fresh ingest" beat — 112k-star, 4,107-PR, trending repo; viewers recognize the scale.

3. **Fidelity: real capture, heavily scripted.** A capture script (`scripts/capture-demo-fixtures.py`) runs real ingest + query + impact calls against the Anthropic API, records SSE event streams to disk, then a normalizer rewrites timestamps to hit the frozen beat table. Every string in the fixtures is real Opus output.

4. **One-shot autoplay.** Press play → watch → end. No pause/scrub controls. `Esc` aborts with a fade + nav back to gallery.

5. **No fake cursor.** Each click target gets a 200ms amber ring-pulse immediately before the "click" fires so the eye is led without the visual baggage of a rendered cursor. The user screen-records with their real OS cursor hidden.

6. **Narrative typewriter.** A thin glass strip at the top of the viewport types short mono captions per segment. Fades between segments. Ties the beats together narratively.

7. **Cold-boot capable.** All fixtures ship as static JSON under `public/demo/`. Demo works with the backend completely offline — useful for recording on a plane, and for the submission itself (reviewers can replay without running our stack).

## 4. The 166-second timeline

| # | Beat | Window | Driver | Narrative caption |
|---|---|---|---|---|
| 1 | Gallery intro, hero "▶ PLAY 3-MIN DEMO" card glows pulsing amber | 0:00–0:05 | `DemoHero` | `» postmortem — read the intent layer` |
| 2 | Click fires; narrative typewriter starts; URL mutates to `?demo=1` | 0:05–0:08 | `DemoProvider.play()` | `» loading hermes-agent + hono fixtures` |
| 3 | Nav to `/ingest?demo=1` | 0:08–0:10 | `DemoNavigator` | (carries over) |
| 4 | `TypedInput` fills form: `NousResearch/hermes-agent`, limit `100`, min-disc `3` | 0:10–0:16 | `TypedInput` on existing IngestClient inputs | `» ingesting a new repo` |
| 5 | Click `Start ingestion`; listing pill activates with shimmer | 0:16–0:18 | fixture clock | — |
| 6 | Classify+Extract with 30 stream cards flying in; per-PR cost counts up | 0:18–0:43 | `IngestClient` subscribes to fixture SSE replayer | `» 30 classifier calls, 15 decisions extracted` |
| 7 | Persisting + Stitching pills activate with shimmer | 0:43–0:50 | fixture | `» stitching edges` |
| 8 | Done pill lights up; `OPEN LEDGER →` amber-pulses | 0:50–0:52 | fixture | — |
| 9 | Auto-nav to `/ledger/honojs/hono?demo=1` (note: nav to hono, not hermes) | 0:52–0:54 | `DemoNavigator` | `» 4 years of decisions, 1 ledger` |
| 10 | Graph entrance — 59 nodes, chronological edge-draw animation | 0:54–0:58 | existing `LedgerGraph.mounted` | — |
| 11 | Time Machine autoplay at 10×; scrubber rewinds to 2022, plays forward | 0:58–1:10 | existing `TimelineRail` play button | `» 2022 → 2026, compressed` |
| 12 | Click `#4291` (hono file-path / node:path debate); side panel unfurls | 1:10–1:18 | existing `DecisionSidePanel` | `» every decision has rejected alternatives` |
| 13 | Click `#3813` (Buffer rejection for Uint8Array); side panel updates | 1:18–1:26 | existing `DecisionSidePanel` | — |
| 14 | Typewriter question: *"Why does Hono reject node:* modules in core?"* | 1:26–1:30 | `TypedInput` on AskPanel textarea | `» ask opus 4.7 directly` |
| 15 | Answer streams with cyan X-Ray scan-line + trace lines | 1:30–2:00 | `AskPanel` subscribes to fixture query SSE | `» reasoning with citations, live` |
| 16 | Hover first citation chip → Provenance Peek unfurls (drop-cap, glyph, 3 related) | 2:00–2:05 | existing `CitationChip` hover, synthetic mouseenter | `» every claim, verbatim` |
| 17 | Click same chip → camera spring-pans, 4 kin nodes tint amber | 2:05–2:13 | existing `useThreadFollower` | `» citations become navigation` |
| 18 | Switch to impact mode → typewriter: *"What breaks if node:* is allowed in core?"* | 2:13–2:17 | mode toggle + TypedInput | `» impact ripple, traced` |
| 19 | Impact stream with kin subgraph glow + thought trace | 2:17–2:37 | fixture impact SSE | — |
| 20 | Nav back to `/?demo=1`; gallery `$31.87 INGESTED · 3 Q · $X.XX` count-up animates | 2:37–2:43 | `DemoNavigator` + existing `CountUp` | `» $40 of API. 166 seconds of intent.` |
| 21 | Fade to tagline | 2:43–2:46 | `DemoCaptionRail` | `code lives. intent is a ghost. postmortem summons it.` |

**Total:** 2 minutes 46 seconds.
**Buffer:** 14 seconds vs. the 3:00 ceiling. If any beat overruns, we have absorption room.

## 5. Component inventory

### 5.1 New components

| Path | Responsibility |
|---|---|
| `frontend/lib/demo/DemoProvider.tsx` | Context provider exposing `{ isDemo, clockSec, timeline, play, abort, state }`. Mounted at app root. Reads `?demo=1` URL flag on mount. |
| `frontend/lib/demo/timeline.ts` | The single source of truth for all 21 beats as typed `TimelineCue[]`. Each cue has `startSec`, `endSec`, `kind`, `target`, `payload`. |
| `frontend/lib/demo/fixtureClient.ts` | When `isDemo`, mock-implements `startQuery`, `startIngest`, and the `/api/repos` + `/ledger` fetches. Replays SSE events at scripted timestamps against the clock. |
| `frontend/lib/demo/TypedInput.tsx` | Plays a typewriter effect into any `<input>` or `<textarea>` by React ref — fires synthetic `input` events so the real state handlers catch them. |
| `frontend/lib/demo/DemoNavigator.tsx` | Hooks into `usePathname` + `useRouter`. When timeline requests nav to a path, performs smooth `router.push` that preserves `?demo=1`. |
| `frontend/components/DemoHero.tsx` | The gallery's amber hero card with pulsing ▶, three mini-thumbnails (graph / X-Ray / Peek), "3 min" badge. |
| `frontend/components/DemoCaptionRail.tsx` | Thin glass strip at viewport top; types the current beat's caption. Fades between beats. |
| `frontend/components/DemoHighlight.tsx` | Invisible wrapper that, when clock hits its scheduled time, briefly pulses an amber ring around its children or a target selector. Used to lead the eye to "click" targets. |
| `scripts/capture-demo-fixtures.py` | Runs real ingest + query + impact calls, records SSE to JSON files under `public/demo/`. Also supports `--dry-run` for cost preview. |

### 5.2 Modified components

| Path | Change |
|---|---|
| `frontend/app/page.tsx` | Mount `DemoHero` above the existing repo grid. |
| `frontend/app/layout.tsx` | Wrap children in `DemoProvider` so `isDemo` + clock are app-wide. |
| `frontend/app/ingest/IngestClient.tsx` | On mount, if `isDemo`, subscribe to `fixtureClient.startIngest()` instead of the real SSE. Add `DemoHighlight` on form + submit button. |
| `frontend/app/ledger/[owner]/[repo]/LedgerPage.tsx` | Same pattern: swap real `startQuery` with fixture when in demo. Add highlight wrappers on graph + node-click targets. |
| `frontend/components/AskPanel.tsx` | Accept `__demoRun` prop from parent so the demo can fire typed questions directly without racing React state. |
| `frontend/lib/api.ts` | Add `fetchLedger` / `fetchRepos` indirection: if `isDemo`, return cached fixture; else real fetch. |

### 5.3 Fixture files (all under `public/demo/`)

| File | Size | Source |
|---|---|---|
| `hermes-ingest-events.json` | ~100-200 KB | capture script, real ingest of hermes-agent at limit=30 |
| `hono-ledger.json` | ~400 KB | captured from `/api/repos/honojs/hono/ledger` |
| `hono-query-events.json` | ~30 KB | capture script, real query against hono |
| `hono-impact-events.json` | ~25 KB | capture script, real impact ripple against hono |
| `gallery-repos.json` | ~2 KB | snapshot of `/api/repos` post-capture |
| `timeline.json` | ~5 KB | the 21 beats with any runtime-tunable params |

Total: ~600 KB. Safe to commit.

## 6. Interaction flow specifics

### 6.1 `DemoProvider` state machine

```
idle → armed (after ?demo=1 detected) → playing (after user clicks hero) → ended
                                      ↓
                                   aborted (after Esc)
```

- `idle`: not in demo mode
- `armed`: URL has `?demo=1` but user hasn't pressed play (e.g., they pasted a demo link). Gallery hero card says `▶ Continue demo`.
- `playing`: clock is ticking; all interception active.
- `ended`: timeline reached final cue; `?demo=1` stays in URL but clock stops.
- `aborted`: `Esc` pressed. Faded back to gallery; URL cleaned.

### 6.2 Clock semantics

A single `useMotionValue<number>` = seconds since `play()` was called. Every cue is `[startSec, endSec]`. Cues subscribe via `useTransform` → their own derived motion value that exposes `active: boolean` + `progress: 0..1`. No React state updates per frame — all animation via motion values.

### 6.3 Event replay

The capture script emits fixtures shaped like:

```json
{
  "events": [
    { "ts_ms": 0,      "event": "phase",   "data": "retrieving" },
    { "ts_ms": 40,     "event": "stats",   "data": { "repo": "honojs/hono", ... } },
    { "ts_ms": 120,    "event": "thought", "data": { "label": "loading ledger · 59 decisions ..." } },
    ...
    { "ts_ms": 18400,  "event": "phase",   "data": "done" }
  ]
}
```

`fixtureClient.startQuery` becomes a generator that schedules each event's dispatch to the existing callback based on `ts_ms * playbackSpeed`. Playback speed defaults to whatever normalizes the event stream to the cue's window; a hono query that really took 30s fits the 30s cue at 1×.

### 6.4 Typewriter (`TypedInput`)

Types character-by-character at ~40 chars/sec (25ms per char). Uses the native `setter` on `HTMLInputElement.prototype.value` + dispatches `input` events so React's controlled inputs update correctly. Adds a blinking cursor overlay that disappears when done.

### 6.5 Highlight rings

A `DemoHighlight` with `targetRef` renders nothing by default; when its scheduled window opens, a 200ms amber ring pulses via Framer Motion overlay positioned over the target's bounding rect. The actual "click" is fired ~200ms later (e.g., `targetRef.current.click()`). The eye is led; the cursor isn't needed.

## 7. Capture script details (`scripts/capture-demo-fixtures.py`)

Recommended usage:

```bash
# Preview cost, no spend
uv run python scripts/capture-demo-fixtures.py --dry-run

# Full capture (one-time, ~$12-15 total spend):
#   - hermes-agent ingest (limit=30, min_discussion=2): $4-6
#   - hono query (self_check=true): $4-5
#   - hono impact (self_check=false): $3
#   - ledger + repos snapshots: free
uv run python scripts/capture-demo-fixtures.py --commit
```

Script:
1. Hits `/api/repos` → saves `public/demo/gallery-repos.json`
2. Hits `/api/repos/honojs/hono/ledger` → saves `public/demo/hono-ledger.json`
3. Hits `/api/ingest` for NousResearch/hermes-agent with SSE recording → saves `public/demo/hermes-ingest-events.json`
4. Hits `/api/query` with pre-chosen question → saves `public/demo/hono-query-events.json`
5. Hits `/api/impact` with pre-chosen question + anchor → saves `public/demo/hono-impact-events.json`
6. Writes a capture manifest with costs, token counts, timestamps

Normalizer (`scripts/normalize-demo-fixtures.py`) separately rewrites timestamps in the event streams so that each fits its assigned cue window exactly. This is the "heavily scripted" part of "real capture, heavily scripted" — real content, massaged timing.

## 8. Button + hero card visual design

Gallery hero card above the repo grid:

- 1080×140px glass card, amber gradient border, dark zinc background
- Left: large `▶` in amber, pulsing at 0.5 Hz (subtle)
- Center: title "Play the 3-minute demo" + subtitle "watch postmortem excavate a live repo, then reason over 4 years of architectural decisions"
- Right: three 48×48 thumbnails previewing graph / X-Ray / Peek with a subtle amber frame
- Hover state: border glows brighter, ▶ scales 1.06
- Keyboard: `Space` plays when card is focused

## 9. Out of scope (explicit YAGNI)

- Fake animated cursor — editor handles
- Pause / scrub / chapter controls — single press-play
- Internationalization of narrative captions
- Voiceover audio bundled in-app — user's post-production adds voiceover separately
- Demo-specific theme (dark-only; no light variant)
- Mobile demo — desktop-first, 1440×900+ viewport

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Fixture event shape drifts when `startQuery` / `startIngest` types change | Add a type-level check: `satisfies` assertion on each fixture ensures it matches the current `StartQueryEvent` union |
| Timings drift on slower CPUs | Clock is wall-clock driven, not frame-driven. Beats fire on real elapsed time. Only animation smoothness suffers on slow hardware. |
| Demo runs during a real user's session (URL flag leaks) | `?demo=1` is stripped on abort and on completion; browsing away clears the flag. |
| Screen record captures browser cursor anyway | Document in README that user should disable cursor in QuickTime recording settings. |
| Capture script fails mid-way and leaves partial fixtures | Script uses atomic writes (write to `.tmp`, rename); no partial state. |
| The hermes-agent ingest returns 0 qualifying PRs (our silent-0 bug from earlier this session) | Script does a PR-count preflight and aborts with a clear message if <15 PRs would qualify; retries at `min_discussion=1`. |

## 11. Effort estimate

| Wave | Hours | What |
|---|---|---|
| D1 — Scaffold | 2h | `DemoProvider`, `timeline.ts`, `fixtureClient.ts`, URL-flag plumbing |
| D2 — Fixtures | 1h | `capture-demo-fixtures.py` + `normalize-demo-fixtures.py` + run against live API (~$12) |
| D3 — Real-component wiring | 3h | Intercept points in `IngestClient`, `LedgerPage`, `AskPanel`, `fetchLedger`, `fetchRepos` |
| D4 — `TypedInput` + `DemoHighlight` + `DemoNavigator` | 2h | Utility components |
| D5 — `DemoHero` + `DemoCaptionRail` | 2h | The visual chrome |
| D6 — Timeline authoring + end-to-end debug | 2h | Cue windows, beat-to-beat smoothing, edge cases |
| D7 — Browser smoke + demo take rehearsals | 1h | Iterate on the 166s timing; bake into final fixture |

**Total: 13h**. Fits in Friday–Saturday if started immediately.

## 12. Success criteria

1. From a cold `git clone` + `pnpm install` + `pnpm dev` with **no backend running**, clicking the hero plays the full 166s demo without errors.
2. Every feature from the ambitious-demo-bundle spec is visible in the demo at cinematic timing.
3. Total playback variance <500ms across three consecutive plays (determinism).
4. `Esc` aborts cleanly; URL flag removed; gallery restored.
5. CI green — no regressions to non-demo code paths.

## 13. Approval

Design validated by product owner 2026-04-23. Repo picks (hono + hermes-agent), architecture (fixture-driven), fidelity (captured + scripted) all confirmed. Ready for implementation plan (next: invoke `writing-plans`).
