# Handoff Prompt — Features B → C → DEMO

> **Purpose:** Paste the block at the bottom as the first user message in a fresh Claude Code session. Feature E (Follow the Thread) and Feature A (Time Machine) are shipped on `main`. What remains is B (Provenance Peek), C (Reasoning X-Ray), and the two DEMO tasks.

---

## Status as of 2026-04-23 04:22 UTC

- Commits on `main`, all green in CI:
  - Feature E complete through Task E6 (threads E1 → E6 shipped prior session).
  - Feature A shipped end-to-end: color tokens (e946101), tick-clustering helper (28c531b), TimelineRail scaffold (1bc2be6), LedgerGraph `cutoffMV` pipeline (5b56606), LedgerPage mount (ce5f2ad).
  - Latest green CI: run 24816566948 at `2026-04-23T04:22:00Z`.
- Working branch: `main` (solo dev, no feature branches for this bundle).
- Deadline unchanged: **Sunday 2026-04-26, 8:00 PM EST**. Feature B (~4h) + Feature C (~6h) + demo script/dry-run (~2h) = ~12h of focused work left. Drop C if overrun.

---

## Remaining plan (tasks to execute)

From `docs/superpowers/plans/2026-04-22-ambitious-demo-bundle.md`:

| Wave | Tasks | Summary |
|---|---|---|
| **B** Provenance Peek (~4h) | B1 → B4 | ProvenanceCard component with editorial hover card (drop-cap, when-bar, related-count); stagger-skip test; swap into CitationChip; browser smoke. |
| **C** Reasoning X-Ray (~6h) | C1 → C6 | Backend `thought` SSE event in query engine; mirror in impact router; frontend `onThought` subscriber; ReasoningXRay component; AskPanel integration; browser smoke + demo dry-run. |
| **DEMO1** | Rewrite `docs/DEMO-SCRIPT.md` segments 2 and 3. |
| **DEMO2** | Manual demo dry-run (recorded) + final push + tag `submission-v1`. |

**Rollout rule:** if B+C runs 4h+ over estimate, drop C and ship demo with E+A+B only. The DEMO script fallback is already sketched in the plan.

---

## Environment quick-start

```bash
cd ~/Desktop/postmortem

# Baseline (should all pass)
cd backend && uv run ruff check app/ && uv run black --check app/ && uv run mypy app/ && uv run pytest -q && cd ..
cd frontend && pnpm biome check . && pnpm tsc --noEmit && pnpm vitest run && cd ..

# Servers (needed for C1+ backend work and C6 smoke)
cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8765 --log-level warning &
cd frontend && pnpm dev &
```

### Ledger DB note

`.cache/ledger.duckdb` is gitignored. If missing on this device, either:

1. Ingest a small repo via `scripts/ingest.py` (needs `ANTHROPIC_API_KEY` + `GITHUB_TOKEN` — minutes of runtime), **or**
2. Reuse the previous session's seed script at `/tmp/seed_smoke_ledger.py` (creates 10 synthetic `pmndrs/zustand` decisions across 2019–2025 for visual smoke only — do NOT commit the DB).

Feature B is pure-frontend; only Feature C Task C1 touches the query engine that needs the API key + live DB.

---

## Things learned this session (add to the "risks / conventions" pile)

- **Next.js template route-transition wrapper** (`frontend/app/template.tsx`) animates opacity 0 → 1 on mount. In Playwright headless, the animation occasionally stalls at opacity 0 — the page looks blank but is actually rendered. Force `opacity: 1` via `browser_evaluate` if you need a screenshot. Not a bug in our code; just a smoke-test gotcha.
- **React Flow nodes start with `visibility: hidden`** until `nodesInitialized` — this is intentional (it prevents flicker before the first fitView). Don't panic if `.react-flow__node` seems invisible during automated smoke.
- **`useContext` + `useTransform` fallback:** to avoid conditional-hook errors when a `MotionValue` prop is optional, hoist a `useMotionValue(Infinity)` fallback at the top of the component and coalesce: `const active = cutoff ?? fallback`.
- **Cutoff edge fading** uses `useMotionValueEvent(..., "change", ...)` + `requestAnimationFrame` batching → a throttled `hiddenNodeIds: Set<string>` that drives edge `style.opacity`. Nodes bypass React entirely via `useTransform`; edges re-memoize at ~60fps. This is a deliberate asymmetry (edges are fewer).

---

## Files you'll touch next

**Feature B — Provenance Peek (~4h)**

Create:
- `frontend/components/ProvenanceCard.tsx`
- `frontend/components/ProvenanceCard.test.tsx`

Modify:
- `frontend/components/CitationChip.tsx` (swap in ProvenanceCard, wire hover stagger-skip seen-set)

**Feature C — Reasoning X-Ray (~6h)**

Create:
- `frontend/components/ReasoningXRay.tsx`
- `backend/tests/test_thought_events.py`

Modify:
- `backend/app/query/engine.py` (emit `thought` SSE events at phase transitions)
- `backend/app/routers/impact.py` (mirror `thought` events)
- `frontend/lib/query.ts` (add `onThought` subscriber)
- `frontend/components/AskPanel.tsx` (mount ReasoningXRay; wire `onThought`)
- `frontend/components/ReasoningTrace.tsx` (propagate `onFollow` — may already be done)

---

## The final prompt block

Paste everything below the line into a fresh session:

---

```
You are continuing Postmortem, a decision-archaeology agent built during the
Claude Code Hackathon (2026-04-21 → 2026-04-26). The repo is at
github.com/rahilsinghi/postmortem. My ground-truth is on `main`.

Features E (Follow the Thread) and A (Time Machine) are shipped and green in
CI (last run: 24816566948 at 2026-04-23T04:22:00Z). What remains: Feature B
(Provenance Peek), Feature C (Reasoning X-Ray), and the two DEMO tasks.

Read these files FIRST before anything else:

  1. CLAUDE.md
  2. docs/superpowers/specs/2026-04-22-ambitious-demo-bundle-design.md
  3. docs/superpowers/plans/2026-04-22-ambitious-demo-bundle.md
     (start at "Feature B — Provenance Peek" — Tasks B1 → B4, then C1 → C6,
     then DEMO1 + DEMO2)
  4. docs/superpowers/plans/2026-04-23-handoff-prompt.md  (this handoff,
     you are in its §"The final prompt block")

Submission deadline: Sunday 2026-04-26, 8pm EST. ~12 work-hours left across
B + C + demo. Drop Feature C if you overrun by 4h.

Execution protocol:

  - Use superpowers:subagent-driven-development (recommended for 3+ independent
    tasks) or superpowers:executing-plans (sequential). Per-task: Red → Green
    → Commit for logic; browser smoke for visual-only tasks.
  - Never push without my explicit `push` instruction. Commits are fine
    without asking; `git push` is not.
  - Conventional commits: feat(provenance):, feat(x-ray):, feat(demo):
  - Do NOT add Claude as co-author or attribution. No Co-Authored-By lines.

Environment:

  Backend:  cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8765 --log-level warning
  Frontend: cd frontend && pnpm dev
  Baseline: cd backend && uv run ruff check app/ && uv run black --check app/ && uv run mypy app/ && uv run pytest -q
            cd frontend && pnpm biome check . && pnpm tsc --noEmit && pnpm vitest run
  Confirm baseline green before starting.

Ledger database: .cache/ledger.duckdb (gitignored). If missing, either ingest
a small repo via scripts/ingest.py (needs API keys) or reuse the previous
session's /tmp/seed_smoke_ledger.py for synthetic smoke data.

Conventions not in CLAUDE.md (learned the hard way):

  - react-resizable-panels v4: Group/Panel/Separator; sizes are PERCENTAGE
    STRINGS ("34%"); Panel uses `panelRef` not React ref.
  - Typography scale: 10/11/13/14/16 px.
  - Accent colors: amber #d4a24c (historical), cyan #67e8f9 (live/system),
    slate-past #334155 (timeline before cutoff). Tokens already in globals.css.
  - Managed Agents: only via client.beta.*, never raw httpx.
  - useReducedMotion() boolean hook — every animation must respect it.
  - Nullable MotionValue context: hoist a useMotionValue(Infinity) fallback
    before useContext to avoid conditional-hook errors.
  - Error emission from SSE handlers: only safe_error_message(exc, context)
    from backend/app/errors.py.
  - Prompt caching already wired in engine.py / impact.py / ingestion —
    don't remove cache_control markers.

Playwright smoke gotchas:

  - Next.js template route-transition (frontend/app/template.tsx) fades
    opacity 0 → 1 on mount; in headless the animation can stall. Force the
    root `.flex.min-h-full.flex-1.flex-col` opacity to 1 via browser_evaluate
    if a screenshot looks black.
  - React Flow hides nodes (visibility:hidden) until nodesInitialized settles.
    Acceptable; set visibility:visible for screenshot verification only.

Start by reading the four files listed above, confirm baseline green, then
invoke superpowers:subagent-driven-development (or
superpowers:executing-plans for an inline run) and begin with Task B1.

Acknowledge the brief and tell me which execution mode you're using, then
begin.
```

---
