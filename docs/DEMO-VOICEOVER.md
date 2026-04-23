# Demo voiceover script — ElevenLabs TTS + video editor handoff

> Maps every second of the 166-second demo-layer autoplay to voiceover
> lines, music cues, and zoom recommendations. Each row is one cue from
> `frontend/lib/demo/timeline.ts`.

**Voice recommendation (ElevenLabs):** editorial, measured, confident — not
breathy. Rachel or Dave from the default voice library work. Stability ~60,
Clarity ~75. Style exaggeration low.

**Pronunciation glossary for the TTS engine:**
- "SSE" → spell out as `S S E`
- "PR" → `P R`
- "SDK" → `S D K`
- "CVA" → `C V A`
- "Opus four point seven"
- "*hono*" → `HO-no` (short 'o' both syllables, not "hoh-no")
- "*zustand*" → `ZOO-stond` (German origin; 'z' is a sharp z)
- "node:*" → "node dot star"
- "$31.87" → "thirty-one dollars eighty-seven cents"

**SSML hints:** ElevenLabs respects punctuation for pauses. Use periods for
hard stops, commas for soft breaks. Where I've marked `[pause 400ms]`, insert
two spaces after a period, or use `<break time="400ms" />` if the engine
supports SSML.

---

## The track — cue-by-cue

### Cue 1 — Gallery intro (0:00 – 0:05)

- **On screen:** amber `▶ Play the Postmortem demo` card, pulsing
- **Music:** low ambient drone entering, barely there
- **Zoom:** wide shot of the whole gallery
- **Voice:**

> Engineers spend a third of their time reverse-engineering why code
> is the way it is. [pause 400ms] The answers almost never live in
> the code.

### Cue 2 — Hero click (0:05 – 0:08)

- **On screen:** caption "» loading hermes-agent + hono fixtures" (ignore this — was a draft caption)
- **Music:** ambient continues
- **Zoom:** push in slightly toward the hero card
- **Voice:**

> They live in P R reviews, issue threads, and the heads of engineers
> who've moved on.

### Cue 3 — Nav to /ingest (0:08 – 0:10)

- **On screen:** route transition
- **Music:** first synth pulse
- **Zoom:** brief cut / pull back
- **Voice:** [silent — let the music breathe]

### Cue 4 — Ingest form typewriter (0:10 – 0:16)

- **On screen:** typewriter fills repo name, limit, min-discussion
- **Music:** continues low
- **Zoom:** in on the form
- **Voice:**

> Postmortem reads that buried intent layer. [pause 300ms] Paste any
> public GitHub repo.

### Cue 5 — Submit clicks (0:16 – 0:18)

- **On screen:** amber ring-pulse on submit, then LISTING pill activates
- **Music:** first real beat drops — a rising pulse
- **Zoom:** pull back to show the full page
- **Voice:**

> Opus four point seven reads every merged P R, every review thread,
> every linked issue.

### Cue 6 — Classify + Extract stream (0:18 – 0:43)

- **On screen:** 68 classifier pills flowing into the left column, 33
  extractor cards popping in on the right, cost counter climbing
- **Music:** driving pulse, sync to the card pops if possible — crescendo
  through the segment
- **Zoom:** split between the two columns; occasional push on an extractor
  card as it lands
- **Voice:** [mostly let the stream speak — one short beat at ~0:30]

> Classifier filters out the noise. Every architectural decision goes
> to an extractor that records its rationale, its forces, its
> consequences — [pause 400ms] and every alternative that was
> rejected, cited back to the exact reviewer.

### Cue 7 — Persisting + Stitching (0:43 – 0:50)

- **On screen:** PERSISTING pill activates, then STITCHING EDGES
- **Music:** pulse steps down, calmer
- **Zoom:** pull back; KPI tiles in frame
- **Voice:**

> Stitched into a graph in under a minute. [pause 200ms] Ten dollars of
> model spend. No hand-labeling.

### Cue 8 — Done pill (0:50 – 0:52)

- **On screen:** DONE pill lights, OPEN LEDGER link amber-pulses
- **Music:** brief hold
- **Zoom:** quick focus on the amber pulse
- **Voice:** [silent]

### Cue 9 — Nav to ledger (0:52 – 0:54)

- **On screen:** transition to `/ledger/honojs/hono`
- **Music:** cinematic swell begins
- **Zoom:** pull wide for the reveal
- **Voice:** [silent — the music does the work]

### Cue 10 — Graph entrance (0:54 – 0:58)

- **On screen:** 59 hono decision nodes + 27 edges fade in chronologically
- **Music:** swell continues, resolves to a held note
- **Zoom:** wide shot of the whole graph
- **Voice:**

> Four years of hono's architectural history. [pause 200ms] Fifty-nine
> decisions, two hundred thirty-six citations, twenty-seven edges.

### Cue 11 — Time Machine autoplay (0:58 – 1:10)

- **On screen:** scrubber rewinds to 2022, then plays forward at ten-times
  speed; nodes fade in at their real merge dates; past-state tinted slate,
  present amber
- **Music:** cinematic theme blooms into its main motif
- **Zoom:** push in slightly on the scrubber rail, then out as nodes bloom
- **Voice:**

> Three years of decisions, compressed to twelve seconds. Every
> fade-in is a real merge date. Nothing synthetic.

### Cue 12 — Click node #4291 (1:10 – 1:18)

- **On screen:** node #4291 pulses, side panel slides in showing the
  rejected alternatives first, then the full rationale
- **Music:** drops to quiet undercurrent
- **Zoom:** close in on the side panel's alternatives block
- **Voice:**

> Every decision carries its rationale — quoted verbatim from the P R
> comment that supports it — plus every alternative that was rejected,
> and why.

### Cue 13 — Click node #3813 (1:18 – 1:26)

- **On screen:** node #3813 opens; side panel updates to the Buffer-rejection
  decision
- **Music:** continues quiet
- **Zoom:** brief push on the amber strikethrough
- **Voice:**

> This is the content no static analyzer can reach — [pause 300ms]
> the roads not taken.

### Cue 14 — Typewriter question (1:26 – 1:30)

- **On screen:** question types into the ask panel's textarea
- **Music:** electronic shimmer enters
- **Zoom:** in on the textarea
- **Voice:**

> Now we ask a question the code itself can't answer.

### Cue 15 — Answer streams + Reasoning X-Ray (1:30 – 2:00)

- **On screen:** answer streams word by word; below, the cyan Reasoning
  X-Ray scan-line progresses; trace lines type in with real timestamps —
  loading ledger, scanning categories, resolved citation → P R 3813 —
  and finally verified
- **Music:** cyan shimmer layer overlaps the undercurrent; subtle digital
  tick per trace line if possible
- **Zoom:** close on the X-Ray panel first, then pan up to the answer as
  citations light up inline
- **Voice:**

> Opus four point seven holds the entire ledger in one context.
> [pause 300ms] The cyan trace is the reasoning, timing-accurate —
> not simulated. [pause 300ms] The amber lines are real citations,
> firing the moment the answer names them. [pause 500ms] Every
> claim gets a verdict in the second pass — all eleven citations,
> verified against the ledger.

### Cue 16 — Hover citation → Provenance Peek (2:00 – 2:05)

- **On screen:** Provenance Peek card unfurls — amber drop-cap, italic
  serif quote, attribution chip, related-claims footer
- **Music:** brief hush
- **Zoom:** tight on the drop-cap
- **Voice:**

> Every citation is the actual reviewer's words. [pause 300ms] Verbatim.

### Cue 17 — Click citation → Follow the Thread (2:05 – 2:13)

- **On screen:** graph camera spring-pans to P R 3813; it pulses amber;
  four kin nodes softly tint
- **Music:** rising note as the camera pans
- **Zoom:** pull back as the graph re-centers
- **Voice:**

> Citations aren't just text. They're a map. [pause 300ms] One click
> turns the graph into a view of that decision's kin.

### Cue 18 — Impact query typed + mode toggle (2:13 – 2:17)

- **On screen:** mode toggles to "impact ripple"; new question types in
- **Music:** brief silence, then re-entry
- **Zoom:** pull in on the mode toggle
- **Voice:** [silent]

### Cue 19 — Impact stream (2:17 – 2:37)

- **On screen:** impact-ripple subgraph glows amber; answer streams with
  "direct impact", "second-order impact", "safe to unwind" sections; the
  X-Ray trace shows `bfs subgraph · 3 decisions · 2 edges`
- **Music:** main motif returns, darker
- **Zoom:** alternate between the subgraph highlight and the impact-mode
  answer
- **Voice:**

> Impact Ripple runs a breadth-first search from the anchor decision.
> [pause 400ms] Postmortem hands Opus only the slice of the ledger
> that matters — and traces the cascading consequences.

### Cue 20 — Back to gallery (2:37 – 2:43)

- **On screen:** nav back to `/`, gallery cards visible; hono's cost
  tile counts up
- **Music:** resolution — main theme releases tension
- **Zoom:** pull out to the full gallery; amber cost stat gets a brief
  focus
- **Voice:**

> Postmortem is not a codebase chat. [pause 300ms] It's a decision
> archaeologist that never fabricates.

### Cue 21 — Tagline fade (2:43 – 2:46)

- **On screen:** gallery fades to the bottom-of-page tagline
- **Music:** resolve — final note, sustain, fade
- **Zoom:** static on the tagline
- **Voice:**

> Code lives. [pause 500ms] Intent is a ghost. [pause 500ms]
> Postmortem summons it.

---

## Music direction (for your composer / stock-track picker)

- **Palette:** dark ambient + subtle electronic pulses. Not cinematic
  blockbuster. Think *Nine Inch Nails' Ghosts* crossed with *Trent Reznor's
  Social Network* opener.
- **BPM:** ~80 through the middle, rising to ~100 during Time Machine and
  Impact Ripple, settling back.
- **Structure:** A-theme (0:00–0:50 ingest), B-theme (0:54–1:10 Time
  Machine swell + graph entrance — the emotional peak), undercurrent
  (1:10–2:00), B-theme again (2:00–2:37), resolution (2:37–2:46).
- **Drops / hits:** at 0:18 (stream begins), 0:54 (nav to ledger),
  1:30 (answer stream), 2:37 (gallery return).

## Recording workflow

1. Generate each voiceover block in ElevenLabs separately (one audio file
   per cue) so you can time-align each to its window in the editor.
2. Record a 180-second screen capture of the demo at 60 fps, 1440×900,
   cursor hidden.
3. Import into your editor (Final Cut / Premiere / DaVinci).
4. Layer voiceover + music per this doc.
5. Add zoom / push-in effects per the **Zoom** column.
6. Color grade: push blacks, preserve the amber at 6% warm.
7. Export H.264, 1080p, AAC 256kbps audio.

## Optional MCP closing segment

The web demo can be extended with a 70-second terminal segment showing
Postmortem running inside Claude Code as an MCP server. Full script in
`docs/DEMO-MCP.md`. Recommended edit: cut the web-demo's final 10s
tagline, stitch directly into Beat M1 of the MCP demo, let the MCP
Beat M5 carry the tagline instead. Unified runtime: ~3:15.

## If a beat runs long

The spec has 14 seconds of buffer under the 3:00 ceiling. If you need
more slack:
- Cut the voice at cue 7 ("Stitched into a graph…") entirely — the visual
  carries the stitching beat alone.
- Shorten cue 15's answer monologue to just "The cyan trace is real reasoning.
  The amber lines are real citations." — saves about 4 seconds.
- Cut the tagline pauses from 500ms to 300ms.

## Approximate spoken duration per cue

(Measured against a 160 wpm reading pace, the speed a polished editorial
voice hits naturally.)

| Cue | Words | Seconds spoken | Window | Slack |
|---|---:|---:|---:|---:|
| 1 | 28 | 10.5 | 5.0 | **-5.5** (tight — consider shortening) |
| 2 | 17 | 6.4 | 3.0 | **-3.4** (will run into cue 3) |
| 4 | 11 | 4.1 | 6.0 | 1.9 |
| 5 | 16 | 6.0 | 2.0 | **-4.0** (will run into cue 6) |
| 6 | 34 | 12.8 | 25.0 | 12.2 |
| 7 | 13 | 4.9 | 7.0 | 2.1 |
| 10 | 13 | 4.9 | 4.0 | **-0.9** |
| 11 | 19 | 7.1 | 12.0 | 4.9 |
| 12 | 29 | 10.9 | 8.0 | **-2.9** (tight) |
| 13 | 11 | 4.1 | 8.0 | 3.9 |
| 14 | 10 | 3.8 | 4.0 | 0.2 |
| 15 | 59 | 22.1 | 30.0 | 7.9 |
| 16 | 9 | 3.4 | 5.0 | 1.6 |
| 17 | 19 | 7.1 | 8.0 | 0.9 |
| 19 | 32 | 12.0 | 20.0 | 8.0 |
| 20 | 15 | 5.6 | 6.0 | 0.4 |
| 21 | 7 | 2.6 | 3.0 | 0.4 |

**Net:** a few cues run tight. The easy fix is to overlap voice across cue
boundaries — the caption rail and the on-screen action don't care whether
the VO is still speaking from the previous beat.
