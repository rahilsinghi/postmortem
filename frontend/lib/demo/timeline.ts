/**
 * The demo layer's cue list — the single source of truth for what the user
 * sees at every moment of the 150-second autoplay (web segment of the
 * combined 3-minute reel; terminal adds the final 30s). Every visual change
 * is gated by exactly one cue id. No implicit timers in child components.
 *
 * A cue's window is [startSec, endSec) (half-open): at endSec, the NEXT
 * cue is considered active. This avoids flicker at boundaries.
 *
 * Act structure (150s total):
 *   Act 1 — Gallery → Ingest (0–40s)   … classifier/extractor stream
 *   Act 2 — Ledger + Time Machine (40–55s)
 *   Act 3 — Ask + Reasoning X-Ray (55–80s)   … live Opus thinking lines
 *   Act 4 — Impact Ripple (80–95s)
 *   Act 5 — Conflict Finder (95–113s)        … NEW — 4 cached conflicts
 *   Act 6 — Ghost Interview (113–145s)       … NEW — @yusukebe voice
 *   Act 7 — Hand-off to terminal (145–150s)
 */

export type CueKind =
  | "caption" // DemoCaptionRail types the payload string
  | "navigate" // DemoNavigator pushes to payload.path
  | "highlight" // DemoHighlight pulses a ring on payload.selector
  | "type" // TypedInput types payload.text into payload.selector
  | "click" // synthetic .click() on payload.selector
  | "fixture" // fixture stream becomes active
  | "autoplay-timeline" // Time Machine play button fires
  | "hover" // synthetic mouseenter on payload.selector
  | "esc-exit"; // end cue — provider transitions to `ended`

export type TimelineCue = {
  id: string;
  startSec: number;
  endSec: number;
  kind: CueKind;
  // Free-form payload; each kind's consumer knows how to read it.
  payload?: Record<string, unknown>;
  caption?: string;
};

export const TIMELINE: readonly TimelineCue[] = [
  // ── Act 1 · Gallery + Ingest (0–40s) ─────────────────────────────────
  {
    id: "gallery-intro",
    startSec: 0,
    endSec: 4,
    kind: "caption",
    caption: "» postmortem — read the intent layer",
  },
  {
    id: "hero-click",
    startSec: 4,
    endSec: 6,
    kind: "caption",
    caption: "» loading fixtures",
  },
  {
    id: "nav-to-ingest",
    startSec: 6,
    endSec: 8,
    kind: "navigate",
    payload: { path: "/ingest" },
  },
  {
    id: "type-ingest-form",
    startSec: 8,
    endSec: 13,
    kind: "type",
    payload: {
      fields: [
        { selector: 'input[name="repo"]', text: "vercel/next.js" },
        { selector: 'input[name="limit"]', text: "100" },
        { selector: 'input[name="minDiscussion"]', text: "3" },
      ],
    },
    caption: "» ingesting a new repo",
  },
  {
    id: "submit-ingest",
    startSec: 13,
    endSec: 15,
    kind: "click",
    payload: { selector: 'button[type="submit"]' },
  },
  {
    id: "ingest-classify-extract",
    startSec: 15,
    endSec: 30,
    kind: "fixture",
    payload: { stream: "nextjs-ingest-events" },
    caption: "» classifier + extractor streaming",
  },
  {
    id: "ingest-finalize",
    startSec: 30,
    endSec: 35,
    kind: "fixture",
    payload: { stream: "nextjs-ingest-events" },
    caption: "» stitching edges",
  },
  {
    id: "ingest-done",
    startSec: 35,
    endSec: 37,
    kind: "highlight",
    payload: { selector: "a[href*='/ledger/']" },
  },
  {
    id: "nav-to-ledger",
    startSec: 37,
    endSec: 40,
    kind: "navigate",
    payload: { path: "/ledger/honojs/hono" },
    caption: "» 4 years of decisions, one ledger",
  },

  // ── Act 2 · Ledger map + Time Machine (40–55s) ───────────────────────
  {
    id: "graph-entrance",
    startSec: 40,
    endSec: 43,
    kind: "fixture",
    payload: { wait: "graph-mounted" },
  },
  {
    id: "time-machine-play",
    startSec: 43,
    endSec: 50,
    kind: "autoplay-timeline",
    payload: { speed: 10 },
    caption: "» 2022 → 2026, compressed",
  },
  {
    id: "click-node-4291",
    startSec: 50,
    endSec: 53,
    kind: "click",
    payload: { selector: "[data-pr='4291']" },
    caption: "» every decision has rejected alternatives",
  },
  {
    id: "click-node-3813",
    startSec: 53,
    endSec: 55,
    kind: "click",
    payload: { selector: "[data-pr='3813']" },
  },

  // ── Act 3 · Ask + Reasoning X-Ray (55–80s) ───────────────────────────
  {
    id: "type-query",
    startSec: 55,
    endSec: 58,
    kind: "type",
    payload: {
      fields: [
        {
          selector: "textarea#q",
          text: "Why does Hono reject node:* modules in core?",
        },
      ],
    },
    caption: "» ask opus 4.7, watch it think",
  },
  {
    id: "fire-query",
    startSec: 58,
    endSec: 78,
    kind: "fixture",
    payload: { stream: "hono-query-events" },
    caption: "» reasoning tokens streaming · citations resolving",
  },
  {
    id: "hover-first-chip",
    startSec: 78,
    endSec: 80,
    kind: "hover",
    payload: { selectorIndex: 0 },
    caption: "» every claim, verbatim",
  },

  // ── Act 4 · Impact Ripple (80–95s) ───────────────────────────────────
  {
    id: "type-impact-query",
    startSec: 80,
    endSec: 83,
    kind: "type",
    payload: {
      fields: [
        {
          selector: "textarea#q",
          text: "What breaks if node:* is allowed in core?",
        },
      ],
      modeToggle: "impact",
    },
    caption: "» impact ripple, traced",
  },
  {
    id: "fire-impact",
    startSec: 83,
    endSec: 95,
    kind: "fixture",
    payload: { stream: "hono-impact-events" },
  },

  // ── Act 5 · Conflict Finder (95–113s) · NEW ──────────────────────────
  {
    id: "conflict-hint",
    startSec: 95,
    endSec: 97,
    kind: "caption",
    caption: "» what quietly contradicts?",
  },
  {
    id: "open-conflict-finder",
    startSec: 97,
    endSec: 99,
    kind: "click",
    payload: { selector: "[data-demo-target='conflict-finder-open']" },
  },
  {
    id: "conflict-scan",
    startSec: 99,
    endSec: 113,
    kind: "fixture",
    payload: { stream: "hono-conflicts" },
    caption: "» 4 contradictions across the ledger",
  },

  // ── Act 6 · Ghost Interview (113–145s) · NEW ─────────────────────────
  {
    id: "close-conflict-finder",
    startSec: 113,
    endSec: 115,
    kind: "click",
    payload: { selector: "[data-demo-target='conflict-finder-close']" },
  },
  {
    id: "interview-hint",
    startSec: 115,
    endSec: 117,
    kind: "caption",
    caption: "» summon a maintainer",
  },
  {
    id: "open-interview-picker",
    startSec: 117,
    endSec: 119,
    kind: "click",
    payload: { selector: "[data-demo-target='interview-open']" },
  },
  {
    id: "pick-subject-yusukebe",
    startSec: 119,
    endSec: 122,
    kind: "click",
    payload: { selector: "[data-demo-target='interview-pick-yusukebe']" },
    caption: "» interviewing @yusukebe",
  },
  {
    id: "interview-stream",
    startSec: 122,
    endSec: 145,
    kind: "fixture",
    payload: { stream: "hono-interview-yusukebe" },
    caption: "» opus speaks in the maintainer's own words",
  },

  // ── Act 7 · Hand-off to terminal (145–150s) ──────────────────────────
  {
    id: "nav-to-terminal",
    startSec: 145,
    endSec: 150,
    kind: "navigate",
    payload: { path: "/demo/terminal", continueToTerminal: true },
    caption: "» now, inside your editor",
  },
];

export function totalDurationSec(): number {
  return TIMELINE[TIMELINE.length - 1]?.endSec ?? 0;
}

/**
 * Resolve the active cue at wall-clock `t` seconds.
 *
 * Boundary behavior: at t === endSec of cue N, cue N+1 is considered
 * active (endSec is exclusive). Anything before the first cue returns
 * null.
 */
export function activeCue(t: number): TimelineCue | null {
  if (t < 0) return null;
  for (const cue of TIMELINE) {
    if (t >= cue.startSec && t < cue.endSec) return cue;
  }
  return null;
}

/** Linear progress (0..1) within the given cue at wall-clock `t`. */
export function progressOfCue(cue: TimelineCue, t: number): number {
  if (t <= cue.startSec) return 0;
  if (t >= cue.endSec) return 1;
  const span = cue.endSec - cue.startSec || 1;
  return (t - cue.startSec) / span;
}
