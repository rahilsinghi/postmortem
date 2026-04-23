"use client";

import { motion } from "framer-motion";

import { useDemo } from "../lib/demo/DemoProvider";
import { useReducedMotion } from "../lib/motion";

/**
 * The gallery's "▶ Play 3-minute demo" hero card. Clicking it activates the
 * DemoProvider's play() which stamps ?demo=1&play=1 into the URL and starts
 * the clock.
 */
export function DemoHero() {
  const { state, play } = useDemo();
  const reduced = useReducedMotion();
  const isArmed = state === "armed";
  const isPlaying = state === "playing";

  return (
    <motion.button
      type="button"
      onClick={play}
      disabled={isPlaying}
      className="group relative mb-6 flex w-full items-center justify-between gap-6 overflow-hidden rounded-xl border border-[#d4a24c]/50 bg-zinc-950 p-5 text-left transition hover:border-[#d4a24c] disabled:cursor-wait"
      initial={reduced ? false : { opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.4, ease: "easeOut" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#d4a24c]/10 via-transparent to-[#d4a24c]/10" />
      <div className="flex items-center gap-4">
        <motion.span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full border border-[#d4a24c] bg-[#d4a24c]/20 text-xl text-[#d4a24c]"
          animate={reduced ? {} : { scale: [1, 1.06, 1] }}
          transition={
            reduced ? { duration: 0 } : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
          }
        >
          ▶
        </motion.span>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#d4a24c]/80">
            3 minute demo
          </p>
          <p className="mt-1 text-lg font-medium text-zinc-50">
            {isArmed ? "Continue demo" : isPlaying ? "Playing…" : "Play the Postmortem demo"}
          </p>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            Watch a fresh repo get ingested live, then reason over 4 years of hono architectural
            decisions — all without touching the backend.
          </p>
        </div>
      </div>
      <span className="font-mono text-xs uppercase tracking-wider text-zinc-500 transition group-hover:text-[#d4a24c]">
        Press ▶ →
      </span>
    </motion.button>
  );
}
