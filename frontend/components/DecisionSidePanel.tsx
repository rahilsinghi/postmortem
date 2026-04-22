"use client";

import type { Decision } from "../lib/api";
import { CategoryBadge } from "./CategoryBadge";

export function DecisionSidePanel({ decision }: { decision: Decision | null }) {
  if (!decision) {
    return (
      <div className="flex h-full flex-col items-start justify-start p-6">
        <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
          Select a decision
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Click any node in the graph to inspect its rationale, rejected alternatives, and adjacent
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
      <h2 className="mt-2 text-base font-medium text-zinc-100">{decision.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-zinc-300">{decision.summary}</p>
      <a
        href={decision.pr_url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block font-mono text-[11px] text-zinc-400 underline decoration-zinc-700 underline-offset-4 hover:text-zinc-100"
      >
        Open on GitHub ↗
      </a>

      {allCitations.length > 0 ? (
        <section className="mt-5">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Citations ({allCitations.length})
          </h3>
          <ul className="mt-3 space-y-3">
            {allCitations.map((c) => (
              <li
                key={`${c.kind}-${c.source_id}-${c.source_type}-${c.claim.slice(0, 60)}`}
                className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs"
              >
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  <span>{c.kind}</span>
                  <span>
                    {c.source_type.replaceAll("_", " ")}
                    {c.author ? ` · @${c.author}` : ""}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-zinc-200">{c.claim}</p>
                <blockquote className="mt-2 border-l-2 border-zinc-700 pl-3 italic text-zinc-300">
                  &ldquo;{c.quote}&rdquo;
                </blockquote>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block font-mono text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  ↗ link
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {decision.alternatives.length > 0 ? (
        <section className="mt-5">
          <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
            Rejected alternatives ({decision.alternatives.length})
          </h3>
          <ul className="mt-3 space-y-3">
            {decision.alternatives.map((alt) => (
              <li
                key={`alt-${alt.source_id}-${alt.name}-${alt.rejection_reason.slice(0, 60)}`}
                className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs"
              >
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  <span>alternative</span>
                  <span>conf {alt.confidence.toFixed(2)}</span>
                </div>
                <p className="mt-1 text-[13px] font-medium text-zinc-100">{alt.name}</p>
                <p className="mt-1 text-zinc-300">{alt.rejection_reason}</p>
                {alt.rejection_reason_quoted ? (
                  <blockquote className="mt-2 border-l-2 border-zinc-700 pl-3 italic text-zinc-300">
                    &ldquo;{alt.rejection_reason_quoted}&rdquo;
                  </blockquote>
                ) : null}
                <a
                  href={alt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block font-mono text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  ↗ link
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
