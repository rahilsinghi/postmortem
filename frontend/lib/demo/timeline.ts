/**
 * The demo layer's cue list — the single source of truth for what the user
 * sees at every moment of the 166-second autoplay. Every visual change is
 * gated by exactly one cue id. No implicit timers in child components.
 *
 * A cue's window is [startSec, endSec) (half-open): at endSec, the NEXT
 * cue is considered active. This avoids flicker at boundaries.
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
    endSec: 33,
    kind: "fixture",
    payload: { stream: "nextjs-ingest-events" },
    caption: "» classifier + extractor streaming",
  },
  {
    id: "ingest-finalize",
    startSec: 33,
    endSec: 38,
    kind: "fixture",
    payload: { stream: "nextjs-ingest-events" },
    caption: "» stitching edges",
  },
  {
    id: "ingest-done",
    startSec: 38,
    endSec: 40,
    kind: "highlight",
    payload: { selector: "a[href*='/ledger/']" },
  },
  {
    id: "nav-to-ledger",
    startSec: 40,
    endSec: 42,
    kind: "navigate",
    payload: { path: "/ledger/honojs/hono" },
    caption: "» 4 years of decisions, one ledger",
  },
  {
    id: "graph-entrance",
    startSec: 42,
    endSec: 45,
    kind: "fixture",
    payload: { wait: "graph-mounted" },
  },
  {
    id: "time-machine-play",
    startSec: 45,
    endSec: 53,
    kind: "autoplay-timeline",
    payload: { speed: 10 },
    caption: "» 2022 → 2026, compressed",
  },
  {
    id: "click-node-4291",
    startSec: 53,
    endSec: 58,
    kind: "click",
    payload: { selector: "[data-pr='4291']" },
    caption: "» every decision has rejected alternatives",
  },
  {
    id: "click-node-3813",
    startSec: 58,
    endSec: 64,
    kind: "click",
    payload: { selector: "[data-pr='3813']" },
  },
  {
    id: "type-query",
    startSec: 64,
    endSec: 67,
    kind: "type",
    payload: {
      fields: [
        {
          selector: "textarea#q",
          text: "Why does Hono reject node:* modules in core?",
        },
      ],
    },
    caption: "» ask opus 4.7 directly",
  },
  {
    id: "fire-query",
    startSec: 67,
    endSec: 89,
    kind: "fixture",
    payload: { stream: "hono-query-events" },
    caption: "» reasoning with citations, live",
  },
  {
    id: "hover-first-chip",
    startSec: 89,
    endSec: 93,
    kind: "hover",
    payload: { selectorIndex: 0 },
    caption: "» every claim, verbatim",
  },
  {
    id: "click-first-chip",
    startSec: 93,
    endSec: 99,
    kind: "click",
    payload: { selectorIndex: 0, synthetic: "follow-thread" },
    caption: "» citations become navigation",
  },
  {
    id: "type-impact-query",
    startSec: 99,
    endSec: 102,
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
    startSec: 102,
    endSec: 116,
    kind: "fixture",
    payload: { stream: "hono-impact-events" },
  },
  {
    id: "nav-to-terminal",
    startSec: 116,
    endSec: 120,
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
