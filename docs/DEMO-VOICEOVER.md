# Demo voiceover script — 3-minute combined reel

> Maps every second of the ~3:00 combined demo (web autoplay + terminal
> finale) to voiceover lines, music cues, and zoom recommendations. The
> web segment is driven by `frontend/lib/demo/timeline.ts` (20 cues,
> 120 s). The terminal segment is `frontend/lib/demo/terminal-script.ts`
> (~72 s). One click plays both continuously.

**Voice recommendation (ElevenLabs):** editorial, measured, confident.
Rachel or Dave from the default voice library. Stability ~60, Clarity ~75,
Style exaggeration low.

**Pronunciation glossary for the TTS engine:**
- "MCP" → `M C P`
- "SSE" → `S S E`
- "PR" → `P R`
- "SDK" → `S D K`
- "CVA" → `C V A`
- "Opus four point seven"
- "*hono*" → `HO-no` (short 'o' both syllables, not "hoh-no")
- "*zustand*" → `ZOO-stond` (German; 'z' is a sharp z)
- "node:*" → "node dot star"
- "$31.87" → "thirty-one dollars eighty-seven cents"
- "Uint8Array" → "you-int eight array"

**SSML hints:** periods for hard stops, commas for soft breaks. Where
I've marked `[pause 400ms]`, insert two spaces after a period, or use
`<break time="400ms" />` if your engine supports SSML.

---

## Section A — Web demo (0:00 – 2:00, 120 s)

### Cue 1 — Gallery intro (0:00 – 0:04)

- **On screen:** amber `▶ Play the Postmortem demo` card pulses; secondary
  MCP card visible below it
- **Music:** low ambient drone entering
- **Zoom:** wide shot of the gallery
- **Voice:**

> Engineers spend a third of their time reverse-engineering why code is
> the way it is. [pause 300ms] The answers rarely live in the code.

### Cue 2 — Hero click (0:04 – 0:06)

- **On screen:** loading state, URL stamps with play flag
- **Music:** first synth pulse
- **Voice:**

> They live in P R reviews and the heads of engineers who've moved on.

### Cue 3 — Nav to /ingest (0:06 – 0:08)

- **On screen:** route transition
- **Voice:** [silent]

### Cue 4 — Form typewriter (0:08 – 0:13)

- **On screen:** repo, limit, min-discussion fields typed
- **Zoom:** push in on the form
- **Voice:**

> Paste any public GitHub repo. Opus four point seven takes it from here.

### Cue 5 — Submit click (0:13 – 0:15)

- **On screen:** submit amber-pulse, LISTING pill activates
- **Music:** beat drops — rising pulse
- **Voice:** [silent]

### Cue 6 — Classify + Extract stream (0:15 – 0:33)

- **On screen:** 68 classifier pills flow into the left column, 33
  extractor cards pop in on the right, cost counter climbs
- **Music:** driving pulse; sync to the card pops
- **Zoom:** alternate between the two columns; occasional push on an
  extractor card as it lands
- **Voice:**

> Every merged P R through a classifier. Every accepted decision through
> an extractor. [pause 300ms] Every rationale, every rejected alternative,
> cited to the exact reviewer comment that supports it.

### Cue 7 — Persisting + Stitching (0:33 – 0:38)

- **On screen:** PERSISTING + STITCHING EDGES pills
- **Music:** pulse steps down
- **Voice:**

> Stitched into a graph in under a minute. Eleven dollars of model spend.

### Cue 8 — Done pill (0:38 – 0:40)

- **On screen:** DONE pill lights, OPEN LEDGER pulses
- **Voice:** [silent]

### Cue 9 — Nav to ledger (0:40 – 0:42)

- **On screen:** transition to `/ledger/honojs/hono`
- **Music:** cinematic swell begins
- **Zoom:** pull wide
- **Voice:** [silent — let music carry]

### Cue 10 — Graph entrance (0:42 – 0:45)

- **On screen:** 59 hono decision nodes + 27 edges fade in chronologically
- **Music:** swell resolves to a held note
- **Voice:**

> Four years of hono's architectural history. Fifty-nine decisions.

### Cue 11 — Time Machine autoplay (0:45 – 0:53)

- **On screen:** scrubber rewinds to 2022, plays forward at ten-times
  speed; past-state tinted slate, present amber
- **Music:** cinematic theme blooms
- **Zoom:** push on the scrubber then pull out as nodes bloom
- **Voice:**

> Compressed to eight seconds. Every fade-in is a real merge date.

### Cue 12 — Click node #4291 (0:53 – 0:58)

- **On screen:** #4291 pulses; side panel slides in, rejected alternatives
  first, then full rationale
- **Music:** quiet undercurrent
- **Zoom:** close on the alternatives block
- **Voice:**

> Every decision carries its rationale plus every alternative that was
> rejected — and why.

### Cue 13 — Click node #3813 (0:58 – 1:04)

- **On screen:** #3813 opens; side panel updates
- **Voice:**

> The content no static analyzer can reach: the roads not taken.

### Cue 14 — Typewriter question (1:04 – 1:07)

- **On screen:** question types into ask panel
- **Music:** electronic shimmer
- **Voice:**

> Now ask a question the code itself can't answer.

### Cue 15 — Answer streams + X-Ray (1:07 – 1:29)

- **On screen:** answer streams with citations; Reasoning X-Ray below
  shows cyan scan-line + trace lines (loading ledger, scanning, resolved
  citation, verified)
- **Music:** cyan shimmer over the undercurrent; subtle digital tick per
  trace line
- **Zoom:** close on the X-Ray panel, pan up to the answer as citations
  light
- **Voice:**

> Opus holds the full ledger in one context. The cyan trace is real
> reasoning timing. The amber lines are real citations firing as the
> answer names them. [pause 400ms] Every claim verified in a second pass.

### Cue 16 — Hover citation (1:29 – 1:33)

- **On screen:** Provenance Peek unfurls — drop-cap quote, attribution
  chip, related-claims footer
- **Zoom:** tight on the drop-cap
- **Voice:**

> Every citation is the reviewer's actual words. Verbatim.

### Cue 17 — Click citation — Follow the Thread (1:33 – 1:39)

- **On screen:** graph spring-pans to P R 3813; anchor pulses; kin nodes
  soft-tint
- **Music:** rising note as camera pans
- **Zoom:** pull back as graph re-centers
- **Voice:**

> Citations aren't text. They're a map.

### Cue 18 — Impact query + mode toggle (1:39 – 1:42)

- **On screen:** mode toggles, impact question types in
- **Voice:** [silent]

### Cue 19 — Impact stream (1:42 – 1:56)

- **On screen:** subgraph glows amber; impact answer streams with Direct
  / Second-order / Safe-to-unwind sections
- **Music:** main motif darker variant
- **Zoom:** alternate subgraph + impact answer
- **Voice:**

> Impact Ripple runs a breadth-first search from the anchor and traces
> the cascade — in the slice of the ledger that matters.

### Cue 20 — Transition to terminal (1:56 – 2:00)

- **On screen:** brief fade, route transition to `/demo/terminal`
- **Music:** resolve on the web-demo theme, 500ms breath before the
  terminal ambient layer enters
- **Voice:**

> Now, inside your editor.

---

## Section B — Terminal demo (2:00 – 3:12, ~72 s)

Timing is approximate — terminal script runs on its own animation clock;
actual wall-time is ~70-75 s depending on per-character rendering. Aim
voiceover to land a second or two before each beat's action. If the
terminal lags, voiceover naturally overlaps; viewer gets a tighter cut.

### Beat T1 — Banner + first prompt (2:00 – 2:04)

- **On screen:** terminal chrome appears, amber "● Claude Code · Opus
  4.7 · postmortem MCP connected (5 tools)" banner fades in
- **Music:** ambient pad, very quiet
- **Zoom:** wide shot on the terminal
- **Voice:**

> Postmortem ships as an M C P server. One command to register.
> Claude Code sees five new tools.

### Beat T2 — List ledgers (2:04 – 2:18)

- **On screen:** user types `claude "list postmortem ledgers"` → tool
  pill flashes "invoking postmortem_list_repos" → ✓ 420ms → markdown
  table streams in → Claude summarises
- **Music:** ambient holds, no drums
- **Zoom:** close on the markdown table rows as they land
- **Voice:**

> Claude now knows, across every repo, what architectural history exists.
> No browser tab required.

### Beat T3 — Ask a question (2:18 – 2:46)

- **On screen:** `claude "why does hono reject node:* modules in core?"`
  → `invoking postmortem_query…` spinner → 18.4s tool duration rendered
  → answer streams with amber citation brackets `[PR #3813, @yusukebe,
  2025-01-09]` glowing as each first renders
- **Music:** subtle cyan shimmer layer
- **Zoom:** when each citation bracket appears, quick push → pull (your
  post-production layer)
- **Voice:**

> The tool hands the question to Postmortem. Postmortem holds the full
> 59-decision ledger in one context and answers with citations —
> verbatim, traced. [pause 400ms] All eleven citations verified against
> the ledger.

### Beat T4 — Open a decision (2:46 – 2:58)

- **On screen:** `claude "open PR 3813 in hono"` → rationale + rejected
  alternatives block streams
- **Music:** continues ambient
- **Zoom:** focus on the strikethrough "Rejected alternatives" list
- **Voice:**

> Every rejected alternative cited to the reviewer quote that killed it.

### Beat T5 — Close caption (2:58 – 3:12)

- **On screen:** overlay fades in — "one tool. every architectural
  decision. cited." → back to gallery
- **Music:** resolve; final note sustains, fades
- **Voice:**

> Postmortem is not another app you context-switch into. [pause 300ms]
> It is infrastructure — a memory layer your existing tools can call.
> [pause 500ms] Code lives. [pause 500ms] Intent is a ghost.
> [pause 500ms] Postmortem summons it.

---

## Music direction

- **Palette:** dark ambient + subtle electronic pulses. Not blockbuster
  cinematic. Think *Nine Inch Nails' Ghosts* meets *Trent Reznor's
  Social Network* opener.
- **BPM:** ~80 through the middle; rises to ~100 during Time Machine
  and Impact Ripple; settles back for the terminal ambient layer.
- **Structure:** A-theme (web ingest, 0:00-0:38), B-theme (web graph
  reveal + Time Machine, 0:40-1:04, emotional peak), undercurrent
  (web query + peek + thread, 1:04-1:56), handoff breath (1:56-2:04),
  ambient pad (terminal, 2:04-2:58), resolve (closing tagline, 2:58-3:12).
- **Drops:** at 0:15 (stream begins), 0:42 (nav to ledger), 1:07 (answer
  streams), 2:04 (terminal boots — low, not grand).

## Recording workflow

1. Generate each voice block in ElevenLabs per this doc — one audio
   file per cue so each aligns separately in the editor.
2. Screen-record a 200-second capture (leave buffer) at 60 fps, 1440×900,
   cursor hidden. Backend can be off — it's cold-boot capable.
3. Click the primary `▶ Play the Postmortem demo` card. The full 3-min
   flow runs uninterrupted.
4. Edit: layer voice + music. Add zoom / push-in effects per each cue's
   **Zoom** note.
5. Color grade: crush blacks; preserve amber at 6% warm; cyan a touch
   cooler than the screen default.
6. Export H.264, 1080p, AAC 256 kbps.

## If a beat runs long

Combined nominal is ~3:12 in testing. To trim down to 3:00 flat:
- Skip Beat T4's claude-say (“Every rejected alternative…”) — saves ~3 s
- Shorten Cue 15 monologue to its first two sentences — saves ~4 s
- Cut the tagline pauses from 500 ms to 300 ms — saves ~1 s
- Remove the "Now, inside your editor" line at Cue 20 — saves ~2 s

## Approximate spoken duration per cue

| Section | Cue / Beat | Window | Spoken words | Secs |
|---|---|---:|---:|---:|
| A | Cue 1 | 4s | 24 | 9 |
| A | Cue 2 | 2s | 14 | 5 |
| A | Cue 4 | 5s | 13 | 5 |
| A | Cue 6 | 18s | 31 | 12 |
| A | Cue 7 | 5s | 13 | 5 |
| A | Cue 10 | 3s | 9 | 3 |
| A | Cue 11 | 8s | 12 | 4 |
| A | Cue 12 | 5s | 17 | 6 |
| A | Cue 13 | 6s | 12 | 4 |
| A | Cue 14 | 3s | 9 | 3 |
| A | Cue 15 | 22s | 42 | 16 |
| A | Cue 16 | 4s | 8 | 3 |
| A | Cue 17 | 6s | 9 | 3 |
| A | Cue 19 | 14s | 29 | 11 |
| A | Cue 20 | 4s | 4 | 1 |
| B | T1 | 4s | 22 | 8 |
| B | T2 | 14s | 21 | 8 |
| B | T3 | 28s | 37 | 14 |
| B | T4 | 12s | 12 | 4 |
| B | T5 | 14s | 30 | 11 |

Across cues most voice fits inside each window; cue 15 + T3 are tight
but intentionally overlap a touch into the next beat.
