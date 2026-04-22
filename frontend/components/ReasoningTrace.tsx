"use client";

import { motion } from "framer-motion";

import type { Decision } from "../lib/api";
import { splitWithCitations } from "../lib/citations";
import { useReducedMotion } from "../lib/motion";
import type { SelfCheckResult } from "../lib/query";
import { CitationChip } from "./CitationChip";

/**
 * Word-boundary trim: while the stream is live, clip the rendered text at the
 * last whitespace so incomplete words don't flicker in character-by-character.
 * When the stream completes (`streaming=false`), render the full text.
 */
function trimToWordBoundary(text: string): string {
  if (!text) return text;
  const terminators = [" ", "\n", "\t", ".", ",", ";", ":", "]", ")", "—", "-", "!"];
  let cutoff = -1;
  for (const t of terminators) {
    const idx = text.lastIndexOf(t);
    if (idx > cutoff) cutoff = idx;
  }
  if (cutoff < 0) return "";
  return text.slice(0, cutoff + 1);
}

export function ReasoningTrace({
  text,
  decisions,
  selfCheck,
  streaming = false,
}: {
  text: string;
  decisions: Decision[];
  selfCheck: SelfCheckResult | null;
  streaming?: boolean;
}) {
  const reduced = useReducedMotion();
  if (!text) return null;

  const rendered = streaming ? trimToWordBoundary(text) : text;
  const showCursor = streaming && rendered.length > 0;

  const { segments } = splitWithCitations(rendered);

  const verdictByToken = new Map<string, { verified: boolean; reason: string }>();
  if (selfCheck?.citations) {
    for (const entry of selfCheck.citations) {
      verdictByToken.set(entry.token, { verified: entry.verified, reason: entry.reason });
    }
  }

  const rawSections = rendered.split(/\n##\s+/g);
  const preamble = rendered.startsWith("## ") ? "" : (rawSections.shift() ?? "");
  const sections = (
    rendered.startsWith("## ")
      ? rendered
          .slice(3)
          .split(/\n##\s+/g)
          .map((block) => ({
            heading: block.split("\n")[0],
            body: block.slice(block.split("\n")[0].length),
          }))
      : rawSections.map((block) => ({
          heading: block.split("\n")[0],
          body: block.slice(block.split("\n")[0].length),
        }))
  ).filter((s) => s.heading.trim().length > 0);

  if (sections.length === 0) {
    return (
      <RenderSegments
        segments={segments}
        decisions={decisions}
        verdict={verdictByToken}
        trailingCursor={showCursor}
      />
    );
  }

  return (
    <div className="space-y-5">
      {preamble.trim() ? (
        <RenderSegments
          segments={splitWithCitations(preamble).segments}
          decisions={decisions}
          verdict={verdictByToken}
        />
      ) : null}
      {sections.map((sec, idx) => {
        const isLast = idx === sections.length - 1;
        const transition = reduced
          ? { duration: 0 }
          : { duration: 0.32, ease: [0.25, 1, 0.5, 1] as const };
        return (
          <motion.section
            key={`sec-${sec.heading}`}
            layout
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={transition}
          >
            <h3 className="mb-2 flex items-center gap-2 border-b border-zinc-800/70 pb-1 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
              <span className="text-[#d4a24c]">⊢</span>
              <span>{sec.heading}</span>
            </h3>
            <div className="space-y-2 text-[13px] leading-relaxed text-zinc-200">
              <RenderSegments
                segments={splitWithCitations(sec.body).segments}
                decisions={decisions}
                verdict={verdictByToken}
                trailingCursor={showCursor && isLast}
              />
            </div>
          </motion.section>
        );
      })}
    </div>
  );
}

/** Block cursor: fades between accent and white while waiting for the next token. */
function TypingCursor() {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className="ml-0.5 inline-block h-[1.1em] w-[0.5em] -translate-y-[1px] rounded-[1px] align-middle"
      style={{ backgroundColor: "#d4a24c" }}
      animate={
        reduced
          ? {}
          : {
              backgroundColor: ["#d4a24c", "#fafafa", "#d4a24c"],
              opacity: [0.9, 1, 0.9],
            }
      }
      transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function RenderSegments({
  segments,
  decisions,
  verdict,
  trailingCursor = false,
}: {
  segments: ReturnType<typeof splitWithCitations>["segments"];
  decisions: Decision[];
  verdict: Map<string, { verified: boolean; reason: string }>;
  trailingCursor?: boolean;
}) {
  return (
    <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-200">
      {segments.map((seg, idx) => {
        if (seg.kind === "text") {
          // biome-ignore lint/suspicious/noArrayIndexKey: position-based key is correct here
          return <span key={`t-${idx}`}>{seg.content}</span>;
        }
        const v = verdict.get(seg.content);
        const citation = seg.citation;
        if (!citation) return null;
        return (
          <CitationChip
            // biome-ignore lint/suspicious/noArrayIndexKey: position-based key is correct here
            key={`c-${idx}`}
            match={citation}
            decisions={decisions}
            verified={v?.verified ?? null}
            unverifiedReason={v?.reason ?? null}
          />
        );
      })}
      {trailingCursor ? <TypingCursor /> : null}
    </div>
  );
}
