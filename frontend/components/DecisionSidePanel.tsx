"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useState } from "react";

import type { Citation, Decision } from "../lib/api";
import { useReducedMotion } from "../lib/motion";
import { CategoryBadge } from "./CategoryBadge";
import { InterviewButton } from "./InterviewButton";

const KIND_LABEL: Record<string, string> = {
  context: "context",
  decision: "decision",
  forces: "forces",
  consequences: "consequences",
};

const KIND_ACCENT: Record<string, string> = {
  context: "text-zinc-400",
  decision: "text-[#d4a24c]",
  forces: "text-amber-300",
  consequences: "text-emerald-300",
};

export function DecisionSidePanel({ decision }: { decision: Decision | null }) {
  if (!decision) {
    return (
      <div className="flex h-full flex-col items-start justify-start gap-3 p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          Select a decision
        </p>
        <svg
          role="img"
          aria-label="decision graph illustration"
          viewBox="0 0 120 60"
          className="my-3 h-14 w-28 text-zinc-800"
          fill="none"
        >
          <title>Select a decision from the graph</title>
          <circle cx="10" cy="10" r="5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="60" cy="30" r="5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="110" cy="10" r="5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="30" cy="50" r="5" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="90" cy="50" r="5" stroke="currentColor" strokeWidth="1.5" />
          <line
            x1="15"
            y1="12"
            x2="55"
            y2="28"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
          <line
            x1="65"
            y1="30"
            x2="105"
            y2="12"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
          <line
            x1="30"
            y1="45"
            x2="55"
            y2="32"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
          <line
            x1="90"
            y1="45"
            x2="65"
            y2="32"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        </svg>
        <p className="max-w-[28ch] text-sm leading-relaxed text-zinc-400">
          Click any node in the graph to exhume its rationale, rejected alternatives, and adjacent
          decisions.
        </p>
      </div>
    );
  }

  const allCitations = [
    ...decision.citations.context.map((c) => ({ kind: "context", ...c })),
    ...decision.citations.decision.map((c) => ({ kind: "decision", ...c })),
    ...decision.citations.forces.map((c) => ({ kind: "forces", ...c })),
    ...decision.citations.consequences.map((c) => ({ kind: "consequences", ...c })),
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      <div className="flex items-center gap-2">
        <CategoryBadge category={decision.category} />
        <span className="font-mono text-[11px] text-zinc-500">
          PR #{decision.pr_number} · conf {decision.confidence.toFixed(2)}
        </span>
      </div>
      <h2 className="mt-2 text-base font-medium leading-snug text-zinc-100">{decision.title}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-zinc-300">{decision.summary}</p>
      <a
        href={decision.pr_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400 underline decoration-zinc-700 underline-offset-4 transition hover:text-[#d4a24c] hover:decoration-[#d4a24c]/60"
      >
        Open on GitHub ↗
      </a>
      <DeciderInterview deciders={decision.decided_by} />

      {/* ALTERNATIVES FIRST — the unique value prop, gets an amber left rail. */}
      {decision.alternatives.length > 0 ? (
        <section className="mt-6 border-l-2 border-[#d4a24c]/40 pl-4">
          <h3 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em]">
            <span className="text-[#d4a24c]">⊗</span>
            <span className="text-zinc-400">
              Rejected alternatives
              <span className="ml-1 text-zinc-600">({decision.alternatives.length})</span>
            </span>
          </h3>
          <p className="mt-1 font-mono text-[10px] leading-relaxed text-zinc-500">
            The roads not taken — usually the most valuable content in the ledger.
          </p>
          <ul className="mt-3 space-y-3">
            {decision.alternatives.map((alt) => (
              <li
                key={`alt-${alt.source_id}-${alt.name}-${alt.rejection_reason.slice(0, 60)}`}
                className="rounded-md border border-zinc-800 bg-zinc-950/70 p-3 text-xs"
              >
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  <span className="font-mono text-[#d4a24c]/80">rejected</span>
                  <span>conf {alt.confidence.toFixed(2)}</span>
                </div>
                <p className="mt-1 text-[13px] font-medium leading-snug text-zinc-100 line-through decoration-[#d4a24c]/60 decoration-[1.5px]">
                  {alt.name}
                </p>
                <p className="mt-2 text-zinc-300">{alt.rejection_reason}</p>
                {alt.rejection_reason_quoted ? (
                  <blockquote className="mt-2 border-l-2 border-[#d4a24c]/40 pl-3 font-sans italic leading-relaxed text-zinc-300">
                    &ldquo;{alt.rejection_reason_quoted}&rdquo;
                  </blockquote>
                ) : null}
                <a
                  href={alt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block font-mono text-[10px] text-zinc-500 transition hover:text-[#d4a24c]"
                >
                  ↗ {alt.source_type.replaceAll("_", " ")}
                  {alt.author ? ` · @${alt.author}` : ""}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {allCitations.length > 0 ? (
        <section className="mt-6">
          <h3 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">
            <span className="text-zinc-500">◇</span>
            <span>
              Citations
              <span className="ml-1 text-zinc-600">({allCitations.length})</span>
            </span>
          </h3>
          <ul className="mt-3 space-y-2">
            {allCitations.map((c) => (
              <CitationCard
                key={`${c.kind}-${c.source_id}-${c.source_type}-${c.claim.slice(0, 60)}`}
                kind={c.kind}
                citation={c}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CitationCard({ kind, citation }: { kind: string; citation: Citation }) {
  const reduced = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const kindClass = KIND_ACCENT[kind] ?? "text-zinc-400";
  const kindLabel = KIND_LABEL[kind] ?? kind;
  return (
    <li className="overflow-hidden rounded-md border border-zinc-800 bg-zinc-950">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-zinc-900/60"
      >
        <span
          className={`mt-0.5 font-mono text-[10px] uppercase tracking-wider ${kindClass}`}
          style={{ minWidth: 66, maxWidth: 66 }}
        >
          {kindLabel}
        </span>
        <p className="flex-1 text-[13px] leading-relaxed text-zinc-200">{citation.claim}</p>
        <span
          aria-hidden
          className={`mt-0.5 font-mono text-[10px] text-zinc-600 transition ${expanded ? "rotate-90 text-[#d4a24c]" : ""}`}
        >
          ›
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={reduced ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }}
            className="overflow-hidden border-t border-zinc-800 bg-zinc-950/80 px-3 pb-3"
          >
            <div className="pt-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              {citation.source_type.replaceAll("_", " ")}
              {citation.author ? ` · @${citation.author}` : ""}
              {citation.timestamp ? ` · ${citation.timestamp.slice(0, 10)}` : ""}
            </div>
            <blockquote className="mt-2 border-l-2 border-[#d4a24c]/40 pl-3 font-sans text-xs italic leading-relaxed text-zinc-300">
              &ldquo;{citation.quote}&rdquo;
            </blockquote>
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block font-mono text-[10px] text-zinc-500 transition hover:text-[#d4a24c]"
            >
              ↗ open source on GitHub
            </a>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

function DeciderInterview({ deciders }: { deciders: string[] }) {
  const pathname = usePathname() ?? "";
  const m = /\/ledger\/([^/]+)\/([^/?#]+)/.exec(pathname);
  const owner = m?.[1] ?? "";
  const repo = m?.[2] ?? "";
  const author = deciders[0];
  if (!author || !owner || !repo) return null;
  return (
    <div className="mt-2 border-t border-zinc-900 pt-2">
      <InterviewButton variant="node" owner={owner} repo={repo} author={author} />
    </div>
  );
}
