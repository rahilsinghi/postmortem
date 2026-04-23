"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useDemo } from "../lib/demo/DemoProvider";
import { TERMINAL_SCRIPT, type TerminalStep } from "../lib/demo/terminal-script";
import { useReducedMotion } from "../lib/motion";

/** One rendered line in the scrollback. */
type Line =
  | { id: string; kind: "prompt"; text: string; typing: boolean }
  | { id: string; kind: "output"; text: string }
  | { id: string; kind: "claude"; text: string; typing: boolean }
  | { id: string; kind: "tool-pending"; tool: string }
  | { id: string; kind: "tool-done"; tool: string; durationMs: number }
  | { id: string; kind: "banner"; text: string };

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Render a prompt line with a trailing cursor while typing. */
function PromptLine({ text, typing }: { text: string; typing: boolean }) {
  return (
    <div className="flex items-start gap-2 font-mono text-[13px] leading-[1.55]">
      <span className="text-[#d4a24c]">» </span>
      <span className="whitespace-pre-wrap text-zinc-100">
        {text}
        {typing ? <Cursor /> : null}
      </span>
    </div>
  );
}

function OutputLine({ text }: { text: string }) {
  // Wrap citation tokens in amber brackets with a brief glow on first paint.
  const parts = splitCitations(text);
  return (
    <div className="whitespace-pre-wrap font-mono text-[12.5px] leading-[1.55] text-zinc-300">
      {parts.map((p, i) => {
        const key = `${i}-${p.slice(0, 16)}`;
        if (p.startsWith("[") && /PR #\d|@[\w-]/.test(p)) {
          return (
            <motion.span
              key={key}
              initial={{ textShadow: "0 0 16px rgba(212,162,76,0.9)" }}
              animate={{ textShadow: "0 0 0px rgba(212,162,76,0)" }}
              transition={{ duration: 0.9, ease: "easeOut" }}
              className="text-[#d4a24c]"
            >
              {p}
            </motion.span>
          );
        }
        return <span key={key}>{p}</span>;
      })}
    </div>
  );
}

function ClaudeLine({ text, typing }: { text: string; typing: boolean }) {
  return (
    <div className="flex items-start gap-2 font-mono text-[12.5px] leading-[1.55] text-zinc-200">
      <span className="shrink-0 text-cyan-300/80">claude ›</span>
      <span className="whitespace-pre-wrap">
        {text}
        {typing ? <Cursor cyan /> : null}
      </span>
    </div>
  );
}

function ToolPendingLine({ tool }: { tool: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[12px] leading-[1.55] text-cyan-300/90">
      <motion.span
        aria-hidden
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
      >
        ⚡
      </motion.span>
      <span>invoking {tool}…</span>
    </div>
  );
}

function ToolDoneLine({ tool, durationMs }: { tool: string; durationMs: number }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[12px] leading-[1.55] text-emerald-400/90">
      <span aria-hidden>✓</span>
      <span>{tool}</span>
      <span className="text-zinc-500">({fmtDuration(durationMs)})</span>
    </div>
  );
}

function BannerLine({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mb-2 rounded-md border border-zinc-800 bg-zinc-950/90 px-3 py-1.5 font-mono text-[11px] text-zinc-400"
    >
      <span className="text-[#d4a24c]">●</span> <span>{text}</span>
    </motion.div>
  );
}

function Cursor({ cyan = false }: { cyan?: boolean }) {
  return (
    <motion.span
      aria-hidden
      className={`ml-0.5 inline-block h-[1.05em] w-[0.5em] -translate-y-[2px] rounded-[1px] align-middle ${
        cyan ? "bg-cyan-300" : "bg-[#d4a24c]"
      }`}
      animate={{ opacity: [1, 0.2, 1] }}
      transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/** Break a line into text + citation-token fragments so we can color them. */
function splitCitations(text: string): string[] {
  const re = /(\[(?:PR|PR #|commit|issue)[^\]]*\])/g;
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function DemoTerminal() {
  const reduced = useReducedMotion();
  const router = useRouter();
  const searchParams = useSearchParams();
  const auto = searchParams.get("auto") === "1";
  const demo = useDemo();

  const [lines, setLines] = useState<Line[]>([]);
  const [caption, setCaption] = useState<string | null>(null);
  const [totalCost, setTotalCost] = useState(0);
  const [toolCallCount, setToolCallCount] = useState(0);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom as lines are added. Reading length counts as
  // a legit dep since we want the effect to re-run whenever rows appear.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional — we want the length change alone to trigger the scroll.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines.length, caption]);

  // Run the scripted sequence on mount. In StrictMode dev this effect is
  // double-invoked; we rely on the `cancelled` flag + cleanup to discard
  // the first run's in-flight work. A ref-based "started once" gate is
  // WRONG here — it leaves StrictMode's second mount with no animation.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the script runs one-shot per mount pass; external deps shouldn't re-trigger it.
  useEffect(() => {
    let cancelled = false;
    let lineCounter = 0;
    // Reset terminal state on each mount pass so StrictMode re-runs don't
    // stack duplicate banners / lines on top of a prior half-run.
    setLines([]);
    setCaption(null);
    setTotalCost(0);
    setToolCallCount(0);

    const sleep = (ms: number) =>
      new Promise<void>((res) => {
        if (cancelled || ms <= 0) return res();
        setTimeout(res, ms);
      });

    const mkId = () => `line-${++lineCounter}`;

    // Chunked typewriter — batches chars per tick to keep the per-React-render
    // cost bounded. Target feel: 3 chars per tick at 12ms ≈ 250 chars/sec,
    // plenty fast but still reads like typing.
    const CHUNK = 3;
    const typewriteLine = async (text: string, kind: "prompt" | "claude", perCharMs: number) => {
      const id = mkId();
      setLines((prev) => [
        ...prev,
        kind === "prompt"
          ? { id, kind: "prompt", text: "", typing: true }
          : { id, kind: "claude", text: "", typing: true },
      ]);
      const tickMs = perCharMs * CHUNK;
      for (let i = CHUNK; i < text.length + CHUNK; i += CHUNK) {
        if (cancelled) return;
        const partial = text.slice(0, Math.min(i, text.length));
        setLines((prev) =>
          prev.map((ln) =>
            ln.id === id && (ln.kind === "prompt" || ln.kind === "claude")
              ? { ...ln, text: partial }
              : ln,
          ),
        );
        await sleep(tickMs);
      }
      setLines((prev) =>
        prev.map((ln) =>
          ln.id === id && (ln.kind === "prompt" || ln.kind === "claude")
            ? { ...ln, typing: false }
            : ln,
        ),
      );
    };

    // Stream plain output lines — append WHOLE line at once with a small
    // inter-line delay. Per-line rendering looks like a server spitting
    // lines out (which is exactly what streaming SSE looks like).
    const streamOutput = async (outputLines: string[], perCharMs: number) => {
      // perCharMs is treated as a per-line delay multiplier. Floor at 24ms
      // to avoid jank; cap feel under ~120ms so long outputs still cascade.
      const perLineMs = Math.min(120, Math.max(24, perCharMs * 8));
      for (const outLine of outputLines) {
        if (cancelled) return;
        const id = mkId();
        setLines((prev) => [...prev, { id, kind: "output", text: outLine }]);
        await sleep(perLineMs);
      }
    };

    (async () => {
      for (const step of TERMINAL_SCRIPT as readonly TerminalStep[]) {
        if (cancelled) return;
        // Pre-step pause
        if (step.ms) await sleep(step.ms);
        if (cancelled) return;

        switch (step.kind) {
          case "banner":
            setLines((prev) => [...prev, { id: mkId(), kind: "banner", text: step.text }]);
            break;
          case "pause":
            // already handled by step.ms
            break;
          case "prompt-type":
            await typewriteLine(step.text, "prompt", step.perCharMs ?? 28);
            break;
          case "claude-say":
            await typewriteLine(step.text, "claude", step.perCharMs ?? 18);
            break;
          case "tool-invoke": {
            const id = mkId();
            setLines((prev) => [...prev, { id, kind: "tool-pending", tool: step.tool }]);
            setToolCallCount((n) => n + 1);
            break;
          }
          case "tool-complete": {
            // Flip the last tool-pending for this tool into tool-done
            const d = step.durationMs;
            setLines((prev) => {
              const idx = [...prev]
                .reverse()
                .findIndex((l) => l.kind === "tool-pending" && l.tool === step.tool);
              if (idx === -1) return prev;
              const realIdx = prev.length - 1 - idx;
              const next = prev.slice();
              next[realIdx] = {
                id: next[realIdx].id,
                kind: "tool-done",
                tool: step.tool,
                durationMs: d,
              };
              return next;
            });
            // Bump the cost ticker for the completing tool
            const addCost =
              step.tool === "postmortem_query"
                ? 4.02
                : step.tool === "postmortem_impact"
                  ? 3.14
                  : 0.0005;
            setTotalCost((c) => c + addCost);
            break;
          }
          case "output-stream":
            await streamOutput(step.lines, step.perCharMs ?? 4);
            break;
          case "caption":
            setCaption(step.text);
            break;
          case "end":
            // Natural completion: if we arrived from the web demo (auto=1
            // or any demo flag live on the provider), let the provider
            // clean up URL + state. Otherwise just nav back.
            await sleep(1200);
            if (!cancelled) {
              if (auto || demo.state !== "idle") {
                demo.complete();
              } else {
                router.replace("/");
              }
            }
            break;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auto, router]);

  return (
    <div className="relative flex h-screen w-screen flex-col bg-[#0b0b0c] text-zinc-100">
      {/* Chrome — looks like a terminal / Claude Code window */}
      <div className="flex items-center gap-3 border-b border-zinc-800/80 bg-zinc-950/80 px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-zinc-500 backdrop-blur">
        <span className="flex gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
        </span>
        <span className="text-zinc-400">claude code — postmortem mcp</span>
        <span className="ml-auto flex items-center gap-3">
          <span>opus 4.7</span>
          <span className="tabular-nums text-[#d4a24c]">
            {toolCallCount} tool · ${totalCost.toFixed(4)}
          </span>
        </span>
      </div>

      {/* Scrollback */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto max-w-4xl space-y-1.5">
          {lines.map((ln) => {
            switch (ln.kind) {
              case "banner":
                return <BannerLine key={ln.id} text={ln.text} />;
              case "prompt":
                return <PromptLine key={ln.id} text={ln.text} typing={ln.typing} />;
              case "output":
                return <OutputLine key={ln.id} text={ln.text} />;
              case "claude":
                return <ClaudeLine key={ln.id} text={ln.text} typing={ln.typing} />;
              case "tool-pending":
                return <ToolPendingLine key={ln.id} tool={ln.tool} />;
              case "tool-done":
                return <ToolDoneLine key={ln.id} tool={ln.tool} durationMs={ln.durationMs} />;
              default:
                return null;
            }
          })}
        </div>
      </div>

      {/* Caption fade-in overlay */}
      <AnimatePresence>
        {caption ? (
          <motion.div
            key={caption}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
            transition={reduced ? { duration: 0 } : { duration: 0.6, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <span className="font-mono text-[17px] tracking-wide text-zinc-200">{caption}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
