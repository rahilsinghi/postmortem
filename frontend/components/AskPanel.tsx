"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import type { Decision } from "../lib/api";
import {
  type QueryPhase,
  type SelfCheckResult,
  type StatsEvent,
  startQuery,
  type UsageEvent,
} from "../lib/query";
import { ReasoningTrace } from "./ReasoningTrace";

type Props = {
  repo: string;
  decisions: Decision[];
  suggestedQueries: string[];
};

export function AskPanel({ repo, decisions, suggestedQueries }: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<QueryPhase | "idle">("idle");
  const [stats, setStats] = useState<StatsEvent | null>(null);
  const [usage, setUsage] = useState<UsageEvent | null>(null);
  const [selfCheck, setSelfCheck] = useState<SelfCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selfCheckEnabled, setSelfCheckEnabled] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  const run = useCallback(
    (q: string) => {
      if (!q.trim()) return;
      esRef.current?.close();
      setAnswer("");
      setPhase("retrieving");
      setStats(null);
      setUsage(null);
      setSelfCheck(null);
      setError(null);
      esRef.current = startQuery(
        repo,
        q,
        {
          onPhase: setPhase,
          onStats: setStats,
          onDelta: (text) => setAnswer((prev) => prev + text),
          onSelfCheck: setSelfCheck,
          onUsage: setUsage,
          onError: setError,
        },
        { selfCheck: selfCheckEnabled },
      );
    },
    [repo, selfCheckEnabled],
  );

  const onSubmit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    run(question);
  };

  const busy = phase !== "idle" && phase !== "done";

  return (
    <div className="flex h-full flex-col">
      <form
        onSubmit={onSubmit}
        className="border-b border-zinc-800 bg-zinc-950/80 p-4 backdrop-blur"
      >
        <label htmlFor="q" className="sr-only">
          Ask Postmortem
        </label>
        <textarea
          id="q"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              run(question);
            }
          }}
          placeholder={`Ask why ${repo} is the way it is…   (⌘+Enter to submit)`}
          rows={2}
          className="w-full resize-none rounded-md border border-zinc-800 bg-black px-3 py-2 font-sans text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
            <input
              type="checkbox"
              checked={selfCheckEnabled}
              onChange={(e) => setSelfCheckEnabled(e.target.checked)}
              className="h-3 w-3 rounded border-zinc-700 bg-black accent-zinc-300"
            />
            self-check citations (+$1-2)
          </label>
          <button
            type="submit"
            disabled={busy || question.trim().length < 3}
            className="rounded-md border border-zinc-700 bg-zinc-100 px-3 py-1 font-mono text-xs text-black transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-zinc-300"
          >
            {busy ? "Thinking…" : "Ask"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestedQueries.map((q) => (
            <button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => {
                setQuestion(q);
                run(q);
              }}
              className="rounded-full border border-zinc-800 px-3 py-1 font-mono text-[11px] text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {q}
            </button>
          ))}
        </div>
      </form>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {phase !== "idle" ? <PhaseBadge phase={phase} stats={stats} /> : null}
        {error ? (
          <div className="mb-3 rounded-md border border-rose-800 bg-rose-950/40 p-3 font-mono text-xs text-rose-300">
            {error}
          </div>
        ) : null}
        {answer ? (
          <div className="mt-4">
            <ReasoningTrace text={answer} decisions={decisions} selfCheck={selfCheck} />
          </div>
        ) : phase === "idle" ? (
          <p className="mt-6 text-sm text-zinc-500">
            Pick a suggested query above or type your own. Opus 4.7 reads the full ledger in one
            pass and cites every claim back to a PR comment.
          </p>
        ) : null}

        {selfCheck ? (
          <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-400">
            <div className="mb-1 uppercase tracking-wider text-zinc-500">self-check</div>
            <div>
              verdict: <span className="text-zinc-200">{selfCheck.overall_verdict ?? "?"}</span>
              {typeof selfCheck.verified_count === "number" ? (
                <>
                  {" · "}verified {selfCheck.verified_count}/
                  {(selfCheck.verified_count ?? 0) + (selfCheck.unverified_count ?? 0)}
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {usage ? (
          <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[10.5px] text-zinc-500">
            <span>
              input {usage.input_tokens.toLocaleString()} · output{" "}
              {usage.output_tokens.toLocaleString()} · cache read{" "}
              {usage.cache_read_tokens.toLocaleString()} ·{" "}
              <span className="text-zinc-300">${usage.cost_usd.toFixed(4)}</span>
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PhaseBadge({ phase, stats }: { phase: QueryPhase | "idle"; stats: StatsEvent | null }) {
  const label =
    phase === "retrieving"
      ? "Loading ledger…"
      : phase === "reasoning"
        ? "Opus 4.7 is reasoning with citations…"
        : phase === "self_checking"
          ? "Verifying every citation against the ledger…"
          : phase === "done"
            ? stats
              ? `Reasoned across ${stats.decisions} decisions · ${stats.citations} citations · ${stats.edges} edges.`
              : "Done."
            : "";
  return (
    <div className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
  );
}
