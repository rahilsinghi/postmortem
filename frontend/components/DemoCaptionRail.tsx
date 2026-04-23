"use client";

import { AnimatePresence, motion } from "framer-motion";

import { useDemo } from "../lib/demo/DemoProvider";
import { useActiveCueProgress } from "../lib/demo/useDemoClock";
import { useReducedMotion } from "../lib/motion";

/**
 * Thin glass strip pinned to the viewport top. Displays the current cue's
 * caption with a fade/slide transition between beats. Only renders when
 * the demo is armed or playing — becomes invisible otherwise.
 */
export function DemoCaptionRail() {
  const { isDemo, state } = useDemo();
  const { cue } = useActiveCueProgress();
  const reduced = useReducedMotion();
  if (!isDemo || state === "ended" || state === "aborted") return null;
  const caption = cue?.caption;
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex h-9 items-center justify-center bg-gradient-to-b from-black/80 to-transparent"
    >
      <AnimatePresence mode="wait">
        {caption ? (
          <motion.span
            key={caption}
            initial={reduced ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={reduced ? { duration: 0 } : { duration: 0.3 }}
            className="font-mono text-[11px] tracking-wider text-zinc-300"
          >
            {caption}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
