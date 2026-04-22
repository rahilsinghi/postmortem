"use client";

import { useState } from "react";

import type { Decision } from "../lib/api";
import { type CitationMatch, resolveCitation } from "../lib/citations";

function buildFallbackUrl(match: CitationMatch, decisions: Decision[]): string {
  const decision = decisions.find((d) => d.pr_number === match.prNumber);
  if (decision) return decision.pr_url;
  return "#";
}

export function CitationChip({
  match,
  decisions,
  verified,
  unverifiedReason,
}: {
  match: CitationMatch;
  decisions: Decision[];
  verified?: boolean | null;
  unverifiedReason?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const resolved = resolveCitation(match, decisions);
  const url = resolved?.citation.url ?? buildFallbackUrl(match, decisions);

  const base =
    "relative inline-block rounded-md border px-1.5 py-0 font-mono text-[10.5px] leading-[1.3rem] align-baseline transition";
  const tone =
    verified === false
      ? "border-rose-700/70 bg-rose-950/40 text-rose-300"
      : verified === true
        ? "border-emerald-800/70 bg-emerald-950/40 text-emerald-300"
        : "border-zinc-700/70 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100";

  return (
    <span className="relative inline-block">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} ${tone}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {match.token}
      </a>
      {open && resolved ? (
        <span className="absolute left-0 top-full z-20 mt-1 block w-[min(34rem,90vw)] rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-left text-xs shadow-xl shadow-black/70">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-zinc-500">
            {resolved.citation.source_type.replaceAll("_", " ")}
            {resolved.citation.author ? ` · @${resolved.citation.author}` : ""}
            {resolved.citation.timestamp ? ` · ${resolved.citation.timestamp.slice(0, 10)}` : ""}
          </span>
          <blockquote className="mt-2 block border-l-2 border-zinc-700 pl-3 font-sans text-[12px] italic leading-relaxed text-zinc-200">
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
        </span>
      ) : null}
    </span>
  );
}
