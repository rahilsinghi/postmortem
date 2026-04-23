"use client";

import { useMotionValueEvent } from "framer-motion";
import { useCallback, useRef, useState } from "react";

import { useDemo } from "./DemoProvider";
import { activeCue, progressOfCue, TIMELINE, type TimelineCue } from "./timeline";

/**
 * Subscribe to the demo clock and learn when a specific cue is active.
 * Re-renders ONLY on transitions in/out of the cue's window.
 */
export function useCueActive(cueId: string): { active: boolean; cue: TimelineCue | undefined } {
  const { clockSec } = useDemo();
  const cue = TIMELINE.find((c) => c.id === cueId);
  const [active, setActive] = useState(false);
  useMotionValueEvent(clockSec, "change", (t) => {
    const isActive = cue ? t >= cue.startSec && t < cue.endSec : false;
    setActive((prev) => (prev === isActive ? prev : isActive));
  });
  return { active, cue };
}

/**
 * Fire a one-shot callback the moment a cue becomes active. Useful for
 * triggering synthetic clicks / typewriter sessions at precise timings.
 * Re-arms when the clock reverses past the cue's startSec (e.g. replay).
 */
export function useCueTrigger(cueId: string, onFire: () => void): void {
  const { clockSec } = useDemo();
  const cue = TIMELINE.find((c) => c.id === cueId);
  const firedRef = useRef(false);
  const stableOnFire = useCallback(onFire, [onFire]);
  useMotionValueEvent(clockSec, "change", (t) => {
    if (!cue) return;
    const isActive = t >= cue.startSec && t < cue.endSec;
    if (isActive && !firedRef.current) {
      firedRef.current = true;
      stableOnFire();
    }
    if (t < cue.startSec) firedRef.current = false;
  });
}

/** Reactive progress (0..1) inside any currently-active cue. */
export function useActiveCueProgress(): { cue: TimelineCue | null; progress: number } {
  const { clockSec } = useDemo();
  const [cue, setCue] = useState<TimelineCue | null>(null);
  const [progress, setProgress] = useState(0);
  useMotionValueEvent(clockSec, "change", (t) => {
    const c = activeCue(t);
    setCue((prev) => (prev?.id === c?.id ? prev : c));
    setProgress(c ? progressOfCue(c, t) : 0);
  });
  return { cue, progress };
}
