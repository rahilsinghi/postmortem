"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";

const INSTALL_COMMAND =
  "claude mcp add postmortem -- uv run --project /absolute/path/to/postmortem/backend python -m app.mcp_server";

const TOOLS: { name: string; needsKey: boolean; blurb: string }[] = [
  {
    name: "postmortem_list_repos",
    needsKey: false,
    blurb: "Markdown table of cached ledgers with lifetime spend.",
  },
  {
    name: "postmortem_list_decisions",
    needsKey: false,
    blurb: "Summary list per repo, optional category filter.",
  },
  {
    name: "postmortem_open_decision",
    needsKey: false,
    blurb: "Full rationale + rejected alternatives for one PR.",
  },
  {
    name: "postmortem_query",
    needsKey: true,
    blurb: "Opus 4.7 cited answer + self-check verdict.",
  },
  {
    name: "postmortem_impact",
    needsKey: true,
    blurb: "BFS subgraph + cascading consequences.",
  },
];

export function MCPConnectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mcp-connect-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-7 shadow-[0_20px_60px_-20px_rgba(212,162,76,0.25)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-0 bg-noise opacity-[0.04]" />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 rounded-full border border-zinc-800 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition hover:border-zinc-600 hover:text-zinc-200"
            >
              esc
            </button>

            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#d4a24c]">
              MCP · stdio · Claude Code
            </p>
            <h2
              id="mcp-connect-title"
              className="mt-2 text-2xl font-semibold tracking-tight text-zinc-50"
            >
              Connect Postmortem to Claude Code
            </h2>
            <p className="mt-3 text-sm text-zinc-400">
              Run the install command below. Replace the path with your absolute clone path. From
              any Claude Code session you&rsquo;ll get five new tools that read the same DuckDB
              ledger you see in this UI.
            </p>

            <div className="mt-5 rounded-lg border border-zinc-800 bg-black/60 p-0.5">
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <pre className="flex-1 overflow-x-auto whitespace-pre font-mono text-xs leading-relaxed text-zinc-200">
                  {INSTALL_COMMAND}
                </pre>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-zinc-200 transition hover:border-[#d4a24c]/70 hover:text-[#d4a24c]"
                >
                  {copied ? "copied" : "copy"}
                </button>
              </div>
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
              prereq · <span className="text-zinc-300">uv</span> installed ·{" "}
              <span className="text-zinc-300">ANTHROPIC_API_KEY</span> in the backend env for
              query/impact
            </p>

            <div className="mt-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                What you get
              </p>
              <ul className="mt-3 divide-y divide-zinc-900 rounded-lg border border-zinc-900">
                {TOOLS.map((tool) => (
                  <li key={tool.name} className="flex items-start gap-3 px-4 py-2.5">
                    <code className="font-mono text-[12px] text-zinc-100">{tool.name}</code>
                    <span className="mt-[3px] ml-auto flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                      {tool.needsKey ? (
                        <span className="rounded-full border border-[#d4a24c]/40 px-2 py-[1px] text-[#d4a24c]">
                          needs api key
                        </span>
                      ) : (
                        <span className="rounded-full border border-zinc-800 px-2 py-[1px] text-zinc-500">
                          offline
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <ul className="mt-3 space-y-1.5 text-[12px] leading-snug text-zinc-500">
                {TOOLS.map((tool) => (
                  <li key={`${tool.name}-blurb`}>
                    <span className="font-mono text-[11px] text-zinc-400">{tool.name}</span>
                    {" — "}
                    {tool.blurb}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-900 pt-4">
              <a
                href="https://github.com/rahilsinghi/postmortem/blob/main/docs/MCP-SERVER.md"
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] uppercase tracking-wider text-zinc-400 transition hover:text-[#d4a24c]"
              >
                full docs · MCP-SERVER.md →
              </a>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-zinc-700 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
                >
                  close
                </button>
                <Link
                  href="/demo/terminal"
                  onClick={onClose}
                  className="group inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-400/[0.08] px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-cyan-200 transition hover:border-cyan-400 hover:bg-cyan-400/[0.15]"
                >
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-300 transition group-hover:shadow-[0_0_8px_rgba(103,232,249,0.9)]"
                  />
                  watch 70-sec terminal demo
                  <span aria-hidden className="transition group-hover:translate-x-0.5">
                    →
                  </span>
                </Link>
              </div>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
