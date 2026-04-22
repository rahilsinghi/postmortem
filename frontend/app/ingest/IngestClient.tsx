"use client";

import Link from "next/link";
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

import { categoryStyle } from "../../components/CategoryBadge";
import {
  type IngestDoneEvent,
  type IngestEvent,
  type IngestPrClassifiedEvent,
  type IngestPrExtractedEvent,
  startIngest,
} from "../../lib/ingest";

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

  const startRun = useCallback(
    (repoArg: string, limitArg: number, minArg: number) => {
      esRef.current?.close();
      setPhase("listing");
      setCounters(INITIAL_COUNTERS);
      setErrors([]);
      setDone(null);
      setClassifications([]);
      setExtractions([]);
      esRef.current = startIngest(
        repoArg,
        { onEvent: handleEvent, onClose: () => {} },
        { limit: limitArg, minDiscussion: minArg, concurrency: 3 },
      );
    },
    [handleEvent],
  );

  useEffect(() => {
    if (!initialRepo) return;
    startRun(initialRepo, initialLimit, initialMinDiscussion);
  }, [initialRepo, initialLimit, initialMinDiscussion, startRun]);

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
      <form onSubmit={onSubmit} className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
        <label
          htmlFor="repo"
          className="block font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500"
        >
          GitHub repo (owner/name)
        </label>
        <input
          id="repo"
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
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            <span>{phase.replace("_", " ")}</span>
            {done ? (
              <Link
                href={`/ledger/${done.repo}`}
                className="text-zinc-100 underline decoration-zinc-700 underline-offset-4 hover:text-white"
              >
                Open ledger →
              </Link>
            ) : null}
          </div>
          <ProgressBar pct={progressPct} />
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[11px] text-zinc-400 sm:grid-cols-4">
            <Stat label="PRs seen" value={`${counters.processed}/${counters.total || "?"}`} />
            <Stat label="Accepted" value={String(counters.accepted)} />
            <Stat label="Decisions" value={String(counters.decisions)} />
            <Stat label="Alternatives" value={String(counters.alternatives)} />
            <Stat label="Rejected" value={String(counters.rejected)} />
            <Stat label="Errors" value={String(errors.length)} />
            <Stat label="Cost so far" value={`$${counters.costUsd.toFixed(3)}`} />
            <Stat
              label="Cost/PR"
              value={
                counters.processed > 0
                  ? `$${(counters.costUsd / counters.processed).toFixed(4)}`
                  : "—"
              }
            />
          </dl>
          {done ? (
            <div className="mt-4 rounded-md border border-emerald-800/50 bg-emerald-950/20 p-3 font-mono text-[11px] text-emerald-200">
              Done. {done.decisions_written} decisions, {done.edges_written} edges, $
              {done.cost_usd.toFixed(4)} · {done.input_tokens.toLocaleString()} input tokens ·{" "}
              {done.output_tokens.toLocaleString()} output tokens.
            </div>
          ) : null}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</dt>
      <dd className="mt-0.5 text-sm text-zinc-100">{value}</dd>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-900">
      <div
        className="h-full bg-zinc-300 transition-all duration-200 ease-out"
        style={{ width: `${pct}%` }}
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
  const icon = event.accepted ? "●" : "○";
  const tint = event.accepted ? "text-emerald-300" : "text-zinc-500";
  const title = event.title ?? "(unclassified)";
  return (
    <div className="flex items-start gap-2 rounded px-1 py-1 font-mono text-[11px] leading-tight">
      <span className={`${tint} pt-0.5`}>{icon}</span>
      <span className="shrink-0 text-zinc-500">#{event.pr_number}</span>
      <span className="shrink-0 text-zinc-600">{event.confidence.toFixed(2)}</span>
      <span className={`truncate ${event.accepted ? "text-zinc-100" : "text-zinc-400"}`}>
        {title}
      </span>
    </div>
  );
}

function ExtractionRow({ event }: { event: IngestPrExtractedEvent }) {
  const style = categoryStyle(event.category);
  return (
    <div className="rounded-md border border-zinc-800 px-2 py-1.5">
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
    </div>
  );
}
