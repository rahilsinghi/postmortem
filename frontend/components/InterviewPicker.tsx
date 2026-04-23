"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { fetchSubjects, type InterviewSubject } from "../lib/interview";

export function InterviewPicker({
  open,
  owner,
  repo,
  onClose,
  onPick,
}: {
  open: boolean;
  owner: string;
  repo: string;
  onClose: () => void;
  onPick: (handle: string) => void;
}) {
  const [subjects, setSubjects] = useState<InterviewSubject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [hoverIdx, setHoverIdx] = useState(0);

  useEffect(() => {
    if (!open || subjects !== null) return;
    fetchSubjects(owner, repo)
      .then(setSubjects)
      .catch((e) => setError(String(e)));
  }, [open, owner, repo, subjects]);

  const filtered = useMemo(() => {
    if (!subjects) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter((s) => s.handle.toLowerCase().includes(q));
  }, [subjects, filter]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") setHoverIdx((i) => Math.min(i + 1, filtered.length - 1));
      if (e.key === "ArrowUp") setHoverIdx((i) => Math.max(i - 1, 0));
      if (e.key === "Enter" && filtered[hoverIdx]) onPick(filtered[hoverIdx].handle);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, hoverIdx, onClose, onPick]);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-label="choose a maintainer to interview"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="max-h-[80vh] w-[640px] max-w-[95vw] overflow-hidden rounded-xl border border-[#d4a24c]/40 bg-zinc-950 shadow-[0_0_60px_rgba(212,162,76,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
              <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-[#d4a24c]">
                👁 summon a maintainer
              </div>
              <button
                type="button"
                className="font-mono text-[11px] text-zinc-500 hover:text-zinc-200"
                onClick={onClose}
              >
                esc
              </button>
            </header>
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter by handle…"
              className="w-full border-b border-zinc-900 bg-transparent px-4 py-2 font-mono text-[12px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
            />
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {error ? <div className="p-4 text-rose-400">{error}</div> : null}
              {!subjects && !error ? (
                <div className="p-4 font-mono text-[11px] text-zinc-500">loading…</div>
              ) : null}
              {filtered.map((s, idx) => (
                <button
                  type="button"
                  key={s.handle}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition ${
                    idx === hoverIdx ? "bg-zinc-900" : "hover:bg-zinc-900/60"
                  }`}
                  onMouseEnter={() => setHoverIdx(idx)}
                  onClick={() => onPick(s.handle)}
                >
                  {/* biome-ignore lint/performance/noImgElement: avatar from github user content */}
                  <img
                    src={s.avatar_url}
                    alt=""
                    className="h-9 w-9 rounded-full border border-zinc-700"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-zinc-50">@{s.handle}</div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                      {s.decision_count} decisions · {s.citation_count} quoted lines
                      {s.span_start && s.span_end
                        ? ` · ${s.span_start.slice(0, 4)}–${s.span_end.slice(0, 4)}`
                        : ""}
                    </div>
                  </div>
                  <span className="text-[#d4a24c]">›</span>
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
