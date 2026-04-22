"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";

import { useReducedMotion } from "../lib/motion";

/**
 * Animated number that counts from 0 (or `from`) to `value`. Plays ONCE per
 * instance — we store a ref so the animation doesn't re-fire on re-render.
 * Respects prefers-reduced-motion (renders the target value immediately).
 */
export function CountUp({
  value,
  from = 0,
  duration = 1.1,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  from?: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const played = useRef(false);
  const motionValue = useMotionValue(reduced ? value : from);
  const formatted = useTransform(motionValue, (v) => {
    const fixed = v.toFixed(decimals);
    if (decimals === 0) {
      return `${prefix}${Number(fixed).toLocaleString()}${suffix}`;
    }
    return `${prefix}${fixed}${suffix}`;
  });

  useEffect(() => {
    if (reduced || played.current) {
      motionValue.set(value);
      return;
    }
    played.current = true;
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    return () => controls.stop();
  }, [value, reduced, duration, motionValue]);

  return <motion.span className={className}>{formatted}</motion.span>;
}
