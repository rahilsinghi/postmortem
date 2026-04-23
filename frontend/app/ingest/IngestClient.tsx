"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { categoryStyle } from "../../components/CategoryBadge";
import { CountUp } from "../../components/CountUp";
import { DemoHighlight } from "../../lib/demo/DemoHighlight";
import { useDemo } from "../../lib/demo/DemoProvider";
import { type FixtureEvent, fakeStartIngest } from "../../lib/demo/fixtureClient";
import { runTypewriter } from "../../lib/demo/TypedInput";
import { useCueTrigger } from "../../lib/demo/useDemoClock";
import {
  type IngestDoneEvent,
  type IngestEvent,
  type IngestHandlers,
  type IngestPrClassifiedEvent,
  type IngestPrExtractedEvent,
  startIngest,
} from "../../lib/ingest";
import { useReducedMotion } from "../../lib/motion";

type Props = {
  initialRepo: string;
  initialLimit: number;
  initialMinDiscussion: number;
};

type PhaseLabel = "idle" | "listing" | "processing" | "persisting" | "stitching" | "done" | "error";

type Counters = {
  total: number;
  processed: number;
  accepted: number;
  rejected: number;
  decisions: number;
  alternatives: number;
  costUsd: number;
};

const INITIAL_COUNTERS: Counters = {
  total: 0,
  processed: 0,
  accepted: 0,
  rejected: 0,
  decisions: 0,
  alternatives: 0,
  costUsd: 0,
};

export function IngestClient({ initialRepo, initialLimit, initialMinDiscussion }: Props) {
  const [repo, setRepo] = useState(initialRepo);
  const [limit, setLimit] = useState(initialLimit);
  const [minDiscussion, setMinDiscussion] = useState(initialMinDiscussion);
  const [phase, setPhase] = useState<PhaseLabel>("idle");
  const [counters, setCounters] = useState<Counters>(INITIAL_COUNTERS);
  const [errors, setErrors] = useState<string[]>([]);
  const [done, setDone] = useState<IngestDoneEvent | null>(null);
  const [classifications, setClassifications] = useState<IngestPrClassifiedEvent[]>([]);
  const [extractions, setExtractions] = useState<IngestPrExtractedEvent[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => {
      esRef.current?.close();
    };
  }, []);

  const handleEvent = useCallback((ev: IngestEvent) => {
    switch (ev.type) {
      case "start":
        setPhase("listing");
        break;
      case "listing":
        setPhase("listing");
        break;
      case "listed":
        setCounters((c) => ({ ...c, total: ev.count }));
        setPhase("processing");
        break;
      case "filtered":
        setCounters((c) => ({ ...c, total: ev.after }));
        break;
      case "pr_classified":
        setCounters((c) => ({
          ...c,
          processed: ev.idx,
          accepted: ev.accepted_so_far,
          rejected: ev.rejected_so_far,
          costUsd: ev.cost_so_far,
        }));
        setClassifications((prev) => [ev, ...prev].slice(0, 40));
        break;
      case "pr_extracted":
        setCounters((c) => ({
          ...c,
          decisions: c.decisions + 1,
          alternatives: c.alternatives + ev.alternatives,
        }));
        setExtractions((prev) => [ev, ...prev].slice(0, 40));
        break;
      case "pr_error":
        setErrors((e) => [ev.error, ...e].slice(0, 10));
        break;
      case "persisting":
        setPhase("persisting");
        break;
      case "stitching":
        setPhase("stitching");
        break;
      case "stitcher_error":
        setErrors((e) => [ev.message, ...e].slice(0, 10));
        break;
      case "done":
        setDone(ev);
        setPhase("done");
        break;
      case "error":
        setErrors((e) => [ev.message, ...e].slice(0, 10));
        setPhase("error");
        break;
    }
  }, []);

  const { isDemo } = useDemo();

  const startRun = useCallback(
    (repoArg: string, limitArg: number, minArg: number) => {
      esRef.current?.close();
      setPhase("listing");
      setCounters(INITIAL_COUNTERS);
      setErrors([]);
      setDone(null);
      setClassifications([]);
      setExtractions([]);
      const handlers: IngestHandlers = { onEvent: handleEvent, onClose: () => {} };
      if (isDemo) {
        fetch("/demo/nextjs-ingest-events.json", { cache: "no-store" })
          .then((r) => r.json())
          .then((body: { events: FixtureEvent[] }) => {
            esRef.current = fakeStartIngest(body.events, handlers, {
              speed: 1,
            }) as unknown as EventSource;
          })
          .catch((err) => {
            setErrors((prev) => [...prev, `demo fixture load failed: ${String(err)}`]);
            setPhase("error");
          });
      } else {
        esRef.current = startIngest(repoArg, handlers, {
          limit: limitArg,
          minDiscussion: minArg,
          concurrency: 3,
        });
      }
    },
    [handleEvent, isDemo],
  );

  useEffect(() => {
    if (!initialRepo) return;
    // Auto-run disabled in demo mode — the "submit-ingest" cue drives it
    // instead so timing aligns with the typewriter beat.
    if (isDemo) return;
    startRun(initialRepo, initialLimit, initialMinDiscussion);
  }, [initialRepo, initialLimit, initialMinDiscussion, startRun, isDemo]);

  // Demo: typewriter into the 3 form fields sequentially when the
  // type-ingest-form cue fires.
  useCueTrigger("type-ingest-form", () => {
    const repoEl = document.querySelector<HTMLInputElement>('input[name="repo"]');
    const limitEl = document.querySelector<HTMLInputElement>('input[name="limit"]');
    const minEl = document.querySelector<HTMLInputElement>('input[name="minDiscussion"]');
    if (repoEl) runTypewriter(repoEl, "vercel/next.js", { perCharMs: 80 });
    // Stagger the numeric fields so they look deliberate.
    if (limitEl) {
      setTimeout(() => {
        // Clear first, then retype
        const setter = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(limitEl),
          "value",
        )?.set;
        setter?.call(limitEl, "");
        limitEl.dispatchEvent(new Event("input", { bubbles: true }));
        runTypewriter(limitEl, "100", { perCharMs: 60 });
      }, 1600);
    }
    if (minEl) {
      setTimeout(() => {
        const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(minEl), "value")?.set;
        setter?.call(minEl, "");
        minEl.dispatchEvent(new Event("input", { bubbles: true }));
        runTypewriter(minEl, "3", { perCharMs: 60 });
      }, 2400);
    }
  });

  // Demo: auto-click the submit button when the submit-ingest cue fires.
  useCueTrigger("submit-ingest", () => {
    const btn = document.querySelector<HTMLButtonElement>('button[type="submit"]');
    btn?.click();
  });

  function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!repo.includes("/")) return;
    startRun(repo, limit, minDiscussion);
  }

  const busy = phase !== "idle" && phase !== "done" && phase !== "error";

  const progressPct =
    counters.total > 0 ? Math.min(100, (counters.processed / counters.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Demo: amber ring-pulse leads the eye to the submit button and,
          once the ingest finishes, the Open-Ledger link. No-op when not demoing. */}
      <DemoHighlight cueId="submit-ingest" selector='button[type="submit"]' />
      <DemoHighlight cueId="ingest-done" selector="a[href^='/ledger/']" />
      <form onSubmit={onSubmit} className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <label
          htmlFor="repo"
          className="block font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500"
        >
          GitHub repo (owner/name)
        </label>
        <input
          id="repo"
          name="repo"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="pmndrs/use-pano"
          className="mt-2 w-full rounded-md border border-zinc-800 bg-black px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none"
          disabled={busy}
        />
        <div className="mt-4 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
              PR limit (max 200)
            </span>
            <input
              type="number"
              name="limit"
              min={1}
              max={200}
              value={limit}
              onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 0)))}
              disabled={busy}
              className="mt-1 w-full rounded-md border border-zinc-800 bg-black px-3 py-1.5 font-mono text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
              Min discussion (comments + threads)
            </span>
            <input
              type="number"
              name="minDiscussion"
              min={0}
              value={minDiscussion}
              onChange={(e) => setMinDiscussion(Math.max(0, Number(e.target.value) || 0))}
              disabled={busy}
              className="mt-1 w-full rounded-md border border-zinc-800 bg-black px-3 py-1.5 font-mono text-sm text-zinc-100 focus:border-zinc-600 focus:outline-none"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-500">
          <span className="font-mono">
            est. cost: ~${(limit * 0.01 + (counters.decisions || limit * 0.08) * 0.35).toFixed(2)}
          </span>
          <button
            type="submit"
            disabled={busy || !repo.includes("/")}
            className="rounded-md border border-zinc-700 bg-zinc-100 px-4 py-1.5 font-mono text-xs text-black transition disabled:cursor-not-allowed disabled:opacity-40 hover:bg-zinc-300"
          >
            {busy ? "Ingesting…" : "Start ingestion"}
          </button>
        </div>
      </form>

      {phase !== "idle" ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex items-start justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.2em]">
            <PhaseRail phase={phase} />
            {done ? (
              <Link
                href={`/ledger/${done.repo}`}
                className="shrink-0 rounded-md border border-[#d4a24c]/60 bg-[#d4a24c]/10 px-3 py-1 text-[#d4a24c] transition hover:border-[#d4a24c]"
              >
                Open ledger →
              </Link>
            ) : null}
          </div>
          <ProgressBar pct={progressPct} />
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiTile
              label="cost"
              primary={
                <CountUp
                  value={counters.costUsd}
                  decimals={3}
                  prefix="$"
                  duration={0.4}
                  className="tabular-nums text-[#d4a24c]"
                />
              }
              secondary={
                counters.processed > 0
                  ? `$${(counters.costUsd / counters.processed).toFixed(4)} per PR`
                  : "warming up"
              }
            />
            <KpiTile
              label="decisions"
              primary={
                <CountUp value={counters.decisions} duration={0.4} className="tabular-nums" />
              }
              secondary={`${counters.alternatives} alts`}
            />
            <KpiTile
              label="PRs seen"
              primary={`${counters.processed}/${counters.total || "?"}`}
              secondary={`${counters.accepted} accepted · ${counters.rejected} rejected`}
            />
            <KpiTile
              label={done ? "input · output" : "errors"}
              primary={
                done
                  ? `${(done.input_tokens / 1000).toFixed(1)}K / ${(done.output_tokens / 1000).toFixed(1)}K`
                  : String(errors.length)
              }
              secondary={done ? "tokens total" : errors.length === 0 ? "clean" : "see below"}
              tone={errors.length > 0 && !done ? "rose" : undefined}
            />
          </div>
        </div>
      ) : null}

      {errors.length > 0 ? (
        <div className="rounded-xl border border-rose-900/60 bg-rose-950/20 p-4 font-mono text-[11px] text-rose-300">
          <div className="mb-1 uppercase tracking-wider">Errors ({errors.length})</div>
          <ul className="space-y-1">
            {errors.slice(0, 5).map((e) => (
              <li key={e.slice(0, 80)} className="truncate" title={e}>
                {e.slice(0, 180)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <LogColumn title={`Classifier stream (${classifications.length})`}>
          {classifications.length === 0 ? (
            <p className="text-sm text-zinc-500">Waiting for PRs…</p>
          ) : (
            classifications.map((c) => <ClassificationRow key={`c-${c.pr_number}`} event={c} />)
          )}
        </LogColumn>
        <LogColumn title={`Extractor stream (${extractions.length})`}>
          {extractions.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Nothing yet. The extractor only runs on classifier-accepted PRs.
            </p>
          ) : (
            extractions.map((e) => <ExtractionRow key={`e-${e.pr_number}`} event={e} />)
          )}
        </LogColumn>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  primary,
  secondary,
  tone,
}: {
  label: string;
  primary: React.ReactNode;
  secondary: React.ReactNode;
  tone?: "rose";
}) {
  const primaryClass =
    tone === "rose"
      ? "text-rose-300 text-3xl tabular-nums leading-none"
      : "text-zinc-50 text-3xl tabular-nums leading-none";
  return (
    <div className="rounded-lg border border-zinc-800 bg-black/30 p-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-500">{label}</div>
      <div className={`mt-1.5 font-mono ${primaryClass}`}>{primary}</div>
      <div className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        {secondary}
      </div>
    </div>
  );
}

const PHASE_ORDER: PhaseLabel[] = ["listing", "processing", "persisting", "stitching", "done"];
const PHASE_PRETTY: Record<string, string> = {
  listing: "listing",
  processing: "classify · extract",
  persisting: "persisting",
  stitching: "stitching edges",
  done: "done",
};

function PhaseRail({ phase }: { phase: PhaseLabel }) {
  const activeIdx = PHASE_ORDER.indexOf(phase);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {PHASE_ORDER.map((p, idx) => {
        const isActive = idx === activeIdx;
        const isDone = activeIdx > idx;
        const cls = isActive
          ? "border-[#d4a24c] bg-[#d4a24c]/15 text-[#d4a24c]"
          : isDone
            ? "border-zinc-700 bg-zinc-900 text-zinc-300"
            : "border-zinc-800 bg-transparent text-zinc-600";
        return (
          <span
            key={p}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider transition ${cls}`}
          >
            {isDone ? <span>✓</span> : null}
            {isActive ? (
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#d4a24c]" />
            ) : null}
            <span>{PHASE_PRETTY[p] ?? p}</span>
          </span>
        );
      })}
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="relative mt-3 h-1 w-full overflow-hidden rounded-full bg-zinc-900">
      <div
        className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-[#d4a24c] via-[#f0c068] to-[#d4a24c] shimmer transition-all duration-300 ease-out"
        style={{ width: `${pct}%`, backgroundSize: "200% 100%" }}
      />
    </div>
  );
}

function LogColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-[320px] flex-col rounded-xl border border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        {title}
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-2">{children}</div>
    </div>
  );
}

function ClassificationRow({ event }: { event: IngestPrClassifiedEvent }) {
  const reduced = useReducedMotion();
  const icon = event.accepted ? "●" : "○";
  const tint = event.accepted ? "text-emerald-300" : "text-zinc-500";
  const title = event.title ?? "(unclassified)";
  return (
    <motion.div
      layout
      initial={reduced ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
      className="flex items-start gap-2 rounded px-1 py-1 font-mono text-[11px] leading-tight"
    >
      <motion.span
        className={`${tint} pt-0.5`}
        initial={reduced || !event.accepted ? false : { scale: 0.4 }}
        animate={{ scale: 1 }}
        transition={reduced ? { duration: 0 } : { duration: 0.36, ease: "backOut" }}
      >
        {icon}
      </motion.span>
      <span className="shrink-0 text-zinc-500">#{event.pr_number}</span>
      <span className="shrink-0 text-zinc-600">{event.confidence.toFixed(2)}</span>
      <span className={`truncate ${event.accepted ? "text-zinc-100" : "text-zinc-400"}`}>
        {title}
      </span>
    </motion.div>
  );
}

function ExtractionRow({ event }: { event: IngestPrExtractedEvent }) {
  const reduced = useReducedMotion();
  const style = categoryStyle(event.category);
  return (
    <motion.div
      layout
      initial={reduced ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={reduced ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
      className="rounded-md border border-zinc-800 bg-zinc-950/70 px-2 py-1.5"
    >
      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
        <span className={`rounded px-1.5 py-0.5 ${style.bg} ${style.text} ${style.border} border`}>
          {event.category.replaceAll("_", " ")}
        </span>
        <span className="text-zinc-500">#{event.pr_number}</span>
        <span className="ml-auto text-zinc-500">
          {event.citations} cites · {event.alternatives} alts
        </span>
      </div>
      <p className="mt-1 font-mono text-[11px] leading-tight text-zinc-100">{event.title}</p>
    </motion.div>
  );
}
