/**
 * Terminal demo script — 5 beats, ~70 seconds.
 *
 * Each step is one primitive rendered into the terminal emulator. Timing is
 * relative (in ms) to the previous step's end. The total budget is ~70 s;
 * rough padding covers typewriter keystrokes + stream reveal.
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
  // ── Beat 1 · Banner + prompt ready (0 – 3 s) ────────────────────────
  {
    kind: "banner",
    ms: 200,
    text: "Claude Code · Opus 4.7 · postmortem MCP connected (5 tools)",
  },
  { kind: "pause", ms: 1800 },

  // ── Beat 2 · List ledgers (4 – 16 s) ────────────────────────────────
  {
    kind: "prompt-type",
    ms: 400,
    text: 'claude "list postmortem ledgers"',
    perCharMs: 28,
  },
  { kind: "pause", ms: 500 },
  {
    kind: "tool-invoke",
    ms: 200,
    tool: "postmortem_list_repos",
    estSeconds: 0.4,
  },
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
      "| shadcn-ui/ui             |        15 | 2024-2026  |    $7.21 |",
      "| rahilsinghi/postmortem   |         6 | 2026-2026  |    $1.89 |",
      "| supabase/supabase        |         1 | 2026-2026  |    $1.57 |",
    ],
  },
  { kind: "pause", ms: 400 },
  {
    kind: "claude-say",
    ms: 0,
    perCharMs: 14,
    text: "Six ledgers, ~$85 total. hono is the deepest — 59 decisions, 4 years.",
  },
  { kind: "pause", ms: 600 },

  // ── Beat 3 · Ask a question (16 – 46 s) ────────────────────────────
  {
    kind: "prompt-type",
    ms: 400,
    perCharMs: 28,
    text: 'claude "why does hono reject node:* modules in core?"',
  },
  { kind: "pause", ms: 400 },
  { kind: "tool-invoke", ms: 200, tool: "postmortem_query", estSeconds: 18 },
  { kind: "pause", ms: 2200 },
  {
    kind: "output-stream",
    ms: 200,
    perCharMs: 6,
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
  { kind: "tool-complete", ms: 200, tool: "postmortem_query", durationMs: 18400 },
  { kind: "pause", ms: 600 },
  {
    kind: "claude-say",
    ms: 0,
    perCharMs: 14,
    text: "Self-check: 11 of 11 citations verified. $4.02.",
  },
  { kind: "pause", ms: 1000 },

  // ── Beat 4 · Open a decision (46 – 62 s) ───────────────────────────
  {
    kind: "prompt-type",
    ms: 400,
    perCharMs: 28,
    text: 'claude "open PR 3813 in hono"',
  },
  { kind: "pause", ms: 500 },
  {
    kind: "tool-invoke",
    ms: 200,
    tool: "postmortem_open_decision",
    estSeconds: 0.3,
  },
  { kind: "tool-complete", ms: 350, tool: "postmortem_open_decision", durationMs: 320 },
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
      "  > we should not use node:* modules in the core of hono.",
      "- ~~Keep c.body() narrowly typed to string~~",
      "  > users legitimately need to return binary responses.",
    ],
  },
  { kind: "pause", ms: 800 },

  // ── Beat 5 · Close (62 – 70 s) ─────────────────────────────────────
  {
    kind: "claude-say",
    ms: 0,
    perCharMs: 14,
    text: "Every rejected alternative — cited to the reviewer quote that killed it.",
  },
  { kind: "pause", ms: 1600 },
  { kind: "caption", ms: 0, text: "one tool. every architectural decision. cited." },
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
