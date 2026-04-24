/**
 * Terminal demo script — ~30 seconds, the finale of the combined 3-minute reel.
 *
 * Structure:
 *   Beat 1 · Enter terminal, banner flashes, list the ledgers (0–10s)
 *   Beat 2 · Context line + ask the cited-answer query (10–14s)
 *   Beat 3 · MCP tool call streams the cited answer (14–27s)
 *   Beat 4 · Self-check confirmation + tagline + end (27–30s)
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
  // ── Beat 1 · Banner + list ledgers (0 – 10 s) ──────────────────────
  {
    kind: "banner",
    ms: 200,
    text: "Claude Code · Opus 4.7 · postmortem MCP connected (5 tools)",
  },
  { kind: "pause", ms: 1400 },
  {
    kind: "prompt-type",
    ms: 200,
    perCharMs: 30,
    text: 'claude "list postmortem ledgers"',
  },
  { kind: "pause", ms: 400 },
  { kind: "tool-invoke", ms: 200, tool: "postmortem_list_repos", estSeconds: 0.4 },
  { kind: "tool-complete", ms: 450, tool: "postmortem_list_repos", durationMs: 420 },
  {
    kind: "output-stream",
    ms: 200,
    perCharMs: 3,
    lines: [
      "| repo                     | decisions | range      | ingested |",
      "|--------------------------|----------:|------------|---------:|",
      "| honojs/hono              |        59 | 2022-2026  |   $31.87 |",
      "| pmndrs/zustand           |        41 | 2022-2025  |   $19.99 |",
      "| vercel/next.js           |        33 | 2026-2026  |   $22.50 |",
      "| rahilsinghi/postmortem   |         6 | 2026-2026  |    $1.89 |",
    ],
  },
  { kind: "pause", ms: 400 },

  // ── Beat 2 · Context + ask the hero question (10 – 14 s) ───────────
  {
    kind: "claude-say",
    ms: 0,
    perCharMs: 16,
    text: "Six ledgers, ~$85 total. hono is the deepest — 59 decisions, 4 years.",
  },
  { kind: "pause", ms: 1200 },
  {
    kind: "prompt-type",
    ms: 300,
    perCharMs: 28,
    text: 'claude "why does hono reject node:* modules in core?"',
  },
  { kind: "pause", ms: 400 },

  // ── Beat 3 · Streamed cited answer (14 – 27 s) ─────────────────────
  { kind: "tool-invoke", ms: 200, tool: "postmortem_query", estSeconds: 12 },
  { kind: "pause", ms: 2200 },
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
      '  > "we should not use `node:*` modules in the core of `hono`.',
      '  >  Actually, `Buffer` is not in Web Standards API."',
      "",
      "The accepted fix widened c.body() to Uint8Array [PR #3813,",
      "@askorupskyy]. Same policy rejected node:crypto for streaming",
      "ETag in favor of crypto.subtle [PR #3604, @usualoma].",
    ],
  },
  { kind: "tool-complete", ms: 200, tool: "postmortem_query", durationMs: 11600 },
  { kind: "pause", ms: 900 },

  // ── Beat 4 · Self-check + open a decision (22 – 29 s) ──────────────
  {
    kind: "claude-say",
    ms: 0,
    perCharMs: 16,
    text: "Self-check: 11 of 11 citations verified. $4.02.",
  },
  { kind: "pause", ms: 900 },
  {
    kind: "prompt-type",
    ms: 300,
    perCharMs: 26,
    text: 'claude "open PR 3813 in hono"',
  },
  { kind: "pause", ms: 400 },
  {
    kind: "tool-invoke",
    ms: 200,
    tool: "postmortem_open_decision",
    estSeconds: 0.3,
  },
  { kind: "tool-complete", ms: 500, tool: "postmortem_open_decision", durationMs: 320 },
  {
    kind: "output-stream",
    ms: 200,
    perCharMs: 4,
    lines: [
      "# Accept Uint8Array (not node:buffer Buffer) in c.body()",
      "`honojs/hono` · PR #3813 · api_contract",
      "",
      "## Rejected alternatives (2)",
      "- ~~Import Buffer from node:buffer in c.body()~~",
      '  > we should not use node:* modules in the core of hono.',
      "- ~~Keep c.body() narrowly typed to string~~",
      "  > users legitimately need to return binary responses.",
    ],
  },
  { kind: "pause", ms: 800 },

  // ── Beat 5 · Tagline + end (29 – 32 s) ─────────────────────────────
  {
    kind: "caption",
    ms: 0,
    text: "one tool. every architectural decision. cited.",
  },
  { kind: "pause", ms: 1800 },
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
