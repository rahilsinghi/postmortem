"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import { useReducedMotion } from "../lib/motion";

export type TraceStep = {
  id: string;
  timestamp: number; // ms since stream start
  kind: "phase" | "citation" | "thought";
  text: string;
};

type Props = {
  steps: TraceStep[];
  outputTokens: number;
  maxTokens: number; // upper bound for the scan-line progress bar
  done: boolean;
};

const STORAGE_KEY = "xray.open";

/**
 * Reasoning X-Ray — a live trace below the streamed answer. Two palettes:
 *   cyan (#67e8f9) — live/system signal: scan-line, phase/thought labels
 *   amber (#d4a24c) — resolved historical data: citation tokens
 *
 * Signal sources (rendered in arrival order):
 *   - phase: emitted by /api/query + /api/impact at known transitions
 *   - thought: deterministic backend-sourced context lines
 *   - citation: client-side detection of [PR #N, @author, DATE] tokens in
 *     the delta stream as the answer arrives
 *
 * Graceful dissolve on done: scan-line fades first, then the panel
 * auto-collapses after 1s — unless the user manually expanded it during
 * the stream, in which case we respect their intent.
 */
export function ReasoningXRay({ steps, outputTokens, maxTokens, done }: Props) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved === null ? true : saved === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    }
  }, [open]);

  const userOpenedRef = useRef(false);
  const [scanOpacity, setScanOpacity] = useState(1);

  // Reset scan opacity whenever a fresh stream begins (steps cleared by caller).
  useEffect(() => {
    if (steps.length === 0 && !done) {
      setScanOpacity(1);
    }
  }, [steps.length, done]);

  useEffect(() => {
    if (!done) return;
    const fade = window.setTimeout(() => setScanOpacity(0), 200);
    const collapse = window.setTimeout(() => {
      if (!userOpenedRef.current) setOpen(false);
    }, 1600);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(collapse);
    };
  }, [done]);

  const progress = useMemo(
    () => Math.min(1, maxTokens > 0 ? outputTokens / maxTokens : 0),
    [outputTokens, maxTokens],
  );

  if (steps.length === 0) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/60">
      <button
        type="button"
        onClick={() => {
          userOpenedRef.current = true;
          setOpen((v) => !v);
        }}
        className="flex w-full items-center justify-between px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400 transition hover:bg-zinc-900/60"
      >
        <span className="flex items-center gap-2">
          <span className="text-cyan-300">⚡</span>
          <span>reasoning trace</span>
          <span className="text-zinc-600">· {steps.length} steps</span>
        </span>
        <span
          className={`transition-transform ${open ? "rotate-90 text-[#d4a24c]" : "text-zinc-600"}`}
        >
          ›
        </span>
      </button>
      {!done || scanOpacity > 0 ? (
        <div className="relative h-0.5 bg-zinc-900">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500/40 via-cyan-300 to-cyan-500/40"
            style={{ width: `${Math.round(progress * 100)}%`, opacity: scanOpacity }}
            transition={reduced ? { duration: 0 } : { duration: 0.6, ease: "easeOut" }}
            animate={{ opacity: scanOpacity }}
          />
        </div>
      ) : null}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            key="trace-list"
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
            className="space-y-1 overflow-hidden border-t border-cyan-400/20 bg-black/40 px-3 py-2"
          >
            {steps.map((s) => (
              <motion.li
                key={s.id}
                initial={reduced ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.14, ease: "easeOut" }}
                className="flex items-baseline gap-2 font-mono text-[10px] leading-relaxed"
              >
                <span className="w-14 shrink-0 tabular-nums text-cyan-300/80">
                  ⟶ {(s.timestamp / 1000).toFixed(1)}s
                </span>
                <span
                  className={
                    s.kind === "citation"
                      ? "text-[#d4a24c]"
                      : s.kind === "phase"
                        ? "text-cyan-200/90"
                        : "text-cyan-100"
                  }
                >
                  {s.text}
                </span>
              </motion.li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
