"use client";

import { AnimatePresence, motion } from "framer-motion";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import type { Decision } from "../lib/api";
import { parseCitations } from "../lib/citations";
import { fadeSlideItem, staggerContainer, useReducedMotion } from "../lib/motion";
import {
  type QueryPhase,
  type SelfCheckResult,
  type StatsEvent,
  startQuery,
  type UsageEvent,
} from "../lib/query";
import { CountUp } from "./CountUp";
import { ReasoningTrace } from "./ReasoningTrace";
import { ReasoningXRay, type TraceStep } from "./ReasoningXRay";

// Query engine's upper bound for a single answer. Mirrors QUERY_MAX_TOKENS
// on the backend — used as the scan-line denominator so the progress bar
// reaches 100% when the stream finishes a full-length answer.
const REASONING_MAX_TOKENS = 4096;

type Props = {
  repo: string;
  decisions: Decision[];
  suggestedQueries: string[];
  selectedDecision?: Decision | null;
  onSubgraph?: (anchorPr: number, prs: number[]) => void;
  onFollow?: (args: { prNumber: number; author: string }) => void;
};

export function AskPanel({
  repo,
  decisions,
  suggestedQueries,
  selectedDecision,
  onSubgraph,
  onFollow,
}: Props) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [phase, setPhase] = useState<QueryPhase | "idle">("idle");
  const [stats, setStats] = useState<StatsEvent | null>(null);
  const [usage, setUsage] = useState<UsageEvent | null>(null);
  const [selfCheck, setSelfCheck] = useState<SelfCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selfCheckEnabled, setSelfCheckEnabled] = useState(false);
  const [mode, setMode] = useState<"query" | "impact">("query");
  const [xraySteps, setXraySteps] = useState<TraceStep[]>([]);
  const [outputTokens, setOutputTokens] = useState(0);
  const reduced = useReducedMotion();
  const esRef = useRef<EventSource | null>(null);
  const streamStartRef = useRef<number>(0);
  const seenCitationsRef = useRef<Set<string>>(new Set());
  // Running token estimate during the stream — 1 token ≈ 4 chars is a rough
  // industry heuristic that's good enough to drive a scan-line. Reset per run.
  const streamedCharsRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  const pushStep = useCallback((kind: TraceStep["kind"], text: string) => {
    const ts = performance.now() - streamStartRef.current;
    setXraySteps((prev) => [...prev, { id: `${kind}-${prev.length}`, timestamp: ts, kind, text }]);
  }, []);

  const run = useCallback(
    (q: string, runMode: "query" | "impact" = mode) => {
      if (!q.trim()) return;
      esRef.current?.close();
      setAnswer("");
      setPhase("retrieving");
      setStats(null);
      setUsage(null);
      setSelfCheck(null);
      setError(null);
      setXraySteps([]);
      setOutputTokens(0);
      streamStartRef.current = performance.now();
      seenCitationsRef.current.clear();
      streamedCharsRef.current = 0;
      esRef.current = startQuery(
        repo,
        q,
        {
          onPhase: (p) => {
            setPhase(p);
            pushStep("phase", p.replaceAll("_", " "));
          },
          onStats: setStats,
          onDelta: (text) => {
            setAnswer((prev) => prev + text);
            // Rough running token estimate so the scan-line moves during the
            // stream (the real output_tokens count only arrives in `usage`).
            streamedCharsRef.current += text.length;
            setOutputTokens(Math.floor(streamedCharsRef.current / 4));
            // Synthesize a "resolved citation" trace step the first time each
            // unique citation token appears in the stream. `decisions` gives
            // us the human-readable title to pair with the PR number.
            const matches = parseCitations(text);
            for (const m of matches) {
              if (seenCitationsRef.current.has(m.token)) continue;
              seenCitationsRef.current.add(m.token);
              if (!m.prNumber) continue;
              const title = decisions.find((d) => d.pr_number === m.prNumber)?.title;
              const suffix = title ? ` · ${title.slice(0, 48)}` : "";
              pushStep("citation", `resolved citation → PR #${m.prNumber}${suffix}`);
            }
          },
          onSelfCheck: setSelfCheck,
          onUsage: (u) => {
            setUsage(u);
            setOutputTokens(u.output_tokens);
          },
          onError: setError,
          onSubgraph: (sub) => onSubgraph?.(sub.anchor_pr, sub.included_prs),
          onThought: (t) => pushStep("thought", t.label),
        },
        {
          selfCheck: selfCheckEnabled,
          mode: runMode,
          anchorPr: runMode === "impact" && selectedDecision ? selectedDecision.pr_number : null,
        },
      );
    },
    [repo, selfCheckEnabled, mode, selectedDecision, onSubgraph, decisions, pushStep],
  );

  const canRunImpact = selectedDecision !== null && selectedDecision !== undefined;

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
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 font-mono text-[11px] text-zinc-500">
              <input
                type="checkbox"
                checked={selfCheckEnabled}
                onChange={(e) => setSelfCheckEnabled(e.target.checked)}
                className="h-3 w-3 rounded border-zinc-700 bg-black accent-zinc-300"
              />
              self-check
            </label>
            <div className="flex overflow-hidden rounded-md border border-zinc-800 font-mono text-[11px]">
              <button
                type="button"
                onClick={() => setMode("query")}
                className={`px-2 py-1 transition ${
                  mode === "query"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                query
              </button>
              <button
                type="button"
                onClick={() => setMode("impact")}
                disabled={!canRunImpact}
                className={`px-2 py-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  mode === "impact"
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-200"
                }`}
                title={
                  canRunImpact
                    ? `Impact ripple anchored at PR #${selectedDecision?.pr_number}`
                    : "Click a decision in the graph first to anchor an impact query"
                }
              >
                impact ripple
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={busy || question.trim().length < 3 || (mode === "impact" && !canRunImpact)}
            className="rounded-md border border-zinc-700 bg-zinc-100 px-3 py-1 font-mono text-xs text-black transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-zinc-300"
          >
            {busy ? "Thinking…" : mode === "impact" ? "Ripple" : "Ask"}
          </button>
        </div>
        {mode === "impact" && selectedDecision ? (
          <p className="mt-2 font-mono text-[10px] text-zinc-500">
            anchored at PR #{selectedDecision.pr_number} · {selectedDecision.title.slice(0, 70)}
            {selectedDecision.title.length > 70 ? "…" : ""}
          </p>
        ) : null}
        <motion.div
          key={repo}
          className="mt-3 flex flex-wrap gap-2"
          initial="hidden"
          animate="show"
          variants={staggerContainer(reduced, 0.06, 0.1)}
        >
          {suggestedQueries.map((q) => (
            <motion.button
              key={q}
              type="button"
              disabled={busy}
              onClick={() => {
                setQuestion(q);
                run(q);
              }}
              variants={fadeSlideItem(reduced, 4, 0.22)}
              className="rounded-full border border-zinc-800 px-3 py-1 font-mono text-[11px] text-zinc-400 transition hover:border-[#d4a24c]/50 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {q}
            </motion.button>
          ))}
        </motion.div>
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
            <ReasoningTrace
              text={answer}
              decisions={decisions}
              selfCheck={selfCheck}
              streaming={busy}
              onFollow={onFollow}
            />
          </div>
        ) : phase === "idle" ? (
          <p className="mt-6 text-sm text-zinc-500">
            Pick a suggested query above or type your own. Opus 4.7 reads the full ledger in one
            pass and cites every claim back to a PR comment.
          </p>
        ) : null}

        <ReasoningXRay
          steps={xraySteps}
          outputTokens={outputTokens}
          maxTokens={REASONING_MAX_TOKENS}
          done={phase === "done"}
        />

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
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.25 }}
            className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 font-mono text-[11px] text-zinc-500"
          >
            <span>
              input {usage.input_tokens.toLocaleString()} · output{" "}
              {usage.output_tokens.toLocaleString()} · cache read{" "}
              {usage.cache_read_tokens.toLocaleString()} ·{" "}
              <span className="tabular-nums text-[#d4a24c]">
                <CountUp value={usage.cost_usd} decimals={4} prefix="$" duration={0.45} />
              </span>
            </span>
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}

function PhaseBadge({ phase, stats }: { phase: QueryPhase | "idle"; stats: StatsEvent | null }) {
  const reduced = useReducedMotion();
  const doneLabel = (() => {
    if (!stats) return "Done.";
    if (stats.subgraph_decisions !== undefined) {
      return `Traced ${stats.subgraph_decisions} decisions / ${stats.subgraph_edges ?? 0} edges downstream of PR #${stats.anchor_pr}.`;
    }
    return `Reasoned across ${stats.decisions ?? 0} decisions · ${stats.citations ?? 0} citations · ${stats.edges ?? 0} edges.`;
  })();
  const label =
    phase === "retrieving"
      ? "Loading ledger…"
      : phase === "subgraph"
        ? "Tracing impact subgraph…"
        : phase === "reasoning"
          ? "Opus 4.7 is reasoning with citations…"
          : phase === "self_checking"
            ? "Verifying every citation against the ledger…"
            : phase === "done"
              ? doneLabel
              : "";
  return (
    <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-zinc-500">
      {phase !== "done" && phase !== "idle" ? (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#d4a24c] shadow-[0_0_8px_var(--accent-glow)] animate-pulse" />
      ) : null}
      <AnimatePresence mode="wait">
        <motion.span
          key={phase + (stats?.anchor_pr ?? 0)}
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={reduced ? { duration: 0 } : { duration: 0.16 }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
