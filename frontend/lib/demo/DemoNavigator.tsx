"use client";

import { useMotionValueEvent } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import { useDemo } from "./DemoProvider";
import { TIMELINE, type TimelineCue } from "./timeline";

/**
 * Fires one router.push per "navigate" cue in the TIMELINE, preserving
 * the ?demo=1&play=1 query params. Mount once, somewhere inside
 * DemoProvider. Iterates the cue list at mount and attaches a single
 * clock subscription that dispatches in-order.
 */
export function DemoNavigator() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { clockSec } = useDemo();
  const firedRef = useRef<Set<string>>(new Set());

  const navigateCues = TIMELINE.filter(
    (c): c is TimelineCue & { payload: { path: string } } =>
      c.kind === "navigate" && typeof (c.payload as { path?: string })?.path === "string",
  );

  const handleTick = useCallback(
    (t: number) => {
      for (const cue of navigateCues) {
        if (firedRef.current.has(cue.id)) continue;
        if (t < cue.startSec) continue;
        firedRef.current.add(cue.id);
        const params = new URLSearchParams(searchParams.toString());
        params.set("demo", "1");
        params.set("play", "1");
        router.push(`${cue.payload.path}?${params.toString()}`);
      }
      // Reset if the clock rewinds past all navigate cues
      if (navigateCues.length > 0 && t < navigateCues[0].startSec) {
        firedRef.current.clear();
      }
    },
    [navigateCues, router, searchParams],
  );

  useMotionValueEvent(clockSec, "change", handleTick);

  // Reset fired-set whenever the navigator remounts (abort + replay)
  useEffect(() => {
    firedRef.current.clear();
  }, []);

  return null;
}
