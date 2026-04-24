"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { type Conflict, type ConflictReport, fetchConflicts } from "../lib/conflicts";
import { useDemo } from "../lib/demo/DemoProvider";
import { useReducedMotion } from "../lib/motion";

/**
 * Conflict Finder modal — lists Opus-detected pairs of decisions that
 * quietly contradict each other. First open for a repo triggers a full
 * ledger scan (~8–14s); later opens are instant DuckDB cache hits.
 *
 * Each card renders both decision sides side-by-side with verbatim
 * quotes, the model-written contradiction sentence, and (when the
 * ledger supports it) a suggested resolution. Severity colours the
 * header strip so judges can skim high-severity items first.
 */
export function ConflictFinderPanel({
  open,
  repo,
  onClose,
}: {
  open: boolean;
  repo: string;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const { isDemo } = useDemo();
  const [report, setReport] = useState<ConflictReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (report && report.repo === repo) return;
    setError(null);
    setLoading(true);
    // In demo mode, replay the captured conflicts fixture so playback has
    // zero API cost and is identical on every run. The real endpoint runs
    // unchanged outside the demo.
    const loader = isDemo
      ? fetch("/demo/hono-conflicts.json", { cache: "no-store" })
          .then((r) => r.json() as Promise<ConflictReport>)
      : fetchConflicts(repo);
    loader
      .then((r) => {
        setReport(r);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, [open, repo, report, isDemo]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-label="conflicts in this ledger"
            initial={reduced ? false : { scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex max-h-[88vh] w-[840px] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-rose-500/40 bg-zinc-950 shadow-[0_0_60px_rgba(244,63,94,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex shrink-0 items-center gap-3 border-b border-zinc-900 px-4 py-3">
              <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-rose-300">
                ⚠ conflict finder
              </span>
              <span className="font-mono text-[11px] text-zinc-500">· {repo}</span>
              {report ? (
                <span className="font-mono text-[10px] text-zinc-500">
                  · {report.conflicts.length}{" "}
                  {report.conflicts.length === 1 ? "conflict" : "conflicts"}
                  {report.cached ? " · cached" : " · fresh scan"}
                </span>
              ) : null}
              <button
                type="button"
                data-demo-target="conflict-finder-close"
                className="ml-auto font-mono text-[11px] text-zinc-500 hover:text-zinc-200"
                onClick={onClose}
              >
                esc
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {loading ? (
                <div className="flex items-center gap-3 px-2 py-6 font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-rose-400" />
                  scanning ledger for contradictions…
                </div>
              ) : null}
              {error ? (
                <div className="rounded-md border border-rose-500/40 bg-rose-950/20 px-3 py-2 text-[12px] text-rose-300">
                  conflict scan failed · {error}
                </div>
              ) : null}
              {report && report.conflicts.length === 0 && !loading ? (
                <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-6 text-center font-mono text-[11px] uppercase tracking-wider text-zinc-500">
                  no contradictions surfaced — the ledger reads as consistent
                </div>
              ) : null}
              <div className="space-y-3">
                {report?.conflicts.map((c) => (
                  <ConflictCard key={c.id} conflict={c} />
                ))}
              </div>
            </div>

            {report ? (
              <footer className="shrink-0 border-t border-zinc-900 px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                {report.cached
                  ? `cached ${new Date(report.generated_at).toLocaleString()}`
                  : `fresh · ${report.token_usage.input_tokens.toLocaleString()} in · ${report.token_usage.output_tokens.toLocaleString()} out`}{" "}
                · {report.model}
              </footer>
            ) : null}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

const SEVERITY_PALETTE: Record<
  Conflict["severity"],
  { border: string; bg: string; pill: string; dot: string; label: string }
> = {
  high: {
    border: "border-rose-500/40",
    bg: "bg-rose-950/20",
    pill: "border-rose-500/40 bg-rose-950/30 text-rose-200",
    dot: "bg-rose-500",
    label: "high",
  },
  medium: {
    border: "border-amber-500/40",
    bg: "bg-amber-950/20",
    pill: "border-amber-500/40 bg-amber-950/30 text-amber-200",
    dot: "bg-amber-500",
    label: "medium",
  },
  low: {
    border: "border-zinc-600/50",
    bg: "bg-zinc-900/40",
    pill: "border-zinc-600/50 bg-zinc-800/60 text-zinc-300",
    dot: "bg-zinc-500",
    label: "low",
  },
};

function ConflictCard({ conflict }: { conflict: Conflict }) {
  const palette = SEVERITY_PALETTE[conflict.severity] ?? SEVERITY_PALETTE.low;
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`overflow-hidden rounded-xl border ${palette.border} ${palette.bg}`}
    >
      <header className="flex items-baseline gap-3 border-b border-white/5 px-4 py-2.5">
        <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${palette.dot}`} />
        <h4 className="flex-1 text-[13px] font-semibold tracking-tight text-zinc-50">
          {conflict.title}
        </h4>
        <span
          className={`rounded-full border px-2 py-[1px] font-mono text-[9px] uppercase tracking-wider ${palette.pill}`}
        >
          {palette.label}
        </span>
      </header>

      <div className="grid grid-cols-1 gap-0 md:grid-cols-2">
        <ConflictSideCard side={conflict.decision_a} label="A" />
        <div className="border-t border-white/5 md:border-l md:border-t-0">
          <ConflictSideCard side={conflict.decision_b} label="B" />
        </div>
      </div>

      <div className="border-t border-white/5 bg-black/30 px-4 py-2.5">
        <div className="flex items-baseline gap-2 font-mono text-[10px] uppercase tracking-wider text-rose-300/80">
          <span>⟷ contradiction</span>
        </div>
        <p className="mt-1 text-[13px] leading-relaxed text-zinc-100">
          {conflict.contradiction}
        </p>
        {conflict.resolution_hint ? (
          <p className="mt-2 border-t border-white/5 pt-2 font-mono text-[11px] italic text-zinc-400">
            ↪ {conflict.resolution_hint}
          </p>
        ) : null}
      </div>
    </motion.article>
  );
}

function ConflictSideCard({
  side,
  label,
}: {
  side: Conflict["decision_a"];
  label: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className="rounded border border-zinc-700 bg-zinc-800/60 px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wider text-zinc-300">
          {label}
        </span>
        <a
          href={`https://github.com/search?q=${encodeURIComponent(`#${side.pr_number}`)}&type=pullrequests`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[10px] text-[#d4a24c] hover:underline"
        >
          PR #{side.pr_number}
        </a>
      </div>
      <div className="mt-1 text-[13px] font-medium text-zinc-50">{side.title}</div>
      <p className="mt-1 text-[12px] leading-relaxed text-zinc-300">{side.position}</p>
      {side.quote ? (
        <blockquote className="mt-2 rounded-md border-l-2 border-[#d4a24c]/60 bg-zinc-900/40 py-1.5 pl-2 pr-2 font-mono text-[11px] italic leading-relaxed text-zinc-100">
          &ldquo;{side.quote}&rdquo;
        </blockquote>
      ) : null}
      <div className="mt-1 font-mono text-[10px] text-zinc-500">{side.citation}</div>
    </div>
  );
}
