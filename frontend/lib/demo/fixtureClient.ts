"use client";

import type { IngestEvent, IngestHandlers } from "../ingest";
import type {
  QueryEvents,
  QueryPhase,
  SelfCheckResult,
  StatsEvent,
  SubgraphEvent,
  ThoughtEvent,
  UsageEvent,
} from "../query";

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

/**
 * Route replayed fixture events into the same callbacks the real
 * `startQuery` uses. Returns a tiny handle whose `.close()` cancels
 * pending timers — signature compatible with EventSource for drop-in use.
 */
export function fakeStartQuery(
  events: FixtureEvent[],
  handlers: QueryEvents,
  opts: { speed?: number } = {},
): { close: () => void } {
  const handle = scheduleEvents(events, {
    speed: opts.speed ?? 1,
    onEvent: (ev) => {
      switch (ev.event) {
        case "phase":
          handlers.onPhase(ev.data as QueryPhase);
          break;
        case "stats":
          handlers.onStats(ev.data as StatsEvent);
          break;
        case "delta": {
          const d = ev.data as { text: string };
          handlers.onDelta(d.text);
          break;
        }
        case "self_check":
          handlers.onSelfCheck(ev.data as SelfCheckResult);
          break;
        case "usage":
          handlers.onUsage(ev.data as UsageEvent);
          break;
        case "thought":
          handlers.onThought?.(ev.data as ThoughtEvent);
          break;
        case "subgraph":
          handlers.onSubgraph?.(ev.data as SubgraphEvent);
          break;
        case "error": {
          const e = ev.data as { message: string };
          handlers.onError(e.message);
          break;
        }
      }
    },
  });
  return { close: handle.cancel };
}

/**
 * Route replayed fixture events into the real `startIngest` handler shape
 * (flat onEvent callback). Returns a handle mimicking EventSource's .close().
 */
export function fakeStartIngest(
  events: FixtureEvent[],
  handlers: IngestHandlers,
  opts: { speed?: number } = {},
): { close: () => void } {
  let closed = false;
  const handle = scheduleEvents(events, {
    speed: opts.speed ?? 1,
    onEvent: (ev) => {
      if (closed) return;
      handlers.onEvent(ev.data as IngestEvent);
      if (ev.event === "done" || ev.event === "error") {
        closed = true;
        handlers.onClose();
      }
    },
  });
  return {
    close: () => {
      closed = true;
      handle.cancel();
    },
  };
}
