"use client";

import { useEffect, useRef, useState } from "react";

import { useCueTrigger } from "./useDemoClock";

type Rect = { x: number; y: number; w: number; h: number };

/**
 * Pulses a 560ms amber ring around the element matched by `selector` when
 * cue `cueId` fires. Use before synthesizing a click to lead the viewer's
 * eye without a fake cursor.
 *
 * The ring element is rendered position-fixed outside normal flow so it
 * can't clip against overflow-hidden ancestors.
 */
export function DemoHighlight({ cueId, selector }: { cueId: string; selector: string }) {
  const [rect, setRect] = useState<Rect | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useCueTrigger(cueId, () => {
    const el = document.querySelector(selector);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setRect(null), 560);
  });
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );
  if (!rect) return null;
  return (
    <div
      className="demo-ring-pulse"
      style={{
        left: rect.x - 4,
        top: rect.y - 4,
        width: rect.w + 8,
        height: rect.h + 8,
      }}
    />
  );
}
