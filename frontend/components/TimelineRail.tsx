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
        const rank = Math.round((x / Math.max(1, width)) * Math.max(0, dated.length - 1));
        return dated[Math.max(0, Math.min(dated.length - 1, rank))]?.date.getTime() ?? 0;
      }
      const span = maxTs - minTs || 1;
      return minTs + (x / Math.max(1, width)) * span;
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

  // Engaged = user has explicitly interacted with the rail (drag, click,
  // play, arrow key). Until then: `cutoffMV` stays at +Infinity so the
  // graph is FULL by default. A "⏭ present" button and Esc key disengage.
  const [engaged, setEngaged] = useState(false);

  // Scrubber tracks a normalized position (0..1) across the rail. We derive
  // pixel x from normPos * width so resize never loses position.
  const normPos = useMotionValue(1);
  const scrubberX = useTransform(normPos, (n) => n * width);
  const cursorDate = useTransform(scrubberX, (x) => dateOfX(Math.max(0, Math.min(width, x))));

  // Feed cutoffMV from cursorDate ONLY when engaged. Default: cutoff stays
  // at whatever it was initialized to (+Infinity from LedgerPage) so the
  // full graph renders.
  useEffect(() => {
    if (!engaged) {
      cutoffMV.set(Number.POSITIVE_INFINITY);
      return;
    }
    // Fire once immediately so the first engage lands on the right cutoff.
    cutoffMV.set(cursorDate.get());
    const unsub = cursorDate.on("change", (d) => cutoffMV.set(d));
    return unsub;
  }, [engaged, cursorDate, cutoffMV]);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const rafRef = useRef<number | null>(null);

  const engage = useCallback(() => {
    setEngaged(true);
  }, []);

  const resetToPresent = useCallback(() => {
    setPlaying(false);
    setEngaged(false);
    animate(
      normPos,
      1,
      reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 32 },
    );
    cutoffMV.set(Number.POSITIVE_INFINITY);
  }, [cutoffMV, normPos, reduced]);

  useEffect(() => {
    if (!playing) return;
    engage();
    // Rewind to start if already at the end — otherwise continue from here.
    if (normPos.get() >= 0.999) normPos.set(0);
    // Cover the full timeline in ~10s at 1×, scale by speed.
    const nPerMs = 1 / 10_000; // normalized position per ms
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const curr = normPos.get();
      const next = curr + dt * nPerMs * speed;
      if (next >= 1) {
        normPos.set(1);
        setPlaying(false);
        return;
      }
      normPos.set(next);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, normPos, engage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT")) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowLeft") {
        engage();
        const currX = scrubberX.get();
        const prev = [...ticks].reverse().find((t) => t.x < currX - 1);
        if (prev) normPos.set(prev.x / Math.max(1, width));
      } else if (e.key === "ArrowRight") {
        engage();
        const currX = scrubberX.get();
        const nxt = ticks.find((t) => t.x > currX + 1);
        if (nxt) normPos.set(nxt.x / Math.max(1, width));
      } else if (e.key === "Home") {
        engage();
        normPos.set(0);
      } else if (e.key === "End") {
        resetToPresent();
      } else if (e.key === "Escape" && engaged) {
        resetToPresent();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ticks, scrubberX, normPos, width, engage, engaged, resetToPresent]);

  const labelRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const update = (d: number) => {
      if (!labelRef.current) return;
      if (!engaged) {
        labelRef.current.textContent = "present";
        return;
      }
      const date = new Date(d);
      labelRef.current.textContent = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    };
    update(cursorDate.get());
    const unsub = cursorDate.on("change", update);
    return unsub;
  }, [cursorDate, engaged]);

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
        className="relative flex-1 cursor-ew-resize"
        style={{ height: RAIL_HEIGHT - 8 }}
        onPointerDown={(e) => {
          engage();
          const rail = e.currentTarget;
          rail.setPointerCapture(e.pointerId);
          const update = (clientX: number) => {
            const rect = rail.getBoundingClientRect();
            const local = Math.max(0, Math.min(rect.width, clientX - rect.left));
            normPos.set(local / Math.max(1, rect.width));
          };
          // First click snaps via spring; subsequent pointermove calls update
          // the position directly (no animation, follows the cursor).
          const rect = rail.getBoundingClientRect();
          const targetNorm = Math.max(
            0,
            Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)),
          );
          animate(
            normPos,
            targetNorm,
            reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 },
          );
          const onMove = (ev: PointerEvent) => update(ev.clientX);
          const onUp = () => {
            try {
              rail.releasePointerCapture(e.pointerId);
            } catch {
              // capture may have already ended
            }
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
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
          aria-hidden
          className={`pointer-events-none absolute top-0 h-full w-1 rounded-[1px] transition-opacity ${
            engaged
              ? "bg-[#d4a24c] shadow-[0_0_10px_rgba(212,162,76,0.6)] opacity-100"
              : "bg-[#d4a24c]/40 opacity-60"
          }`}
          style={{ x: scrubberX, translateX: "-50%" }}
        />
      </div>
      <span
        ref={labelRef}
        className={`w-20 text-right font-mono text-[10px] tabular-nums ${
          engaged ? "text-zinc-300" : "text-[#d4a24c]/70"
        }`}
      />
      <button
        type="button"
        onClick={resetToPresent}
        disabled={!engaged}
        className="rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500 transition hover:border-[#d4a24c]/50 hover:text-[#d4a24c] disabled:cursor-not-allowed disabled:opacity-40"
        title="Jump back to present (Esc or End)"
      >
        ⏭ present
      </button>
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
