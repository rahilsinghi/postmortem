"use client";

import { type MotionValue, useMotionValue } from "framer-motion";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { DemoCaptionRail } from "../../components/DemoCaptionRail";
import { DemoNavigator } from "./DemoNavigator";
import { totalDurationSec } from "./timeline";

export type DemoState = "idle" | "armed" | "playing" | "ended" | "aborted";

type DemoContextValue = {
  state: DemoState;
  isDemo: boolean; // true when state !== "idle" and !== "aborted"
  clockSec: MotionValue<number>;
  totalSec: number;
  play: () => void;
  abort: () => void;
};

const DemoContext = createContext<DemoContextValue | null>(null);

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo() outside <DemoProvider>");
  return ctx;
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const demoParam = searchParams.get("demo");
  const playParam = searchParams.get("play");

  // Initial state: ?demo=1&play=1 → playing; ?demo=1 → armed; else idle.
  const [state, setState] = useState<DemoState>(() => {
    if (demoParam === "1" && playParam === "1") return "playing";
    if (demoParam === "1") return "armed";
    return "idle";
  });

  const clockSec = useMotionValue(0);
  const startedAtRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const totalSec = totalDurationSec();

  // Playback loop — wall-clock driven via performance.now()
  useEffect(() => {
    if (state !== "playing") {
      startedAtRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      return;
    }
    startedAtRef.current = performance.now();
    const tick = (now: number) => {
      if (startedAtRef.current === null) return;
      const t = (now - startedAtRef.current) / 1000;
      clockSec.set(Math.min(t, totalSec));
      if (t >= totalSec) {
        setState("ended");
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [state, clockSec, totalSec]);

  const play = useCallback(() => {
    clockSec.set(0);
    setState("playing");
    // Stamp URL with ?demo=1&play=1 so a reload resumes and route-level
    // fixture-reads know we're in demo mode.
    const params = new URLSearchParams(searchParams.toString());
    params.set("demo", "1");
    params.set("play", "1");
    router.replace(`${pathname}?${params.toString()}`);
  }, [clockSec, pathname, router, searchParams]);

  const abort = useCallback(() => {
    clockSec.set(0);
    setState("aborted");
    router.replace("/");
    // Re-idle after a tick so UI can animate out
    window.setTimeout(() => setState("idle"), 400);
  }, [clockSec, router]);

  // Esc aborts while armed or playing
  useEffect(() => {
    if (state !== "playing" && state !== "armed") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") abort();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, abort]);

  const value: DemoContextValue = {
    state,
    isDemo: state !== "idle" && state !== "aborted",
    clockSec,
    totalSec,
    play,
    abort,
  };

  return (
    <DemoContext.Provider value={value}>
      {children}
      {state === "playing" || state === "armed" ? (
        <>
          <DemoCaptionRail />
          <DemoNavigator />
        </>
      ) : null}
    </DemoContext.Provider>
  );
}
