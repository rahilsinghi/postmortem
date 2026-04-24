"use client";

import { useState } from "react";
import { ConflictFinderPanel } from "./ConflictFinderPanel";

export function ConflictFinderButton({ repo }: { repo: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/50 bg-rose-500/[0.05] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-rose-300 transition hover:border-rose-500 hover:bg-rose-500/[0.12]"
      >
        <span>⚠</span>
        <span>find conflicts</span>
      </button>
      <ConflictFinderPanel open={open} repo={repo} onClose={() => setOpen(false)} />
    </>
  );
}
