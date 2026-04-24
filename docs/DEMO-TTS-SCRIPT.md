# Postmortem — Demo Voiceover Script

**Runtime:** 3 minutes 3 seconds (153s web + ~30s terminal)
**Delivery style:** calm, measured, confident — low-key product narrator, not a trailer voice. Slight downward inflection on technical terms. No exclamation.
**Recommended TTS voice:** ElevenLabs `Brian` / `Rachel` or any "narrator" preset at **~155 wpm** with 450–500 ms sentence pauses.
**Pronunciations:** *Hono* = "HOE-no" · *Opus 4.7* = "opus four seven" · *@yusukebe* = "yoo-soo-KAY-bay" · *DuckDB* = "duck dee bee" · *SSE* = "ess ess ee".

The reel plays as one continuous track — the narrator never addresses the viewer ("you'll see"), only describes what is happening. Leave 400–600 ms of silence between every paragraph below; pace per beat is what the visuals need, not what the word count permits.

---

## Part 1 · Web reel (0:00 – 2:33)

### 0:00 – 0:06 · Gallery intro

> Every codebase has a graveyard of architectural decisions nobody can explain anymore.

### 0:06 – 0:15 · Navigate to ingest, type the form

> Postmortem reads a repo's full pull-request history — reviews, debates, rejected ideas — and turns it into a queryable ledger.

### 0:15 – 0:40 · Classifier + extractor streaming

> Opus 4.7 classifies every pull request, then extracts a structured rationale for the ones that are real architectural decisions. Each claim is tied to a reviewer's verbatim quote — no paraphrase, no fabrication.

### 0:40 – 0:55 · Ledger + Time Machine

> The result is the ledger. This one is honojs hono — fifty-nine decisions, seven hundred fifty citations, four years of architecture. Scrub the timeline, and the graph rebuilds itself chronologically.

### 0:55 – 1:20 · Ask + Reasoning X-Ray

> Ask in plain English. Opus 4.7 holds the entire ledger in its one-million-token context, reasons adaptively — those cyan lines are the model's own thinking tokens surfacing live — and returns a cited answer. A second pass verifies every citation against the ledger before the answer is trusted.

### 1:20 – 1:35 · Impact Ripple

> Impact Ripple traces the blast radius of a change across the supersedes graph. Ask what breaks if an assumption moves, and Opus walks the ledger's own edges to find out.

### 1:35 – 1:53 · Conflict Finder

> The Conflict Finder scans the full ledger for decisions that quietly contradict each other. Four surfaced here — including type performance versus correctness, where the same maintainer took opposite sides in two separate pull requests, two years apart.

### 1:53 – 2:28 · Ghost Interview

> Ghost Interview summons a maintainer. Pick one of the eight most-cited contributors — here, @yusukebe, fifty-nine authored decisions, two hundred ninety-two quoted lines of his own reviews. Opus speaks in his register and answers six scripted questions entirely from his own verbatim quotes. Every sentence is either a direct quote, or openly marked as paraphrase.

### 2:28 – 2:33 · Hand-off

> And it's also a Claude Code MCP server.

---

## Part 2 · Terminal reel (2:33 – 3:03)

### 2:33 – 2:43 · Banner + list repos

> Five tools, one connection. List every ledger — six repos, roughly eighty-five dollars ingested so far.

### 2:43 – 2:57 · Query

> Ask the same question inside the editor. Opus 4.7 calls postmortem_query, streams the cited answer, runs the self-checker — eleven of eleven citations verified.

### 2:57 – 3:03 · Open decision + closer

> Open any decision and the rejected alternatives come with the reviewer quotes that killed them. One tool. Every architectural decision. Cited.

---

## Production notes

- **Silence budgets** — the word counts are loose. If a line finishes ahead of its visual, hold silence, don't re-pace to fill. The music bed carries the quiet.
- **Accents** — none strong; prefer a neutral American narrator voice. If using ElevenLabs, avoid the "storyteller" preset (too much rise-fall). `stability=0.45`, `similarity=0.72` on Brian has landed well on test mixes.
- **Mastering** — voiceover sits at –18 LUFS, music bed at –26 LUFS. Duck music under every narration block by –6 dB, release 400 ms.
- **If the web reel runs long** — cut the Impact Ripple line first (it is the weakest standalone beat on video). Do NOT cut Ghost Interview or Conflict Finder; they are the two shipping-differentiating features.
- **Terminal captions** already burn on-screen from the script — narration at this point complements the visible text, it does not duplicate it word-for-word.

---

## Quick word count

| Segment | Words | Seconds | Effective wpm |
|---|--:|--:|--:|
| Gallery intro | 11 | 6 | 110 |
| Ingest setup | 19 | 9 | 127 |
| Classifier + extractor | 32 | 25 | 77 |
| Ledger + Time Machine | 29 | 15 | 116 |
| Ask + Reasoning X-Ray | 51 | 25 | 122 |
| Impact Ripple | 30 | 15 | 120 |
| Conflict Finder | 42 | 18 | 140 |
| Ghost Interview | 63 | 35 | 108 |
| Hand-off | 8 | 5 | 96 |
| **Web subtotal** | **285** | **153** | **112** |
| Terminal — list | 17 | 10 | 102 |
| Terminal — query | 22 | 14 | 94 |
| Terminal — open + closer | 23 | 6 | 230 |
| **Terminal subtotal** | **62** | **30** | **124** |
| **Total** | **347** | **183** | **114 wpm** |

Sub-130 wpm average leaves natural silence between beats — the reel's pacing is visual-first.
