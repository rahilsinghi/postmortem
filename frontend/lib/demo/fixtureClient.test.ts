import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { scheduleEvents } from "./fixtureClient";

describe("fixtureClient scheduler", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("fires events at their ts_ms offsets", () => {
    const log: string[] = [];
    const events = [
      { ts_ms: 0, event: "phase", data: "retrieving" },
      { ts_ms: 100, event: "delta", data: { text: "A" } },
      { ts_ms: 250, event: "phase", data: "done" },
    ];
    const handle = scheduleEvents(events, {
      onEvent: (e) => log.push(`${e.ts_ms}:${e.event}`),
      speed: 1,
    });
    vi.advanceTimersByTime(50);
    expect(log).toEqual(["0:phase"]);
    vi.advanceTimersByTime(60);
    expect(log).toEqual(["0:phase", "100:delta"]);
    vi.advanceTimersByTime(200);
    expect(log).toEqual(["0:phase", "100:delta", "250:phase"]);
    handle.cancel();
  });

  test("speed=2 compresses timing", () => {
    const log: number[] = [];
    const events = [
      { ts_ms: 0, event: "phase", data: "x" },
      { ts_ms: 1000, event: "phase", data: "done" },
    ];
    scheduleEvents(events, { onEvent: (e) => log.push(e.ts_ms), speed: 2 });
    vi.advanceTimersByTime(450);
    expect(log).toEqual([0]);
    vi.advanceTimersByTime(100);
    expect(log).toEqual([0, 1000]);
  });

  test("cancel stops pending events", () => {
    const log: number[] = [];
    const events = [
      { ts_ms: 0, event: "x", data: null },
      { ts_ms: 100, event: "x", data: null },
      { ts_ms: 500, event: "x", data: null },
    ];
    const handle = scheduleEvents(events, { onEvent: (e) => log.push(e.ts_ms), speed: 1 });
    vi.advanceTimersByTime(50);
    handle.cancel();
    vi.advanceTimersByTime(1000);
    expect(log).toEqual([0]);
  });
});
