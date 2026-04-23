"use client";

import { animate, type MotionValue, motion, useMotionValue, useTransform } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Decision } from "../lib/api";
import { useReducedMotion } from "../lib/motion";

export type Tick = { id: string; date: Date; x: number };
export type TickCluster = { x: number; date: Date; members: string[] };

/**
 * Group overlapping ticks into stacks. Single linear pass over pixel-sorted
 * ticks: a tick within `minGap` pixels of its predecessor joins the current
 * cluster; otherwise the current cluster flushes and a new one starts.
 *
 * A cluster's x and date are the mean of its members.
 */
export function clusterTicks(ticks: Tick[], minGap: number): TickCluster[] {
  if (ticks.length === 0) return [];
  const sorted = [...ticks].sort((a, b) => a.x - b.x);
  const clusters: TickCluster[] = [];
  let current: { xs: number[]; dates: number[]; ids: string[] } = {
    xs: [sorted[0].x],
    dates: [sorted[0].date.getTime()],
    ids: [sorted[0].id],
  };
  const flush = () => {
    const meanX = current.xs.reduce((a, b) => a + b, 0) / current.xs.length;
    const meanDate = current.dates.reduce((a, b) => a + b, 0) / current.dates.length;
    clusters.push({
      x: meanX,
      date: new Date(meanDate),
      members: current.ids,
    });
  };
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].x - sorted[i - 1].x < minGap) {
      current.xs.push(sorted[i].x);
      current.dates.push(sorted[i].date.getTime());
      current.ids.push(sorted[i].id);
    } else {
      flush();
      current = {
        xs: [sorted[i].x],
        dates: [sorted[i].date.getTime()],
        ids: [sorted[i].id],
      };
    }
  }
  flush();
  return clusters;
}

export type Scale = "time" | "uniform";

type Props = {
  decisions: Decision[];
  cutoffMV: MotionValue<number>;
  width: number;
};

const RAIL_HEIGHT = 32;
const MIN_GAP_PX = 6;
const SPEEDS = [1, 4, 10] as const;

export function TimelineRail({ decisions, cutoffMV, width }: Props) {
  const reduced = useReducedMotion();

  const dated = useMemo(
    () =>
      decisions
        .filter((d) => d.decided_at !== null)
        .map((d) => ({
          id: d.id,
          pr: d.pr_number,
          title: d.title,
          date: new Date(d.decided_at as string),
        })),
    [decisions],
  );

  const [scale, setScale] = useState<Scale>(() => (dated.length > 200 ? "uniform" : "time"));

  const [minTs, maxTs] = useMemo(() => {
    if (dated.length === 0) return [0, 0];
    const ts = dated.map((d) => d.date.getTime());
    return [Math.min(...ts), Math.max(...ts)];
  }, [dated]);

  const xOfDate = useCallback(
    (ts: number): number => {
      if (scale === "uniform") {
        const rank = dated.findIndex((d) => d.date.getTime() === ts);
        if (rank < 0) return 0;
        return (rank / Math.max(1, dated.length - 1)) * width;
      }
      const span = maxTs - minTs || 1;
      return ((ts - minTs) / span) * width;
    },
    [scale, dated, minTs, maxTs, width],
  );

  const dateOfX = useCallback(
    (x: number): number => {
      if (scale === "uniform") {
        const rank = Math.round((x / width) * Math.max(0, dated.length - 1));
        return dated[Math.max(0, Math.min(dated.length - 1, rank))]?.date.getTime() ?? 0;
      }
      const span = maxTs - minTs || 1;
      return minTs + (x / width) * span;
    },
    [scale, dated, minTs, maxTs, width],
  );

  const ticks: Tick[] = useMemo(
    () =>
      dated.map((d) => ({
        id: d.id,
        date: d.date,
        x: xOfDate(d.date.getTime()),
      })),
    [dated, xOfDate],
  );
  const clusters = useMemo(() => clusterTicks(ticks, MIN_GAP_PX), [ticks]);

  const scrubberX = useMotionValue(width);
  const cursorDate = useTransform(scrubberX, (x) => dateOfX(Math.max(0, Math.min(width, x))));

  useEffect(() => {
    const unsub = cursorDate.on("change", (d) => cutoffMV.set(d));
    return unsub;
  }, [cursorDate, cutoffMV]);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    const msPerPx = 10_000 / width;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const currentX = scrubberX.get();
      const nextX = currentX + (dt / msPerPx) * speed;
      if (nextX >= width) {
        scrubberX.set(width);
        setPlaying(false);
        return;
      }
      scrubberX.set(nextX);
      rafRef.current = requestAnimationFrame(tick);
    };
    if (scrubberX.get() >= width - 1) scrubberX.set(0);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, width, scrubberX]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowLeft") {
        const currX = scrubberX.get();
        const prev = [...ticks].reverse().find((t) => t.x < currX - 1);
        if (prev) scrubberX.set(prev.x);
      } else if (e.key === "ArrowRight") {
        const currX = scrubberX.get();
        const nxt = ticks.find((t) => t.x > currX + 1);
        if (nxt) scrubberX.set(nxt.x);
      } else if (e.key === "Home") {
        scrubberX.set(0);
      } else if (e.key === "End") {
        scrubberX.set(width);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ticks, scrubberX, width]);

  const labelRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const unsub = cursorDate.on("change", (d) => {
      if (labelRef.current) {
        const date = new Date(d);
        labelRef.current.textContent = date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      }
    });
    return unsub;
  }, [cursorDate]);

  if (dated.length < 3) return null;

  return (
    <div
      className="pointer-events-auto relative mx-4 mb-3 flex items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-1 backdrop-blur-lg"
      style={{ height: RAIL_HEIGHT }}
    >
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-[#d4a24c]/60 bg-[#d4a24c]/10 text-[#d4a24c] transition hover:bg-[#d4a24c]/20"
        title={playing ? "pause (space)" : "play (space)"}
      >
        <span className="text-[11px]">{playing ? "⏸" : "▶"}</span>
      </button>
      <div className="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={`rounded px-1.5 py-0.5 transition ${
              s === speed ? "bg-[#d4a24c]/20 text-[#d4a24c]" : "hover:text-zinc-200"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
      <div
        className="relative flex-1"
        style={{ height: RAIL_HEIGHT - 8 }}
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const localX = e.clientX - rect.left;
          animate(
            scrubberX,
            localX,
            reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 },
          );
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-zinc-800" />
        {clusters.map((c) => (
          <div
            key={c.members.join(":")}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: c.x }}
            title={
              c.members.length === 1
                ? c.date.toDateString()
                : `${c.members.length} decisions ~${c.date.toDateString()}`
            }
          >
            {c.members.length === 1 ? (
              <div className="h-2 w-[3px] rounded-sm bg-[#d4a24c]/70" />
            ) : (
              <div className="flex items-center justify-center rounded-sm bg-[#d4a24c]/30 px-[3px] py-[1px] font-mono text-[8px] text-[#d4a24c]">
                {c.members.length}
              </div>
            )}
          </div>
        ))}
        <motion.div
          className="absolute top-0 h-full w-1 cursor-col-resize rounded-[1px] bg-[#d4a24c] shadow-[0_0_10px_rgba(212,162,76,0.6)]"
          style={{ x: scrubberX, translateX: "-50%" }}
          drag="x"
          dragConstraints={{ left: 0, right: width }}
          dragMomentum={false}
        />
      </div>
      <span
        ref={labelRef}
        className="w-20 text-right font-mono text-[10px] tabular-nums text-zinc-300"
      />
      <button
        type="button"
        onClick={() => setScale((s) => (s === "time" ? "uniform" : "time"))}
        className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 transition hover:text-zinc-200"
        title="Toggle time vs uniform scale"
      >
        {scale}
      </button>
    </div>
  );
}
