"use client";

import { motion } from "framer-motion";

import { useDemo } from "../lib/demo/DemoProvider";
import { useReducedMotion } from "../lib/motion";

/**
 * Gallery entry cards:
 *   ▶ PLAY 3-MINUTE DEMO     — full web tour + terminal finale (DemoProvider)
 *   ⌘ PLAY MCP TERMINAL DEMO — opens the Connect modal first so users see the
 *                              install command + tool list before the walkthrough.
 */
export function DemoHero({ onOpenMcp }: { onOpenMcp?: () => void }) {
  const { state, play } = useDemo();
  const reduced = useReducedMotion();
  const isArmed = state === "armed";
  const isPlaying = state === "playing";

  return (
    <div className="mb-6 space-y-3">
      {/* Primary — the full 3-min combined demo (web + terminal finale) */}
      <motion.button
        type="button"
        onClick={play}
        disabled={isPlaying}
        className="group relative flex w-full items-center justify-between gap-6 overflow-hidden rounded-xl border border-[#d4a24c]/50 bg-zinc-950 p-5 text-left transition hover:border-[#d4a24c] disabled:cursor-wait"
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
              3 minute demo · web + terminal
            </p>
            <p className="mt-1 text-lg font-medium text-zinc-50">
              {isArmed ? "Continue demo" : isPlaying ? "Playing…" : "Play the Postmortem demo"}
            </p>
            <p className="mt-1 max-w-xl text-sm text-zinc-400">
              Watch a fresh repo get ingested live, reason over 4 years of hono decisions, then
              finish with Postmortem running as an MCP tool inside Claude Code.
            </p>
          </div>
        </div>
        <span className="font-mono text-xs uppercase tracking-wider text-zinc-500 transition group-hover:text-[#d4a24c]">
          Press ▶ →
        </span>
      </motion.button>

      {/* Secondary — opens the Connect modal first so users see the install
          command + tool reference, then jump into the terminal walkthrough. */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.4, delay: 0.1, ease: "easeOut" }}
      >
        <button
          type="button"
          onClick={onOpenMcp}
          className="group relative flex w-full items-center justify-between gap-6 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-left transition hover:border-cyan-400/50"
        >
          <div className="flex items-center gap-4">
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/50 bg-cyan-400/10 text-sm text-cyan-300"
            >
              ⌘
            </span>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300/80">
                70 seconds · MCP terminal only
              </p>
              <p className="mt-1 text-[15px] font-medium text-zinc-100">
                Postmortem as a Claude Code MCP tool
              </p>
              <p className="mt-0.5 max-w-xl text-[13px] text-zinc-400">
                See the install command and 5-tool surface, then watch the terminal walkthrough.
              </p>
            </div>
          </div>
          <span className="font-mono text-xs uppercase tracking-wider text-zinc-500 transition group-hover:text-cyan-300">
            Connect + watch →
          </span>
        </button>
      </motion.div>
    </div>
  );
}
