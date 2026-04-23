"use client";

export type FixtureEvent = {
  ts_ms: number;
  event: string;
  data: unknown;
};

export type ScheduleOptions = {
  onEvent: (ev: FixtureEvent) => void;
  speed?: number;
};

export type ScheduleHandle = {
  cancel: () => void;
};

/**
 * Dispatch each event at `ts_ms / speed` milliseconds from now. Pure timer-
 * driven (setTimeout). Cancel clears all pending timers.
 */
export function scheduleEvents(
  events: FixtureEvent[],
  { onEvent, speed = 1 }: ScheduleOptions,
): ScheduleHandle {
  // setTimeout is used without the `window.` prefix so this module is safe to
  // import in Node test environments too.
  const timers: ReturnType<typeof setTimeout>[] = [];
  for (const ev of events) {
    const delay = Math.max(0, ev.ts_ms / Math.max(0.01, speed));
    const id = setTimeout(() => onEvent(ev), delay);
    timers.push(id);
  }
  return {
    cancel: () => {
      for (const id of timers) clearTimeout(id);
    },
  };
}
