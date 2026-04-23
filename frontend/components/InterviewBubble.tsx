"use client";

import { motion } from "framer-motion";
import type { Decision } from "../lib/api";
import { useReducedMotion } from "../lib/motion";
import { InlineRich } from "./AnswerView";

type Verdict = Map<string, { verified: boolean; reason: string }>;

export function InterviewBubble({
  role,
  text,
  decisions,
  verdict,
  streaming = false,
}: {
  role: "interviewer" | "subject";
  text: string;
  decisions: Decision[];
  verdict?: Verdict;
  streaming?: boolean;
}) {
  const reduced = useReducedMotion();
  const v = verdict ?? new Map();

  if (role === "interviewer") {
    return (
      <motion.div
        initial={reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduced ? { duration: 0 } : { duration: 0.2 }}
        className="mr-auto max-w-[85%] rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-zinc-300"
      >
        {text}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="ml-auto max-w-[85%] rounded-lg border border-[#d4a24c]/40 bg-[#d4a24c]/[0.05] px-3 py-2.5 text-[13px] leading-relaxed text-zinc-100"
    >
      <InlineRich text={text} decisions={decisions} verdict={v} />
      {streaming ? (
        <span
          className="ml-0.5 inline-block h-[1em] w-[0.4em] -translate-y-[1px] rounded-[1px] align-middle"
          style={{ backgroundColor: "#d4a24c" }}
        />
      ) : null}
    </motion.div>
  );
}
