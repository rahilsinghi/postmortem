# Postmortem MCP — terminal demo script

> 60–90 second terminal segment that can be spliced into or extended from
> the main 166-second web demo. Shows Postmortem running natively inside
> Claude Code as an MCP server — the "missing memory layer" narrative.

## Setup (one-time, before recording)

```bash
# 1. Backend dependencies installed (adds the mcp package)
cd backend && uv sync

# 2. Register the server with Claude Code
claude mcp add postmortem \
  --command 'uv run --project /Users/you/Desktop/postmortem/postmortem/backend \
             python -m app.mcp_server' \
  --transport stdio

# 3. Verify it's connected
claude mcp list
# → postmortem     connected     stdio
```

**Recording tip:** before rolling, run `claude mcp remove postmortem && claude mcp add …`
so the registration is visible in the first take. Judges get to see the
install flow happen live.

**Clear terminal state:** `clear` before each take; 24-row tall window;
bg: `#0b0b0c`; fg: `#f4f4f5`; cursor: amber `#d4a24c`; font: Berkeley Mono
or IBM Plex Mono 14pt; zsh prompt trimmed to just a `» ` glyph.

---

## The 5 terminal beats (target: 70s)

### Beat M1 — Install + verify (0:00 – 0:10)

Type live:

```bash
» claude mcp add postmortem --command 'uv run --project backend python -m app.mcp_server'
✓ added postmortem (stdio)

» claude mcp list
postmortem     connected     stdio     5 tools
```

**Voiceover (M1):**

> Postmortem ships as an M C P server. One command to register. Claude
> Code sees five new tools. [pause 300ms] Now your editor has a memory
> of every repo's architectural history.

### Beat M2 — Discover repos (0:10 – 0:18)

Type into Claude Code:

```
» claude "what postmortem ledgers are cached on this machine?"
```

**On screen:** Claude invokes `postmortem_list_repos`, which streams
back the markdown table. Claude summarises:

```
I see 6 ledgers totaling 155 decisions across ~$85 of ingestion spend —
hono is the deepest (59 decisions, 4-year span), vercel/next.js is the
freshest (33 decisions, April 2026).
```

**Voiceover (M2):**

> Claude now knows, across all of your repos, what architectural
> history exists — without you needing to open a browser tab.

### Beat M3 — Ask a question (0:18 – 0:40)

Type:

```
» claude "why does hono reject node:* modules in core?
          give me the reviewer's exact words."
```

**On screen:** Claude invokes `postmortem_query(repo="honojs/hono",
question="Why does Hono reject node:* modules in core?")`. After ~20s,
the full markdown answer streams into the terminal with citation tokens
rendered as colored brackets:

```
## Answer
Hono's core deliberately avoids node:* modules. The policy is stated
most directly by the maintainer: [PR #3813 inline, @yusukebe, 2025-01-09]

> "I think we should not use `node:*` modules in the core of `hono`.
> Actually, Buffer is not in Web Standards API."

The accepted fix widened c.body() to Uint8Array [PR #3813, @askorupskyy,
2025-01-09]; a related decision rejected node:crypto for streaming ETag
[PR #3604, @usualoma, 2024-10-31].

---
Self-check: all_verified — verified 11/11
Usage: input 476,834 · output 2,592 · cost $7.35
```

**Voiceover (M3):**

> Claude hands the question to Postmortem. Postmortem holds the full
> 59-decision ledger in one context and answers with citations —
> every claim traced back to the exact review thread. [pause 400ms]
> Self-check verifies all eleven citations against the ledger.

### Beat M4 — Impact ripple from the terminal (0:40 – 0:58)

Type:

```
» claude "what breaks if we relax that node:* ban at anchor PR 3813?
          show me the impact ripple."
```

**On screen:** Claude invokes `postmortem_impact`. Answer appears with
`Direct impact` / `Second-order impact` / `Safe to unwind` sections,
each citation linked.

**Voiceover (M4):**

> Impact-ripple mode, right from the terminal. Postmortem runs a
> breadth-first search across the decision graph, hands Opus just
> the affected slice, and traces the cascade.

### Beat M5 — Close (0:58 – 1:10)

Leave the final answer on screen. Cursor blinks at the prompt.

**Voiceover (M5):**

> Postmortem is not another app you context-switch into. [pause 300ms]
> It's infrastructure — a memory layer your existing tools can call.
> [pause 500ms] Code lives. Intent is a ghost. Postmortem summons it.

---

## Editing notes

- **Cursor styling:** use `iTerm2 → Profile → Text → Cursor` set to amber
  `#d4a24c`, shape: vertical bar. Blinking on.
- **Type speed:** 35-40 wpm (editor should slow down if the TTS is faster).
- **No background music during beats M3/M4** — the terminal text itself
  needs room. Quiet ambient pad only.
- **Zoom effect:** at the moment each citation token renders, quick push
  in on that bracket, then pull back. Editor-side (post-production).
- **Transition IN (from web demo):** the final "Code lives…" beat of the
  web demo fades to black. Hold 800ms. Then fade up on a clean terminal
  at the top of Beat M1.
- **Transition OUT:** fade to black. Final slate: "postmortem • m c p
  server • github.com/rahilsinghi/postmortem" held 2s.

## If splicing into the main video

The main 166s demo ends at 2:46 with the tagline fade. Appending the
MCP segment extends total runtime to ~3:50. Two options:

1. **Submit two videos** — main web demo (166s) for the "product" channel,
   MCP segment (70s) for the "developer tools" channel. Cerebral Valley
   allows multiple submission artifacts.
2. **Replace closing** — cut the web-demo's final 10s and stitch
   straight into Beat M1, giving a unified ~3:15 reel. The narrative
   becomes "here's what it does in the browser → and here it is in your
   terminal."

Option 2 is tighter. Option 1 gives more room to breathe.

## Fallback if the MCP segment breaks

If the MCP demo has any issue during recording (Claude Code unavailable,
tool execution fails, rate limit), fall back to the web demo alone. The
MCP story is a bonus, not a load-bearing beat.
