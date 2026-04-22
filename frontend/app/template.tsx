"use client";

/**
 * App Router route transitions. `template.tsx` re-runs on every navigation
 * (unlike `layout.tsx` which is cached), so we can fade/slide children on
 * every route change without fighting Next's caching.
 *
 * Intentionally no `exit` animation — App Router unmounts the old tree before
 * mounting the new one, so `AnimatePresence mode="wait"` doesn't map cleanly.
 * A simple enter transition is the safe pattern that doesn't break any of
 * the SSE pages underneath.
 */

import { motion } from "framer-motion";

import { useReducedMotion } from "../lib/motion";

export default function Template({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduced ? 0 : 0.22, ease: [0.25, 1, 0.5, 1] }}
      className="flex min-h-full flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}
