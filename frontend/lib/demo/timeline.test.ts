import { describe, expect, test } from "vitest";

import { activeCue, progressOfCue, TIMELINE, totalDurationSec } from "./timeline";

describe("timeline", () => {
  test("TIMELINE has 20 cues summing to ~120 seconds (web segment of combined 3min demo)", () => {
    expect(TIMELINE.length).toBe(20);
    expect(Math.round(totalDurationSec())).toBeGreaterThanOrEqual(115);
    expect(Math.round(totalDurationSec())).toBeLessThanOrEqual(125);
  });

  test("activeCue returns null before play", () => {
    expect(activeCue(-0.5)).toBeNull();
  });

  test("activeCue resolves inside a cue window", () => {
    const c = activeCue(2.5);
    expect(c?.id).toBe("gallery-intro");
  });

  test("activeCue picks the next cue at exact start boundary", () => {
    // Cue 0 ends at 5; cue 1 starts at 5. At t=5 exactly, we prefer cue 1.
    const c = activeCue(TIMELINE[1].startSec);
    expect(c?.id).toBe(TIMELINE[1].id);
  });

  test("progressOfCue returns 0 before, 1 after, linear inside", () => {
    const cue = TIMELINE[0];
    expect(progressOfCue(cue, -1)).toBe(0);
    expect(progressOfCue(cue, cue.startSec + (cue.endSec - cue.startSec) / 2)).toBeCloseTo(0.5, 2);
    expect(progressOfCue(cue, cue.endSec + 1)).toBe(1);
  });
});
