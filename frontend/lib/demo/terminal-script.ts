/**
 * Terminal demo script — ~30 seconds, the finale of the combined 3-minute reel.
 *
 * Structure:
 *   Beat 1 · Enter terminal, banner flashes (0–5s)
 *   Beat 2 · One MCP tool call: cited answer streams (5–25s)
 *   Beat 3 · Tagline + end (25–30s)
 *
 * Each step is one primitive rendered into the terminal emulator. Timing is
 * relative (in ms) to the previous step's end. Typewriter + stream reveal
 * add real on-screen time on top of `ms`; `approximateScriptMs()` estimates
 * the total so the parent UI can budget its playback.
 */

export type TerminalStep =
  | { kind: "banner"; ms: number; text: string }
  | { kind: "pause"; ms: number }
  | { kind: "prompt-type"; ms: number; text: string; perCharMs?: number }
  | { kind: "tool-invoke"; ms: number; tool: string; estSeconds?: number }
  | { kind: "tool-complete"; ms: number; tool: string; durationMs: number }
  | { kind: "output-stream"; ms: number; lines: string[]; perCharMs?: number }
  | { kind: "claude-say"; ms: number; text: string; perCharMs?: number }
  | { kind: "caption"; ms: number; text: string }
  | { kind: "end"; ms: number };

export const TERMINAL_SCRIPT: readonly TerminalStep[] = [
  // ── Beat 1 · Enter terminal (0 – 5 s) ──────────────────────────────
  {
    kind: "banner",
    ms: 200,
    text: "Claude Code · Opus 4.7 · postmortem MCP connected (5 tools)",
  },
  { kind: "pause", ms: 1200 },
  {
    kind: "prompt-type",
    ms: 200,
    perCharMs: 22,
    text: 'claude "why does hono reject node:* modules in core?"',
  },
  { kind: "pause", ms: 200 },

  // ── Beat 2 · Tool call + streamed answer (5 – 25 s) ────────────────
  { kind: "tool-invoke", ms: 200, tool: "postmortem_query", estSeconds: 17 },
  { kind: "pause", ms: 1600 },
  {
    kind: "output-stream",
    ms: 200,
    perCharMs: 5,
    lines: [
      "## Answer",
      "",
      "Hono's core avoids node:* modules by policy. The maintainer:",
      "",
      "  [PR #3813 inline, @yusukebe, 2025-01-09]",
      '  > "we should not use `node:*` modules in the core of `hono`."',
      "",
      "The accepted fix widened c.body() to Uint8Array [PR #3813,",
      "@askorupskyy]. Same policy rejected node:crypto for streaming",
      "ETag in favor of crypto.subtle [PR #3604, @usualoma].",
    ],
  },
  { kind: "tool-complete", ms: 200, tool: "postmortem_query", durationMs: 17200 },
  { kind: "pause", ms: 500 },
  {
    kind: "claude-say",
    ms: 0,
    perCharMs: 14,
    text: "Self-check: 11 of 11 citations verified. $4.02.",
  },

  // ── Beat 3 · Tagline + end (25 – 30 s) ─────────────────────────────
  { kind: "pause", ms: 1200 },
  {
    kind: "caption",
    ms: 0,
    text: "one tool. every architectural decision. cited.",
  },
  { kind: "pause", ms: 1600 },
  { kind: "end", ms: 0 },
];

/** Total scripted duration in ms — sum of each step's `ms` + any per-step
 * reveal duration (typewriter / stream). We under-count stream duration
 * since character speeds differ; callers should read the actual clock. */
export function approximateScriptMs(): number {
  let total = 0;
  for (const s of TERMINAL_SCRIPT) {
    total += s.ms ?? 0;
    // Factor in typewriter + stream character counts
    if ("text" in s && "perCharMs" in s && s.perCharMs) {
      total += (s.text?.length ?? 0) * s.perCharMs;
    }
    if (s.kind === "output-stream") {
      const chars = s.lines.reduce((n, ln) => n + ln.length + 1, 0);
      total += chars * (s.perCharMs ?? 4);
    }
  }
  return total;
}
