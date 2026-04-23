"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

import type { Citation } from "../lib/api";
import { useReducedMotion } from "../lib/motion";

// Module-scope seen-set: on repeat-hover of the same chip within a session
// we skip the stagger so the card feels instant rather than sluggish. Cleared
// only by an explicit resetSeenSet() (e.g. repo switch) or a page reload.
const SEEN = new Set<string>();

export function hasBeenSeen(id: string): boolean {
  return SEEN.has(id);
}

export function markSeen(id: string): void {
  SEEN.add(id);
}

export function resetSeenSet(): void {
  SEEN.clear();
}

const SOURCE_GLYPH: Record<string, string> = {
  pr_body: "📄",
  pr_comment: "💬",
  inline_review_comment: "✏️",
  review_comment: "📝",
  commit_message: "🔀",
  issue: "🐛",
};

export type ProvenanceKind = "context" | "decision" | "forces" | "consequences";

type Props = {
  chipId: string;
  kind: ProvenanceKind;
  citation: Citation;
  verified?: boolean | null;
  relatedCount?: number;
  onRelatedClick?: () => void;
};

const KIND_TINT: Record<ProvenanceKind, string> = {
  decision: "text-[#d4a24c]",
  forces: "text-amber-300",
  consequences: "text-emerald-300",
  context: "text-zinc-400",
};

export function ProvenanceCard({
  chipId,
  kind,
  citation,
  verified,
  relatedCount = 0,
  onRelatedClick,
}: Props) {
  const reduced = useReducedMotion();
  // Capture the seen-state at mount time so the stagger decision is stable
  // across re-renders. The mark happens in an effect below so the *current*
  // render always animates on first hover, and subsequent hovers skip.
  const [skipStagger] = useState(() => hasBeenSeen(chipId));

  useEffect(() => {
    markSeen(chipId);
  }, [chipId]);

  const stagger = (i: number) =>
    reduced || skipStagger
      ? { duration: 0 }
      : { delay: i * 0.05, duration: 0.16, ease: "easeOut" as const };

  const fullQuote = citation.quote.trim();
  const firstChar = fullQuote.slice(0, 1);
  const restQuote = fullQuote.slice(1);
  const glyph = SOURCE_GLYPH[citation.source_type] ?? "•";
  const when = citation.timestamp ? new Date(citation.timestamp) : null;

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/95 p-4 text-xs shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
      <motion.blockquote
        initial={skipStagger || reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={stagger(0)}
        className="border-l-2 border-[#d4a24c]/60 pl-3 font-serif italic leading-relaxed text-zinc-100"
      >
        <span className={`mr-1 font-serif text-3xl font-bold leading-none ${KIND_TINT[kind]}`}>
          &ldquo;{firstChar}
        </span>
        {restQuote}&rdquo;
      </motion.blockquote>
      <motion.div
        initial={skipStagger || reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={stagger(1)}
        className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400"
      >
        <span className={KIND_TINT[kind]}>{glyph}</span>
        <span>{citation.source_type.replaceAll("_", " ")}</span>
        {citation.author ? <span>· @{citation.author}</span> : null}
        {when ? (
          <span className="text-zinc-500">
            ·{" "}
            {when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        ) : null}
        {verified === true ? <span className="text-emerald-400">✓ verified</span> : null}
        {verified === false ? <span className="text-rose-400">✕ unverified</span> : null}
      </motion.div>
      {relatedCount > 0 ? (
        <motion.button
          type="button"
          onClick={onRelatedClick}
          initial={skipStagger || reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(2)}
          className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition hover:text-[#d4a24c]"
        >
          {relatedCount} other claims cite this thread →
        </motion.button>
      ) : null}
      <a
        href={citation.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block font-mono text-[10px] text-zinc-500 transition hover:text-[#d4a24c]"
      >
        ↗ open on GitHub
      </a>
    </div>
  );
}
