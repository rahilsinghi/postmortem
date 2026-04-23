"use client";

import { AnimatePresence, motion } from "framer-motion";
import { type MouseEvent, useMemo, useState } from "react";

import type { Citation, Decision } from "../lib/api";
import { type CitationMatch, resolveCitation } from "../lib/citations";
import { useReducedMotion } from "../lib/motion";
import { ProvenanceCard, type ProvenanceKind } from "./ProvenanceCard";

function buildFallbackUrl(match: CitationMatch, decisions: Decision[]): string {
  const decision = decisions.find((d) => d.pr_number === match.prNumber);
  if (decision) return decision.pr_url;
  return "#";
}

/**
 * Identify which rationale bucket the resolved citation came from so the
 * hover card can paint the correct kind accent (amber/amber-300/emerald/zinc).
 */
function resolveKind(decision: Decision, citation: Citation): ProvenanceKind {
  if (decision.citations.decision.includes(citation)) return "decision";
  if (decision.citations.forces.includes(citation)) return "forces";
  if (decision.citations.consequences.includes(citation)) return "consequences";
  return "context";
}

/**
 * Count citations across the entire loaded ledger that share the resolved
 * citation's source_id (i.e., reference the same inline-review-comment,
 * PR body, or commit). Excludes the citation itself. Pure-local, no fetches.
 */
function countRelated(decisions: Decision[], citation: Citation): number {
  let total = 0;
  for (const d of decisions) {
    const bucket = [
      ...d.citations.context,
      ...d.citations.decision,
      ...d.citations.forces,
      ...d.citations.consequences,
    ];
    for (const c of bucket) {
      if (c === citation) continue;
      if (c.source_id && c.source_id === citation.source_id) total += 1;
    }
  }
  return total;
}

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

  const chipId = useMemo(
    () =>
      [
        match.prNumber ?? match.commitSha ?? "x",
        match.author,
        match.dateIso ?? "x",
        match.kind,
      ].join("::"),
    [match.prNumber, match.commitSha, match.author, match.dateIso, match.kind],
  );

  const resolvedKind: ProvenanceKind = useMemo(
    () => (resolved ? resolveKind(resolved.decision, resolved.citation) : "context"),
    [resolved],
  );
  const relatedCount = useMemo(
    () => (resolved ? countRelated(decisions, resolved.citation) : 0),
    [resolved, decisions],
  );

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!onFollow) return; // no interactive feature wired; let the anchor navigate
    e.preventDefault();
    if (match.prNumber && match.author) {
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

  return (
    <motion.span
      className="relative inline-block"
      initial={reduced ? false : { opacity: 0, scale: 0.92 }}
      animate={
        shake && !reduced ? { x: [-2, 2, 0], opacity: 1, scale: 1 } : { opacity: 1, scale: 1 }
      }
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
            key={chipId}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={reduced ? { duration: 0 } : { duration: 0.14, ease: "easeOut" }}
            className="absolute left-0 top-full z-20 mt-1 block w-[min(34rem,90vw)]"
          >
            <ProvenanceCard
              chipId={chipId}
              kind={resolvedKind}
              citation={resolved.citation}
              verified={verified ?? null}
              relatedCount={relatedCount}
            />
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
