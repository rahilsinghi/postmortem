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
    endSec: 5,
    kind: "caption",
    caption: "» postmortem — read the intent layer",
  },
  {
    id: "hero-click",
    startSec: 5,
    endSec: 8,
    kind: "caption",
    caption: "» loading hermes-agent + hono fixtures",
  },
  {
    id: "nav-to-ingest",
    startSec: 8,
    endSec: 10,
    kind: "navigate",
    payload: { path: "/ingest" },
  },
  {
    id: "type-ingest-form",
    startSec: 10,
    endSec: 16,
    kind: "type",
    payload: {
      fields: [
        { selector: 'input[name="repo"]', text: "NousResearch/hermes-agent" },
        { selector: 'input[name="limit"]', text: "100" },
        { selector: 'input[name="minDiscussion"]', text: "3" },
      ],
    },
    caption: "» ingesting a new repo",
  },
  {
    id: "submit-ingest",
    startSec: 16,
    endSec: 18,
    kind: "click",
    payload: { selector: 'button[type="submit"]' },
  },
  {
    id: "ingest-classify-extract",
    startSec: 18,
    endSec: 43,
    kind: "fixture",
    payload: { stream: "hermes-ingest-events" },
    caption: "» 30 classifier calls, decisions extracted live",
  },
  {
    id: "ingest-finalize",
    startSec: 43,
    endSec: 50,
    kind: "fixture",
    payload: { stream: "hermes-ingest-events" },
    caption: "» stitching edges",
  },
  {
    id: "ingest-done",
    startSec: 50,
    endSec: 52,
    kind: "highlight",
    payload: { selector: "a[href*='/ledger/']" },
  },
  {
    id: "nav-to-ledger",
    startSec: 52,
    endSec: 54,
    kind: "navigate",
    payload: { path: "/ledger/honojs/hono" },
    caption: "» 4 years of decisions, one ledger",
  },
  {
    id: "graph-entrance",
    startSec: 54,
    endSec: 58,
    kind: "fixture",
    payload: { wait: "graph-mounted" },
  },
  {
    id: "time-machine-play",
    startSec: 58,
    endSec: 70,
    kind: "autoplay-timeline",
    payload: { speed: 10 },
    caption: "» 2022 → 2026, compressed to 12 seconds",
  },
  {
    id: "click-node-4291",
    startSec: 70,
    endSec: 78,
    kind: "click",
    payload: { selector: "[data-pr='4291']" },
    caption: "» every decision has rejected alternatives",
  },
  {
    id: "click-node-3813",
    startSec: 78,
    endSec: 86,
    kind: "click",
    payload: { selector: "[data-pr='3813']" },
  },
  {
    id: "type-query",
    startSec: 86,
    endSec: 90,
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
    startSec: 90,
    endSec: 120,
    kind: "fixture",
    payload: { stream: "hono-query-events" },
    caption: "» reasoning with citations, live",
  },
  {
    id: "hover-first-chip",
    startSec: 120,
    endSec: 125,
    kind: "hover",
    payload: { selectorIndex: 0 },
    caption: "» every claim, verbatim",
  },
  {
    id: "click-first-chip",
    startSec: 125,
    endSec: 133,
    kind: "click",
    payload: { selectorIndex: 0, synthetic: "follow-thread" },
    caption: "» citations become navigation",
  },
  {
    id: "type-impact-query",
    startSec: 133,
    endSec: 137,
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
    startSec: 137,
    endSec: 157,
    kind: "fixture",
    payload: { stream: "hono-impact-events" },
  },
  {
    id: "nav-back-gallery",
    startSec: 157,
    endSec: 163,
    kind: "navigate",
    payload: { path: "/" },
    caption: "» $40 of API. 166 seconds of intent.",
  },
  {
    id: "tagline-fade",
    startSec: 163,
    endSec: 166,
    kind: "caption",
    caption: "code lives. intent is a ghost. postmortem summons it.",
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
