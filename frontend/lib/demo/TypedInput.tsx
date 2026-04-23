"use client";

import { useEffect, useRef } from "react";

import { useCueTrigger } from "./useDemoClock";

export type TypewriterOptions = { perCharMs?: number };
export type TypewriterHandle = { cancel: () => void };

/**
 * Types `text` into an input/textarea using the native value setter so
 * React's controlled inputs see each keystroke. Fires `input` events for
 * controlled-state wiring. Returns a cancel handle.
 *
 * The native setter dance is needed because React wraps the DOM setter with
 * its own tracker; direct `el.value = ...` inside React's synthetic event
 * flow gets swallowed. Looking up the setter off the prototype bypasses that.
 */
export function runTypewriter(
  el: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  { perCharMs = 25 }: TypewriterOptions = {},
): TypewriterHandle {
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) throw new Error("runTypewriter: native value setter missing");

  let canceled = false;
  let i = 1;
  const tick = () => {
    if (canceled) return;
    const next = text.slice(0, i);
    setter.call(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    i += 1;
    if (i <= text.length) {
      setTimeout(tick, perCharMs);
    }
  };
  setTimeout(tick, perCharMs);

  return {
    cancel: () => {
      canceled = true;
    },
  };
}

/**
 * React wrapper: when cue `cueId` becomes active, type `text` into the
 * element matched by `selector`.
 */
export function useTypedCue(cueId: string, selector: string, text: string, perCharMs = 25): void {
  const handleRef = useRef<TypewriterHandle | null>(null);
  useCueTrigger(cueId, () => {
    const el = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!el) return;
    handleRef.current?.cancel();
    handleRef.current = runTypewriter(el, text, { perCharMs });
  });
  useEffect(() => () => handleRef.current?.cancel(), []);
}
