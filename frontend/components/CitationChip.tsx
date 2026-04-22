"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import type { Decision } from "../lib/api";
import { type CitationMatch, resolveCitation } from "../lib/citations";
import { SPRING_TACTILE, useReducedMotion } from "../lib/motion";

function buildFallbackUrl(match: CitationMatch, decisions: Decision[]): string {
  const decision = decisions.find((d) => d.pr_number === match.prNumber);
  if (decision) return decision.pr_url;
  return "#";
}

const SOURCE_ICON: Record<string, string> = {
  pr_body: "◆",
  pr_comment: "◇",
  review_comment: "▸",
  inline_review_comment: "▪",
  linked_issue_body: "⦿",
  linked_issue_comment: "○",
  commit_message: "●",
};

export function CitationChip({
  match,
  decisions,
  verified,
  unverifiedReason,
  onFollow,
}: {
  match: CitationMatch;
  decisions: Decision[];
  verified?: boolean | null;
  unverifiedReason?: string | null;
  onFollow?: (args: { prNumber: number; author: string }) => void;
}) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [shake, setShake] = useState(false);
  const resolved = resolveCitation(match, decisions);
  const url = resolved?.citation.url ?? buildFallbackUrl(match, decisions);

  const onClick = () => {
    if (match.prNumber && match.author && onFollow) {
      onFollow({ prNumber: match.prNumber, author: match.author });
    } else {
      setShake(true);
      setTimeout(() => setShake(false), 200);
    }
  };

  const base =
    "relative inline-block rounded-md border px-1.5 py-0 font-mono text-[10.5px] leading-[1.3rem] align-baseline transition-colors";
  const tone =
    verified === false
      ? "border-rose-700/70 bg-rose-950/40 text-rose-300"
      : verified === true
        ? "border-emerald-700/70 bg-emerald-950/40 text-emerald-300"
        : "border-zinc-700/70 bg-zinc-900 text-zinc-300 hover:border-[#d4a24c]/60 hover:text-zinc-100";

  const sourceType = resolved?.citation.source_type ?? "pr_body";
  const icon = SOURCE_ICON[sourceType] ?? "·";

  return (
    <motion.span
      className="relative inline-block"
      initial={reduced ? false : { opacity: 0, scale: 0.92 }}
      animate={shake && !reduced ? { x: [-2, 2, 0] } : { opacity: 1, scale: 1 }}
      transition={
        shake && !reduced
          ? { duration: 0.16 }
          : reduced
            ? { duration: 0 }
            : { duration: 0.18, ease: "easeOut" }
      }
    >
      {/* Verdict badge — a 10px glyph that slides in from the left when self-check completes. */}
      <AnimatePresence>
        {verified === true ? (
          <motion.span
            key="ok"
            aria-hidden
            initial={reduced ? false : { opacity: 0, x: -4, scale: 0.7 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: -4, scale: 0.7 }}
            transition={reduced ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
            className="mr-1 inline-block align-middle font-mono text-[10px] text-emerald-400"
          >
            ✓
          </motion.span>
        ) : verified === false ? (
          <motion.span
            key="no"
            aria-hidden
            initial={reduced ? false : { opacity: 0, x: -4, scale: 0.7 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: -4, scale: 0.7 }}
            transition={reduced ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
            className="mr-1 inline-block align-middle font-mono text-[10px] text-rose-400"
          >
            ✕
          </motion.span>
        ) : null}
      </AnimatePresence>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} ${tone}`}
        onClick={onClick}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {match.token}
      </a>
      <AnimatePresence>
        {open && resolved ? (
          <motion.span
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.96 }}
            transition={reduced ? { duration: 0 } : SPRING_TACTILE}
            className="absolute left-0 top-full z-20 mt-1 block w-[min(34rem,90vw)] rounded-lg border border-zinc-800 bg-zinc-950/95 p-3 text-left text-xs shadow-xl shadow-black/70 backdrop-blur-sm"
          >
            <span className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              <span className="mr-1 text-[#d4a24c]">{icon}</span>
              {resolved.citation.source_type.replaceAll("_", " ")}
              {resolved.citation.author ? ` · @${resolved.citation.author}` : ""}
              {resolved.citation.timestamp ? ` · ${resolved.citation.timestamp.slice(0, 10)}` : ""}
            </span>
            <blockquote className="mt-2 block border-l-2 border-[#d4a24c]/50 pl-3 font-sans text-[12px] italic leading-relaxed text-zinc-200">
              &ldquo;{resolved.citation.quote}&rdquo;
            </blockquote>
            <span className="mt-2 block text-[11px] text-zinc-500">
              On decision #{resolved.decision.pr_number}{" "}
              <span className="text-zinc-400">{resolved.decision.title}</span>
            </span>
            {verified === false && unverifiedReason ? (
              <span className="mt-2 block rounded-md border border-rose-800/60 bg-rose-950/30 p-2 font-mono text-[10px] text-rose-300">
                self-check: {unverifiedReason}
              </span>
            ) : null}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.span>
  );
}
