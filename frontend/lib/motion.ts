"use client";

import { useReducedMotion as useFMReducedMotion } from "framer-motion";

/**
 * Respects `prefers-reduced-motion: reduce` AND an env escape hatch.
 * The CSS rule in `globals.css` only suppresses CSS transitions/animations —
 * Framer Motion's JS-driven animations bypass that and need this hook to
 * check the media query directly.
 *
 * Returns `true` when motion should be suppressed.
 */
export function useReducedMotion(): boolean {
  return useFMReducedMotion() ?? false;
}

/**
 * Variant helpers that collapse to no-op when motion is reduced. Use these
 * instead of hand-rolling variants inside components so reduced-motion is
 * enforced consistently.
 */
export function staggerContainer(reduced: boolean, staggerChildren = 0.08, delayChildren = 0.15) {
  if (reduced) {
    return {
      hidden: { opacity: 1 },
      show: { opacity: 1 },
    };
  }
  return {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren, delayChildren },
    },
  };
}

export function fadeSlideItem(reduced: boolean, distance = 12, duration = 0.35) {
  if (reduced) {
    return {
      hidden: { opacity: 1, y: 0 },
      show: { opacity: 1, y: 0, transition: { duration: 0 } },
    };
  }
  return {
    hidden: { opacity: 0, y: distance },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration, ease: [0.25, 1, 0.5, 1] as const },
    },
  };
}

/** Spring preset matching the design audit's "tactile but restrained" target. */
export const SPRING_TACTILE = {
  type: "spring" as const,
  stiffness: 420,
  damping: 32,
};

/** Linear ease for ambient / background motion. */
export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
