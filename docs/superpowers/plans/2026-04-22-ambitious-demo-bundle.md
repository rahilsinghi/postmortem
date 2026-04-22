# Ambitious Demo Bundle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship four interlocking UI features (Follow the Thread, Time Machine, Provenance Peek, Reasoning X-Ray) that headline the Postmortem submission video.

**Architecture:** Frontend-heavy. Three of four features are pure-client. One (Reasoning X-Ray) adds a single new SSE event type (`thought`) to the query engine with truthful, deterministic context strings — no query-engine surgery. Zero DuckDB schema changes. Motion-value pipelines where perf matters (scrubber, camera pan) to bypass React re-renders.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · Framer Motion 12 · React Flow (`@xyflow/react`) · Python 3.11 + FastAPI + sse-starlette + Anthropic SDK (for C backend piece). Testing: Vitest (frontend), pytest (backend). Browser smoke via the Claude Preview MCP server.

**Reference spec:** `docs/superpowers/specs/2026-04-22-ambitious-demo-bundle-design.md`

**Rollout order:** E → A → B → C. Each feature commits + CIs + browser-smokes before the next begins. Buffer zero; drop C first if overrun.

---

## File Structure

### New files

| Path | Responsibility | Feature |
|---|---|---|
| `frontend/hooks/useThreadFollower.ts` | Kinship computation + camera spring + status-chip state | E |
| `frontend/hooks/useThreadFollower.test.ts` | Vitest unit tests for kinship logic | E |
| `frontend/components/TimelineRail.tsx` | Scrubber, play/pause, speed chip, year axis, stack glyph, scale toggle | A |
| `frontend/components/TimelineRail.test.tsx` | Vitest unit tests for tick clustering | A |
| `frontend/components/ProvenanceCard.tsx` | Editorial citation card (drop-cap, when-bar, related-count) | B |
| `frontend/components/ProvenanceCard.test.tsx` | Vitest unit tests for stagger-skip seen-set | B |
| `frontend/components/ReasoningXRay.tsx` | Live trace panel with cyan scan-line + amber citations | C |
| `backend/tests/test_thought_events.py` | Pytest for `thought` SSE event emission | C |

### Modified files

| Path | Changes |
|---|---|
| `frontend/components/CitationChip.tsx` | Accept `onFollow` callback; delegate rendering to `ProvenanceCard`; wire hover stagger-skip |
| `frontend/components/LedgerGraph.tsx` | Accept `cutoffMV?: MotionValue<Date>` (A) and `threadKinIds?: Set<string>` (E); drive node opacity/hue via motion-value transforms |
| `frontend/app/ledger/[owner]/[repo]/LedgerPage.tsx` | Host `useThreadFollower` + cutoff motion value; glue to graph + chip handlers |
| `frontend/components/AskPanel.tsx` | Mount `ReasoningXRay`; wire `onThought` + `onFollow` callbacks through `ReasoningTrace` |
| `frontend/components/ReasoningTrace.tsx` | Propagate `onFollow` to `CitationChip` instances |
| `frontend/lib/query.ts` | Add `onThought` subscriber to `startQuery` stream reader |
| `frontend/app/globals.css` | Add `--cyan-signal: #67e8f9` and `--slate-past: #334155` tokens |
| `backend/app/query/engine.py` | Emit `thought` SSE events at phase transitions |
| `backend/app/routers/impact.py` | Mirror `thought` events |
| `docs/DEMO-SCRIPT.md` | Rewrite segments 2 + 3 to incorporate new features |

---

## Conventions (read before starting any task)

- **Every task follows Red → Green → Commit** where the task creates or changes logic. Pure-visual component tasks verify via browser smoke (see "browser smoke protocol" below).
- **Commit per task unless a task explicitly chains into the next.** Each commit must pass `pnpm biome check .`, `pnpm tsc --noEmit`, `uv run ruff check app/` (backend), `uv run black --check app/`, `uv run mypy app/`.
- **Conventional commit format:** `feat(follow-thread):`, `feat(timeline):`, `feat(provenance):`, `feat(x-ray):`, `feat(demo):`. Body explains why.
- **Never run `git push` inside a task without the user's explicit authorization** (per CLAUDE.md). Tasks stop at `git commit`.
- **Reduced motion:** every animation must respect the `useReducedMotion()` hook from `frontend/lib/motion.ts`. Disable entrance animations, preserve state changes.
- **Accent constants:** amber `#d4a24c`, amber glow `rgba(212,162,76,0.35)`, new cyan `#67e8f9`, past-slate `#334155`. Use Tailwind arbitrary values (`bg-[#d4a24c]/60`) not custom classes.
- **Motion conventions (from Wave 4):** `SPRING_TACTILE = { type: "spring", stiffness: 420, damping: 32 }` already exported from `frontend/lib/motion.ts`.

### Browser smoke protocol

For visual-only verification after a task:

1. Ensure backend is running: `curl -s http://127.0.0.1:8765/healthz`
2. Ensure frontend preview is running (Claude Preview MCP `preview_list`)
3. Navigate via `mcp__Claude_Preview__preview_eval` to the relevant page
4. Interact via `mcp__Claude_Preview__preview_click` / `preview_eval`
5. Capture via `mcp__Claude_Preview__preview_screenshot` or `preview_snapshot`
6. Verify specific behavior called out in the task (e.g., "node pulse visible at click time")

---

# Feature E — Follow the Thread (4 hours, ~6 tasks)

## Task E1: Pure kinship computation + test

**Files:**
- Create: `frontend/hooks/useThreadFollower.ts` (function only, no React yet)
- Test: `frontend/hooks/useThreadFollower.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/hooks/useThreadFollower.test.ts
import { describe, expect, test } from "vitest";
import type { Decision, Edge } from "../lib/api";
import { computeKinship } from "./useThreadFollower";

const mk = (id: string, pr: number, author: string): Decision =>
  ({
    id,
    pr_number: pr,
    title: `pr #${pr}`,
    summary: "",
    category: "architecture",
    decided_at: null,
    decided_by: [author],
    status: "active",
    commit_shas: [],
    confidence: 1,
    pr_url: "",
    citations: {
      context: [],
      decision: [
        {
          claim: "",
          quote: "",
          source_type: "pr_body",
          source_id: String(pr),
          author,
          timestamp: null,
          url: "",
        },
      ],
      forces: [],
      consequences: [],
    },
    alternatives: [],
  }) as unknown as Decision;

describe("computeKinship", () => {
  test("finds nodes citing the same PR", () => {
    const a = mk("a", 3336, "alice");
    const b = mk("b", 9999, "alice"); // same author, different PR
    const c = mk("c", 3336, "bob"); // same PR, different author
    const result = computeKinship([a, b, c], [], {
      prNumber: 3336,
      author: "alice",
    });
    expect(result.anchorId).toBe("a");
    expect(result.kinIds).toEqual(new Set(["b", "c"]));
  });

  test("finds nodes edge-connected to the anchor", () => {
    const a = mk("a", 1, "alice");
    const b = mk("b", 2, "bob");
    const edge: Edge = {
      from_id: "a",
      to_id: "b",
      kind: "supersedes",
      reason: null,
      from_pr: 1,
      to_pr: 2,
      from_title: "",
      to_title: "",
      from_category: "architecture",
      to_category: "architecture",
    };
    const result = computeKinship([a, b], [edge], { prNumber: 1, author: "alice" });
    expect(result.kinIds.has("b")).toBe(true);
  });

  test("returns empty kin when anchor is absent", () => {
    const result = computeKinship([], [], { prNumber: 42, author: "ghost" });
    expect(result.anchorId).toBeNull();
    expect(result.kinIds.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd frontend && pnpm vitest run hooks/useThreadFollower.test.ts
```

Expected: 3 failures — `computeKinship is not a function` (or module not found).

- [ ] **Step 3: Write minimal implementation**

```ts
// frontend/hooks/useThreadFollower.ts
import type { Decision, Edge } from "../lib/api";

export type KinshipTarget = { prNumber: number; author: string };

export type KinshipResult = {
  anchorId: string | null;
  kinIds: Set<string>;
};

export function computeKinship(
  decisions: Decision[],
  edges: Edge[],
  target: KinshipTarget,
): KinshipResult {
  const byId = new Map(decisions.map((d) => [d.id, d]));
  const anchor = decisions.find((d) => d.pr_number === target.prNumber) ?? null;
  const anchorId = anchor?.id ?? null;

  const kinIds = new Set<string>();
  if (!anchor) return { anchorId: null, kinIds };

  // Same PR OR same author (in any citation)
  for (const d of decisions) {
    if (d.id === anchor.id) continue;
    if (d.pr_number === target.prNumber) {
      kinIds.add(d.id);
      continue;
    }
    const allCitations = [
      ...d.citations.context,
      ...d.citations.decision,
      ...d.citations.forces,
      ...d.citations.consequences,
    ];
    if (allCitations.some((c) => c.author === target.author)) {
      kinIds.add(d.id);
    }
  }

  // Edge-connected to the anchor (either direction)
  for (const e of edges) {
    if (e.from_id === anchor.id && byId.has(e.to_id)) kinIds.add(e.to_id);
    if (e.to_id === anchor.id && byId.has(e.from_id)) kinIds.add(e.from_id);
  }

  return { anchorId, kinIds };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd frontend && pnpm vitest run hooks/useThreadFollower.test.ts
```

Expected: 3 passes.

- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/hooks/useThreadFollower.ts frontend/hooks/useThreadFollower.test.ts && \
  git commit -m "feat(follow-thread): kinship computation helper + tests

Pure function. Given loaded decisions, edges, and a citation target
(prNumber + author), returns the anchor decision id and the set of
'kin' decision ids — those citing the same PR, citing the same author,
or directly edge-connected to the anchor.

Tests cover the three kinship rules plus the missing-anchor edge case."
```

---

## Task E2: React hook wrapper around the kinship function

**Files:**
- Modify: `frontend/hooks/useThreadFollower.ts` (add hook)

- [ ] **Step 1: Add the hook**

```ts
// Append to frontend/hooks/useThreadFollower.ts
import { useCallback, useEffect, useState } from "react";

export type ThreadState = {
  anchorId: string | null;
  anchorPr: number | null;
  kinIds: Set<string>;
  target: KinshipTarget | null;
};

const EMPTY: ThreadState = {
  anchorId: null,
  anchorPr: null,
  kinIds: new Set(),
  target: null,
};

export function useThreadFollower(
  decisions: Decision[],
  edges: Edge[],
): {
  state: ThreadState;
  follow: (target: KinshipTarget) => void;
  clear: () => void;
} {
  const [state, setState] = useState<ThreadState>(EMPTY);

  const follow = useCallback(
    (target: KinshipTarget) => {
      const { anchorId, kinIds } = computeKinship(decisions, edges, target);
      if (!anchorId) {
        // Brief "not-found" shake is handled at the click site, not here.
        return;
      }
      setState({ anchorId, anchorPr: target.prNumber, kinIds, target });
    },
    [decisions, edges],
  );

  const clear = useCallback(() => setState(EMPTY), []);

  // Esc clears the follower
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.anchorId) clear();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.anchorId, clear]);

  return { state, follow, clear };
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd .. && git add frontend/hooks/useThreadFollower.ts && \
  git commit -m "feat(follow-thread): React hook wrapping the kinship computation

State shape: anchorId + anchorPr + kinIds (Set) + target. follow(target)
triggers kinship computation; clear() resets. Esc-to-clear wired here so
the hook is self-contained and LedgerPage doesn't duplicate the handler."
```

---

## Task E3: Extend CitationChip with onFollow click

**Files:**
- Modify: `frontend/components/CitationChip.tsx`

- [ ] **Step 1: Read the current file**

```bash
cat frontend/components/CitationChip.tsx | head -50
```

- [ ] **Step 2: Add `onFollow` prop + click handler**

Inside `CitationChip`'s props type, add:

```ts
onFollow?: (args: { prNumber: number; author: string }) => void;
```

Wrap the chip element (likely a `<span>` or `<button>`) with an additional click handler that fires `onFollow` when `match.prNumber` is non-null. Preserve existing hover-card behavior. If `match.prNumber` is null and user clicks, apply a brief shake animation on the chip itself (`animate={{ x: [-2, 2, 0] }} transition={{ duration: 0.16 }}`). Use a local `shake` boolean state.

Concrete sketch (your final version must match existing file shape):

```tsx
const [shake, setShake] = useState(false);
const onClick = () => {
  if (match.prNumber && match.author && onFollow) {
    onFollow({ prNumber: match.prNumber, author: match.author });
  } else {
    setShake(true);
    setTimeout(() => setShake(false), 200);
  }
};
```

Add `onClick={onClick}` to the trigger element. Wrap in `motion.span` with `animate={shake ? { x: [-2, 2, 0] } : {}}`.

- [ ] **Step 3: Verify TypeScript + biome**

```bash
cd frontend && pnpm tsc --noEmit && pnpm biome check components/CitationChip.tsx
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
cd .. && git add frontend/components/CitationChip.tsx && \
  git commit -m "feat(follow-thread): CitationChip accepts onFollow callback

Click on a chip with a resolvable pr_number + author invokes onFollow.
Unresolved chips get a brief shake (160ms) instead — signals 'nothing
to navigate to' without a popup. Hover card behavior unchanged."
```

---

## Task E4: Pipe onFollow through ReasoningTrace + AskPanel

**Files:**
- Modify: `frontend/components/ReasoningTrace.tsx`
- Modify: `frontend/components/AskPanel.tsx`

- [ ] **Step 1: Add `onFollow` prop to `ReasoningTrace`**

Add to `ReasoningTrace`'s props: `onFollow?: (args: { prNumber: number; author: string }) => void;`. Pass into `RenderSegments`. Pass from `RenderSegments` to every `CitationChip` instance.

- [ ] **Step 2: Add `onFollow` prop to `AskPanel`**

Add to `AskPanel`'s props: `onFollow?: (args: { prNumber: number; author: string }) => void;`. Pass into `<ReasoningTrace onFollow={onFollow} …/>`.

- [ ] **Step 3: Verify types**

```bash
cd frontend && pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd .. && git add frontend/components/ReasoningTrace.tsx frontend/components/AskPanel.tsx && \
  git commit -m "feat(follow-thread): thread onFollow through AskPanel → ReasoningTrace → CitationChip

Pure prop-drilling, no new state. LedgerPage (next task) will host the
hook and wire the callback down. Keeps ownership clear — hook lives
where the graph does."
```

---

## Task E5: Host hook in LedgerPage + wire graph kin-tint

**Files:**
- Modify: `frontend/app/ledger/[owner]/[repo]/LedgerPage.tsx`
- Modify: `frontend/components/LedgerGraph.tsx`

- [ ] **Step 1: LedgerGraph — accept `threadKinIds`**

Add prop: `threadKinIds?: Set<string> | null; threadAnchorId?: string | null;`

In the React Flow node renderer, derive a per-node class:

```tsx
const isKin = props.threadKinIds?.has(node.id) ?? false;
const isAnchor = props.threadAnchorId === node.id;
const threadStyle = isAnchor
  ? "ring-2 ring-[#d4a24c] ring-offset-2 ring-offset-black"
  : isKin
    ? "ring-1 ring-[#d4a24c]/40"
    : "";
```

Apply `threadStyle` into the node's container className.

Also: when `threadAnchorId` changes to a non-null value, call React Flow's `setCenter(node.position.x, node.position.y, { duration: 500, zoom: 1.1 })` wrapped in a `useEffect`. For the spring-physics feel, instead of the library's built-in duration, drive a `useSpring({stiffness: 420, damping: 32})` motion value and on each frame call `setCenter(springX.get(), springY.get(), { duration: 0, zoom: 1.1 })`. Fallback to native `duration: 500` if the spring approach proves flaky — accept that tradeoff.

- [ ] **Step 2: LedgerPage — host hook + wire**

Replace the existing click-only flow with:

```tsx
import { useThreadFollower } from "../../../../hooks/useThreadFollower";

// Inside LedgerPage():
const thread = useThreadFollower(ledger.decisions, ledger.edges);

// Pass to AskPanel:
<AskPanel
  // ...existing props
  onFollow={thread.follow}
/>

// Pass to LedgerGraph:
<LedgerGraph
  // ...existing props
  threadKinIds={thread.state.kinIds}
  threadAnchorId={thread.state.anchorId}
/>
```

- [ ] **Step 3: Status chip inside LedgerPage's graph panel**

Render conditionally above the graph:

```tsx
{thread.state.anchorPr !== null ? (
  <button
    type="button"
    onClick={thread.clear}
    className="absolute left-3 top-3 rounded-md border border-[#d4a24c]/60 bg-[#d4a24c]/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#d4a24c] transition hover:border-[#d4a24c]"
  >
    following thread: PR #{thread.state.anchorPr} · {thread.state.kinIds.size} kin · clear
  </button>
) : null}
```

(Position carefully if the existing Impact subgraph chip lives at the same spot — offset vertically or hide impact chip while thread is active. In spec we said one-at-a-time; simplest: hide impact while following.)

- [ ] **Step 4: Verify types + biome**

```bash
cd frontend && pnpm tsc --noEmit && pnpm biome check app/ledger components/LedgerGraph.tsx
```

- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/app/ledger frontend/components/LedgerGraph.tsx && \
  git commit -m "feat(follow-thread): graph pans + kin tint on citation click

Click any citation chip inside an answer → LedgerPage's useThreadFollower
computes kinship (same PR / same author / edge-connected), LedgerGraph
pans to the anchor (spring-physics camera), pulses the anchor amber,
soft-tints kin nodes. Status chip top-left; clear() on click or Esc.

Impact-subgraph chip is hidden while a thread is active so the graph
stays legible — one navigation context at a time."
```

---

## Task E6: Browser smoke + CI

- [ ] **Step 1: Backend + frontend up**

```bash
curl -s http://127.0.0.1:8765/healthz
# If 8765 down: cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8765 --log-level warning &
```

Use `mcp__Claude_Preview__preview_list` to confirm the frontend server is running.

- [ ] **Step 2: Run a query on pmndrs/zustand, click a citation chip**

```
Navigate to /ledger/pmndrs/zustand via preview_eval(location.href = '/ledger/pmndrs/zustand')
Click any suggested query button via preview_click('button[type="button"]:has-text("persist")')  # adjust selector
Wait ~15s for stream to finish
Click the first citation chip inside the streamed answer
```

- [ ] **Step 3: Verify**

- Graph visibly pans within ~500ms
- Anchor node has amber ring
- ≥1 kin node has subtle amber tint
- Status chip `following thread: PR #… · N kin · clear` appears top-left
- Pressing Esc clears all

If any fail, iterate and re-commit.

- [ ] **Step 4: CI check**

```bash
git push
# In another shell: gh run watch $(gh run list --branch main --limit 1 --json databaseId -q '.[0].databaseId') --exit-status
```

Expected: green. Proceed to Feature A.

---

# Feature A — Time Machine (7 hours, ~9 tasks)

## Task A1: Color tokens + motion imports

**Files:**
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Add two CSS custom properties**

Inside `:root { ... }` in `globals.css`, add:

```css
--cyan-signal: #67e8f9;
--slate-past: #334155;
--accent-glow: rgba(212, 162, 76, 0.35); /* keep existing */
```

- [ ] **Step 2: Verify**

```bash
cd frontend && pnpm biome check app/globals.css
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add frontend/app/globals.css && \
  git commit -m "feat(tokens): add cyan-signal + slate-past color tokens

Two-palette hierarchy for forthcoming Reasoning X-Ray (cyan = live
system logic) and Time Machine (slate = faded past-state nodes).
Amber stays reserved for resolved historical data."
```

---

## Task A2: Tick-clustering helper + test

**Files:**
- Create: `frontend/components/TimelineRail.tsx` (helper only for now)
- Test: `frontend/components/TimelineRail.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/components/TimelineRail.test.tsx
import { describe, expect, test } from "vitest";
import { clusterTicks, type Tick } from "./TimelineRail";

const d = (iso: string): Date => new Date(iso);

describe("clusterTicks", () => {
  test("no overlap → each tick stays singleton", () => {
    const ticks: Tick[] = [
      { id: "a", date: d("2024-01-01"), x: 0 },
      { id: "b", date: d("2024-06-01"), x: 400 },
      { id: "c", date: d("2024-12-01"), x: 800 },
    ];
    const clusters = clusterTicks(ticks, 6);
    expect(clusters).toHaveLength(3);
    expect(clusters[0].members).toEqual(["a"]);
  });

  test("ticks within 6px collapse into one stack", () => {
    const ticks: Tick[] = [
      { id: "a", date: d("2024-01-01"), x: 100 },
      { id: "b", date: d("2024-01-02"), x: 102 },
      { id: "c", date: d("2024-01-03"), x: 105 },
      { id: "d", date: d("2024-06-01"), x: 500 },
    ];
    const clusters = clusterTicks(ticks, 6);
    expect(clusters).toHaveLength(2);
    expect(clusters[0].members.sort()).toEqual(["a", "b", "c"]);
    expect(clusters[1].members).toEqual(["d"]);
  });

  test("stack's x is the mean of members", () => {
    const ticks: Tick[] = [
      { id: "a", date: d("2024-01-01"), x: 100 },
      { id: "b", date: d("2024-01-02"), x: 104 },
    ];
    const clusters = clusterTicks(ticks, 6);
    expect(clusters[0].x).toBe(102);
  });
});
```

- [ ] **Step 2: Stub TimelineRail.tsx to fail**

```tsx
// frontend/components/TimelineRail.tsx
export type Tick = { id: string; date: Date; x: number };
export type TickCluster = { x: number; date: Date; members: string[] };

export function clusterTicks(_ticks: Tick[], _minGap: number): TickCluster[] {
  throw new Error("not implemented");
}
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd frontend && pnpm vitest run components/TimelineRail.test.tsx
```

Expected: 3 failures with `not implemented`.

- [ ] **Step 4: Implement**

```tsx
export function clusterTicks(ticks: Tick[], minGap: number): TickCluster[] {
  if (ticks.length === 0) return [];
  const sorted = [...ticks].sort((a, b) => a.x - b.x);
  const clusters: TickCluster[] = [];
  let current: { xs: number[]; dates: number[]; ids: string[] } = {
    xs: [sorted[0].x],
    dates: [sorted[0].date.getTime()],
    ids: [sorted[0].id],
  };
  const flush = () => {
    const meanX = current.xs.reduce((a, b) => a + b, 0) / current.xs.length;
    const meanDate = current.dates.reduce((a, b) => a + b, 0) / current.dates.length;
    clusters.push({
      x: meanX,
      date: new Date(meanDate),
      members: current.ids,
    });
  };
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].x - sorted[i - 1].x < minGap) {
      current.xs.push(sorted[i].x);
      current.dates.push(sorted[i].date.getTime());
      current.ids.push(sorted[i].id);
    } else {
      flush();
      current = { xs: [sorted[i].x], dates: [sorted[i].date.getTime()], ids: [sorted[i].id] };
    }
  }
  flush();
  return clusters;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd frontend && pnpm vitest run components/TimelineRail.test.tsx
```

Expected: 3 passes.

- [ ] **Step 6: Commit**

```bash
cd .. && git add frontend/components/TimelineRail.tsx frontend/components/TimelineRail.test.tsx && \
  git commit -m "feat(timeline): tick-clustering helper + tests

Pure function. Given ticks with pixel positions and a minimum-gap
threshold, groups overlapping ticks into stacks whose x and date are
the mean of members. Linear-time single pass."
```

---

## Task A3: TimelineRail scaffold — scrubber + play + cursor label

**Files:**
- Modify: `frontend/components/TimelineRail.tsx`

- [ ] **Step 1: Implement the component**

Full file replacement (keep the `Tick`/`TickCluster`/`clusterTicks` exports):

```tsx
"use client";

import { motion, useMotionValue, useTransform, animate, type MotionValue } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Decision } from "../lib/api";
import { useReducedMotion } from "../lib/motion";

export type Tick = { id: string; date: Date; x: number };
export type TickCluster = { x: number; date: Date; members: string[] };

export function clusterTicks(ticks: Tick[], minGap: number): TickCluster[] {
  // ...implementation from Task A2, unchanged
}

export type Scale = "time" | "uniform";

type Props = {
  decisions: Decision[];
  cutoffMV: MotionValue<number>; // epoch ms; +∞ == "present"
  width: number; // px of rail content area
};

const RAIL_HEIGHT = 32;
const MIN_GAP_PX = 6;
const SPEEDS = [1, 4, 10] as const;

export function TimelineRail({ decisions, cutoffMV, width }: Props) {
  const reduced = useReducedMotion();

  // Only render if ≥3 decisions with decided_at
  const dated = useMemo(
    () => decisions.filter((d) => d.decided_at !== null).map((d) => ({
      id: d.id,
      pr: d.pr_number,
      title: d.title,
      date: new Date(d.decided_at as string),
    })),
    [decisions],
  );

  if (dated.length < 3) return null;

  const [scale, setScale] = useState<Scale>(() =>
    dated.length > 200 ? "uniform" : "time",
  );

  const [minTs, maxTs] = useMemo(() => {
    const ts = dated.map((d) => d.date.getTime());
    return [Math.min(...ts), Math.max(...ts)];
  }, [dated]);

  const xOfDate = useCallback(
    (ts: number): number => {
      if (scale === "uniform") {
        // Each decision gets an equal slot. Find rank.
        const rank = dated.findIndex((d) => d.date.getTime() === ts);
        if (rank < 0) return 0;
        return (rank / Math.max(1, dated.length - 1)) * width;
      }
      const span = maxTs - minTs || 1;
      return ((ts - minTs) / span) * width;
    },
    [scale, dated, minTs, maxTs, width],
  );

  const dateOfX = useCallback(
    (x: number): number => {
      if (scale === "uniform") {
        const rank = Math.round((x / width) * Math.max(0, dated.length - 1));
        return dated[Math.max(0, Math.min(dated.length - 1, rank))].date.getTime();
      }
      const span = maxTs - minTs || 1;
      return minTs + (x / width) * span;
    },
    [scale, dated, minTs, maxTs, width],
  );

  const ticks: Tick[] = useMemo(
    () =>
      dated.map((d) => ({
        id: d.id,
        date: d.date,
        x: xOfDate(d.date.getTime()),
      })),
    [dated, xOfDate],
  );
  const clusters = useMemo(() => clusterTicks(ticks, MIN_GAP_PX), [ticks]);

  // Scrubber position — MotionValue, driven by drag + playback
  const scrubberX = useMotionValue(width);
  const cursorDate = useTransform(scrubberX, (x) => dateOfX(Math.max(0, Math.min(width, x))));

  // Keep cutoffMV in sync with scrubberX
  useEffect(() => {
    const unsub = cursorDate.on("change", (d) => cutoffMV.set(d));
    return unsub;
  }, [cursorDate, cutoffMV]);

  // Play/pause
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    const totalSpanMs = maxTs - minTs || 1;
    // Cover the whole span in 10 seconds at 1×
    const msPerPx = 10_000 / width;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const currentX = scrubberX.get();
      const nextX = currentX + (dt / msPerPx) * speed;
      if (nextX >= width) {
        scrubberX.set(width);
        setPlaying(false);
        return;
      }
      scrubberX.set(nextX);
      rafRef.current = requestAnimationFrame(tick);
    };
    // If at end, rewind to start before playing
    if (scrubberX.get() >= width - 1) scrubberX.set(0);
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, minTs, maxTs, width, scrubberX]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as HTMLElement).tagName === "TEXTAREA") return;
      if (e.target && (e.target as HTMLElement).tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowLeft") {
        const currX = scrubberX.get();
        const prev = [...ticks].reverse().find((t) => t.x < currX - 1);
        if (prev) scrubberX.set(prev.x);
      } else if (e.key === "ArrowRight") {
        const currX = scrubberX.get();
        const nxt = ticks.find((t) => t.x > currX + 1);
        if (nxt) scrubberX.set(nxt.x);
      } else if (e.key === "Home") {
        scrubberX.set(0);
      } else if (e.key === "End") {
        scrubberX.set(width);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ticks, scrubberX, width]);

  // Cursor date label (direct motion-value subscription, no React render)
  const labelRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const unsub = cursorDate.on("change", (d) => {
      if (labelRef.current) {
        const date = new Date(d);
        labelRef.current.textContent = date.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
      }
    });
    return unsub;
  }, [cursorDate]);

  return (
    <div
      className="pointer-events-auto relative mx-4 mb-3 flex items-center gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/60 px-3 py-1 backdrop-blur-lg"
      style={{ height: RAIL_HEIGHT }}
    >
      <button
        type="button"
        onClick={() => setPlaying((p) => !p)}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-[#d4a24c]/60 bg-[#d4a24c]/10 text-[#d4a24c] transition hover:bg-[#d4a24c]/20"
        title={playing ? "pause (space)" : "play (space)"}
      >
        <span className="text-[11px]">{playing ? "⏸" : "▶"}</span>
      </button>
      <div className="flex items-center gap-1 font-mono text-[10px] text-zinc-500">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSpeed(s)}
            className={`rounded px-1.5 py-0.5 transition ${
              s === speed ? "bg-[#d4a24c]/20 text-[#d4a24c]" : "hover:text-zinc-200"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
      <div
        className="relative flex-1"
        style={{ height: RAIL_HEIGHT - 8 }}
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const localX = e.clientX - rect.left;
          animate(scrubberX, localX, reduced ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 40 });
        }}
      >
        {/* Base rail line */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-zinc-800" />
        {/* Ticks / clusters */}
        {clusters.map((c, i) => (
          <div
            key={`${c.x}-${i}`}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ left: c.x }}
            title={
              c.members.length === 1
                ? c.date.toDateString()
                : `${c.members.length} decisions ~${c.date.toDateString()}`
            }
          >
            {c.members.length === 1 ? (
              <div className="h-2 w-[3px] rounded-sm bg-[#d4a24c]/70" />
            ) : (
              <div className="flex items-center justify-center rounded-sm bg-[#d4a24c]/30 px-[3px] py-[1px] font-mono text-[8px] text-[#d4a24c]">
                {c.members.length}
              </div>
            )}
          </div>
        ))}
        {/* Scrubber handle */}
        <motion.div
          className="absolute top-0 h-full w-1 cursor-col-resize rounded-[1px] bg-[#d4a24c] shadow-[0_0_10px_rgba(212,162,76,0.6)]"
          style={{ x: scrubberX, translateX: "-50%" }}
          drag="x"
          dragConstraints={{ left: 0, right: width }}
          dragMomentum={false}
        />
      </div>
      <span
        ref={labelRef}
        className="w-20 text-right font-mono text-[10px] tabular-nums text-zinc-300"
      />
      <button
        type="button"
        onClick={() => setScale((s) => (s === "time" ? "uniform" : "time"))}
        className="font-mono text-[9px] uppercase tracking-wider text-zinc-500 transition hover:text-zinc-200"
        title="Toggle time vs uniform scale"
      >
        {scale}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add frontend/components/TimelineRail.tsx && \
  git commit -m "feat(timeline): TimelineRail with scrubber, play, speed, ticks, scale toggle

Glassmorphic 32px rail. Scrubber is a MotionValue<number> driven directly
by drag + playback RAF; cutoffMV output is synced via motion-value
subscription (no React re-renders per frame). Keyboard ←/→/Space/Home/End
wired. Auto-defaults to 'uniform' scale at >200 decisions."
```

---

## Task A4: LedgerGraph accepts cutoffMV → drives node opacity/hue

**Files:**
- Modify: `frontend/components/LedgerGraph.tsx`

- [ ] **Step 1: Add prop + motion-value pipeline**

Add prop: `cutoffMV?: MotionValue<number>` (epoch ms). In the custom DecisionNode renderer, subscribe each node to the cutoff via `useTransform`:

```tsx
// Inside DecisionNode:
import { useTransform } from "framer-motion";
const nodeDate = data.decidedAt ? new Date(data.decidedAt).getTime() : 0;
const opacity = useTransform(props.cutoffMV, (cutoff) => {
  if (!nodeDate) return 1; // fallback — always visible
  return cutoff >= nodeDate ? 1 : 0.08;
});
const scale = useTransform(props.cutoffMV, (cutoff) => {
  if (!nodeDate) return 1;
  return cutoff >= nodeDate ? 1 : 0.96;
});
const filter = useTransform(props.cutoffMV, (cutoff) => {
  if (!nodeDate) return "none";
  return cutoff >= nodeDate
    ? "none"
    : "hue-rotate(-20deg) saturate(0.4) brightness(0.7)";
});

return (
  <motion.div style={{ opacity, scale, filter }} className="...">
    {/* node content */}
  </motion.div>
);
```

For edges: the React Flow edge renderer doesn't naturally accept motion values; compute a derived React state `hiddenNodeIds: Set<string>` at low frequency (throttle the cutoff subscription to ~16ms via `useMotionValueEvent` with throttle, or subscribe and batch via `requestAnimationFrame`). Apply `style={{ opacity: hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target) ? 0.08 : 1 }}`.

Accept a small perf hit on edges — they're far fewer than nodes.

- [ ] **Step 2: Thread the prop**

In `LedgerGraph`'s component signature, accept `cutoffMV`. Pass to custom node data through React Flow's node `data` field OR via React Context (simpler for motion values — context with a `CutoffContext = createContext<MotionValue<number> | null>(null)`).

Recommended: Context.

```tsx
// Above LedgerGraph:
const CutoffContext = createContext<MotionValue<number> | null>(null);

// Inside LedgerGraph render:
<CutoffContext.Provider value={cutoffMV ?? null}>
  <ReactFlow ... />
</CutoffContext.Provider>

// Inside DecisionNode:
const cutoff = useContext(CutoffContext);
const opacity = useTransform(cutoff ?? useMotionValue(Number.POSITIVE_INFINITY), ...);
```

- [ ] **Step 3: Verify types**

```bash
cd frontend && pnpm tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
cd .. && git add frontend/components/LedgerGraph.tsx && \
  git commit -m "feat(timeline): LedgerGraph opacity pipeline driven by cutoffMV

Nodes subscribe to a cutoff motion value via useContext + useTransform —
per-frame opacity/scale/hue updates bypass React reconciliation entirely.
Edges fade via a throttled derived Set<string> (lower frequency is fine;
edges are fewer and less visually dominant)."
```

---

## Task A5: LedgerPage hosts cutoff + mounts TimelineRail

**Files:**
- Modify: `frontend/app/ledger/[owner]/[repo]/LedgerPage.tsx`

- [ ] **Step 1: Create the cutoff motion value + mount rail**

```tsx
import { useMotionValue } from "framer-motion";
import { TimelineRail } from "../../../../components/TimelineRail";

// Inside LedgerPage():
const cutoffMV = useMotionValue(Number.POSITIVE_INFINITY); // "present"

// Measure the graph pane's width so the rail can compute positions
const [railWidth, setRailWidth] = useState(800);
const paneRef = useRef<HTMLDivElement | null>(null);
useEffect(() => {
  const el = paneRef.current;
  if (!el) return;
  const ro = new ResizeObserver((entries) => {
    const w = entries[0]?.contentRect?.width ?? 800;
    // Rail occupies everything except the controls (approx 160px)
    setRailWidth(Math.max(200, w - 160));
  });
  ro.observe(el);
  return () => ro.disconnect();
}, []);
```

In the Graph `<Panel>`, wrap the existing `<section>` with a flex column and add the rail at the bottom:

```tsx
<Panel id="graph" defaultSize={GRAPH_DEFAULT} minSize={GRAPH_MIN}>
  <section ref={paneRef} className="relative flex h-full flex-col border-r border-zinc-800">
    <div className="relative flex-1">
      <LedgerGraph
        decisions={ledger.decisions}
        edges={ledger.edges}
        selectedId={selectedId}
        onSelect={setSelectedId}
        subgraphAnchorPr={subgraph?.anchorPr ?? null}
        subgraphPrs={subgraph?.prs ?? null}
        threadKinIds={thread.state.kinIds}
        threadAnchorId={thread.state.anchorId}
        cutoffMV={cutoffMV}
      />
      {/* existing subgraph/thread chip here */}
    </div>
    <TimelineRail decisions={ledger.decisions} cutoffMV={cutoffMV} width={railWidth} />
  </section>
</Panel>
```

- [ ] **Step 2: Typecheck + biome**

```bash
cd frontend && pnpm tsc --noEmit && pnpm biome check app/ledger
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add frontend/app/ledger && \
  git commit -m "feat(timeline): mount TimelineRail inside LedgerPage graph pane

LedgerPage now owns a single cutoffMV (MotionValue<number>) that the
graph and the rail share. ResizeObserver keeps the rail width in sync
with the resizable graph panel — dragging the column splitter reflows
the rail without re-renders."
```

---

## Task A6: Browser smoke for Time Machine

- [ ] **Step 1: Preview up, navigate to a hero repo**

```
preview_eval(location.href = '/ledger/pmndrs/zustand')
Wait 2s
```

- [ ] **Step 2: Interactions to verify manually**

- Rail renders at the bottom of the graph pane
- Dragging the scrubber left → some nodes fade to ~8% opacity + slate hue, others stay full
- Clicking ▶ plays an animated reveal over ~10s; ▶ becomes ⏸
- Cursor date label updates smoothly (every ~16ms)
- ← and → step by single decision
- Toggling `time` ⇄ `uniform` re-lays the ticks
- At rest (scrubber at right edge) everything is full-opacity

- [ ] **Step 3: Performance check**

Open DevTools Performance tab, record while scrubbing rapidly for 3s. Confirm:
- No "long tasks" >50ms
- FPS stays above 55 on a 41-node zustand graph

If frame rate drops below 45fps, flag: we may need to batch opacity updates. Otherwise, proceed.

- [ ] **Step 4: Commit screenshot**

If anything needed fine-tuning, commit the fix. Otherwise push and watch CI.

```bash
git push
gh run watch $(gh run list --branch main --limit 1 --json databaseId -q '.[0].databaseId') --exit-status
```

---

# Feature B — Provenance Peek (4 hours, ~4 tasks)

## Task B1: ProvenanceCard scaffold + stagger-skip test

**Files:**
- Create: `frontend/components/ProvenanceCard.tsx`
- Test: `frontend/components/ProvenanceCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// frontend/components/ProvenanceCard.test.tsx
import { describe, expect, test } from "vitest";
import { hasBeenSeen, markSeen } from "./ProvenanceCard";

describe("ProvenanceCard seen-set", () => {
  test("fresh chip returns false", () => {
    expect(hasBeenSeen("chip-1")).toBe(false);
  });
  test("after markSeen returns true", () => {
    markSeen("chip-2");
    expect(hasBeenSeen("chip-2")).toBe(true);
  });
  test("different chips stay independent", () => {
    markSeen("chip-a");
    expect(hasBeenSeen("chip-b")).toBe(false);
  });
});
```

- [ ] **Step 2: Stub the module**

```tsx
// frontend/components/ProvenanceCard.tsx
const SEEN = new Set<string>();

export function hasBeenSeen(id: string): boolean {
  return SEEN.has(id);
}
export function markSeen(id: string): void {
  SEEN.add(id);
}
export function resetSeenSet(): void {
  SEEN.clear();
}

// Component exported placeholder (fleshed out in B2)
export function ProvenanceCard() {
  return null;
}
```

- [ ] **Step 3: Run test**

```bash
cd frontend && pnpm vitest run components/ProvenanceCard.test.tsx
```

Expected: 3 passes.

- [ ] **Step 4: Commit**

```bash
cd .. && git add frontend/components/ProvenanceCard.tsx frontend/components/ProvenanceCard.test.tsx && \
  git commit -m "feat(provenance): scaffold + seen-set for stagger-skip"
```

---

## Task B2: Full ProvenanceCard implementation

**Files:**
- Modify: `frontend/components/ProvenanceCard.tsx`

- [ ] **Step 1: Replace the placeholder with the full card**

```tsx
"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";

import type { Citation } from "../lib/api";
import { useReducedMotion } from "../lib/motion";

const SEEN = new Set<string>();
export function hasBeenSeen(id: string): boolean { return SEEN.has(id); }
export function markSeen(id: string): void { SEEN.add(id); }
export function resetSeenSet(): void { SEEN.clear(); }

const SOURCE_GLYPH: Record<string, string> = {
  pr_body: "📄",
  pr_comment: "💬",
  inline_review_comment: "✏️",
  review_comment: "📝",
  commit_message: "🔀",
  issue: "🐛",
};

type Props = {
  chipId: string;
  kind: "context" | "decision" | "forces" | "consequences";
  citation: Citation;
  verified?: boolean | null;
  relatedCount?: number;
  onRelatedClick?: () => void;
};

const KIND_TINT: Record<Props["kind"], string> = {
  decision: "text-[#d4a24c]",
  forces: "text-amber-300",
  consequences: "text-emerald-300",
  context: "text-zinc-400",
};

export function ProvenanceCard({
  chipId,
  kind,
  citation,
  verified,
  relatedCount = 0,
  onRelatedClick,
}: Props) {
  const reduced = useReducedMotion();
  const skipStagger = useMemo(() => hasBeenSeen(chipId), [chipId]);

  // Mark after mount
  useMemo(() => {
    markSeen(chipId);
  }, [chipId]);

  const stagger = (i: number) =>
    reduced || skipStagger ? { duration: 0 } : { delay: i * 0.05, duration: 0.16, ease: "easeOut" as const };

  const fullQuote = citation.quote.trim();
  const firstChar = fullQuote.slice(0, 1);
  const restQuote = fullQuote.slice(1);
  const glyph = SOURCE_GLYPH[citation.source_type] ?? "•";
  const when = citation.timestamp ? new Date(citation.timestamp) : null;

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-950/95 p-4 text-xs shadow-[0_12px_40px_rgba(0,0,0,0.5)]">
      {/* Quote tier */}
      <motion.blockquote
        initial={skipStagger || reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={stagger(0)}
        className="border-l-2 border-[#d4a24c]/60 pl-3 font-serif italic leading-relaxed text-zinc-100"
      >
        <span className={`mr-1 font-serif text-3xl font-bold leading-none ${KIND_TINT[kind]}`}>
          &ldquo;{firstChar}
        </span>
        {restQuote}&rdquo;
      </motion.blockquote>
      {/* Attribution chip */}
      <motion.div
        initial={skipStagger || reduced ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={stagger(1)}
        className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400"
      >
        <span className={KIND_TINT[kind]}>{glyph}</span>
        <span>{citation.source_type.replaceAll("_", " ")}</span>
        {citation.author ? <span>· @{citation.author}</span> : null}
        {when ? (
          <span className="text-zinc-500">
            ·{" "}
            {when.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </span>
        ) : null}
        {verified === true ? <span className="text-emerald-400">✓ verified</span> : null}
        {verified === false ? <span className="text-rose-400">✕ unverified</span> : null}
      </motion.div>
      {/* Related-citations footer */}
      {relatedCount > 0 ? (
        <motion.button
          type="button"
          onClick={onRelatedClick}
          initial={skipStagger || reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={stagger(2)}
          className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition hover:text-[#d4a24c]"
        >
          {relatedCount} other claims cite this thread →
        </motion.button>
      ) : null}
      {/* Open-on-GitHub link */}
      <a
        href={citation.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block font-mono text-[10px] text-zinc-500 transition hover:text-[#d4a24c]"
      >
        ↗ open on GitHub
      </a>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && pnpm tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add frontend/components/ProvenanceCard.tsx && \
  git commit -m "feat(provenance): full editorial card — drop-cap, attribution chip, related footer

Pure-local (no GitHub fetches). Stagger 50ms per tier, skipped on
repeat-hover via seen-set. Verified/unverified badge surfaces self-check
verdict inline. Kind tint propagates from the click site."
```

---

## Task B3: Swap ProvenanceCard into CitationChip

**Files:**
- Modify: `frontend/components/CitationChip.tsx`

- [ ] **Step 1: Replace the inline hover-card JSX with `<ProvenanceCard>`**

Compute the chip id stably:

```tsx
const chipId = `${match.prNumber ?? match.commitSha ?? "x"}-${match.author}-${match.dateIso ?? "x"}-${match.kind}`;
```

Compute related count by scanning the current answer's parsed citations for others with the same `source_id` (the ReasoningTrace already does this parsing once — pass in the parsed array as a prop or compute lazily):

```tsx
const relatedCount = allCitationsInAnswer.filter(
  (c) => c.source_id === citation.source_id && c.token !== match.token,
).length;
```

Hover-pop: replace the existing card content with:

```tsx
<ProvenanceCard
  chipId={chipId}
  kind={(citation.kind as Props["kind"]) ?? "context"}
  citation={citation}
  verified={verified ?? null}
  relatedCount={relatedCount}
/>
```

- [ ] **Step 2: Verify**

```bash
cd frontend && pnpm tsc --noEmit && pnpm biome check components/
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add frontend/components/CitationChip.tsx && \
  git commit -m "feat(provenance): swap CitationChip's inline card for ProvenanceCard

Chip is now trigger-only. All visual logic moved to ProvenanceCard.
Related-count is computed from the answer's parsed citations, not
fetched — zero network cost."
```

---

## Task B4: Browser smoke — hover repeat feels instant

- [ ] **Step 1: Navigate, run query, hover chip, hover again**

```
preview_eval(location.href='/ledger/pmndrs/zustand')
click a suggested query
wait ~15s
hover first citation chip — should stagger in (quote → attribution → related)
unhover
hover SAME chip — should appear instantly (no stagger)
hover a DIFFERENT chip — should stagger again
```

- [ ] **Step 2: If all correct, push**

```bash
git push
gh run watch ...
```

---

# Feature C — Reasoning X-Ray (6 hours, ~7 tasks)

## Task C1: Backend `thought` SSE event in query engine

**Files:**
- Modify: `backend/app/query/engine.py`

- [ ] **Step 1: Emit thought events at phase transitions**

Inside `stream_query`, add `thought` events at precisely these points:

```python
# After the initial yield of phase=retrieving + stats:
yield _sse_event(
    "thought",
    {
        "label": (
            f"loading ledger · {snapshot.decision_count} decisions · "
            f"{sum(1 for d in snapshot.decisions if d.get('citations'))} cited · "
            f"{len(snapshot.edges)} edges"
        ),
    },
)

# Right before `yield _sse_event("phase", "reasoning")`:
yield _sse_event(
    "thought",
    {
        "label": (
            f"scanning {snapshot.decision_count} decisions across "
            f"{len({d['category'] for d in snapshot.decisions})} categories "
            f"· token budget {QUERY_MAX_TOKENS // 1000}K"
        ),
    },
)

# Right before self-check `yield _sse_event("phase", "self_checking")`:
if opts.self_check and full_answer.strip():
    yield _sse_event(
        "thought",
        {"label": "cross-checking every cited claim against ledger text"},
    )

# Right before the `usage` yield:
yield _sse_event(
    "thought",
    {
        "label": (
            f"resolved · {totals.input_tokens // 1000}K in · "
            f"{totals.output_tokens} out · ${round(totals.cost_usd, 4)}"
        ),
    },
)
```

- [ ] **Step 2: Backend test**

Create `backend/tests/test_thought_events.py`:

```python
from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest

from app.ledger.load import LedgerSnapshot
from app.query.engine import stream_query, QueryOptions


class FakeStream:
    async def __aenter__(self): return self
    async def __aexit__(self, *a): return None

    @property
    def text_stream(self):
        async def gen():
            yield "ok"
        return gen()

    async def get_final_message(self):
        class U:
            input_tokens = 100
            output_tokens = 10
            cache_creation_input_tokens = 0
            cache_read_input_tokens = 0
        class F:
            usage = U()
        return F()


class FakeClient:
    class messages:
        @staticmethod
        def stream(**_):
            return FakeStream()

        @staticmethod
        async def create(**_):
            class U:
                input_tokens = 1
                output_tokens = 1
                cache_creation_input_tokens = 0
                cache_read_input_tokens = 0
            class F:
                content = []
                usage = U()
            return F()


@pytest.mark.asyncio
async def test_thought_events_fire_at_key_phases() -> None:
    snapshot = LedgerSnapshot(repo="demo/repo", decisions=[], edges=[])
    events: list[str] = []
    async for chunk in stream_query(
        FakeClient(),
        snapshot,
        "why?",
        options=QueryOptions(self_check=False),
    ):
        for line in chunk.splitlines():
            if line.startswith("event: thought"):
                events.append(line)
    assert len(events) >= 2  # loading + scanning + resolved
```

- [ ] **Step 3: Run tests**

```bash
cd backend && uv run pytest tests/test_thought_events.py -v
```

Expected: 1 pass.

- [ ] **Step 4: Lint + commit**

```bash
cd backend && uv run black app/ tests/ && uv run ruff check app/ tests/ && uv run mypy app/
cd .. && git add backend/app/query/engine.py backend/tests/test_thought_events.py && \
  git commit -m "feat(x-ray): emit truthful 'thought' SSE events at phase transitions

Five synthetic-but-sourced lines across a query's lifecycle: loading,
scanning, (self-check), resolving. Every string is computed from real
snapshot/totals state — nothing invented. Backward-compat: older clients
just ignore the new event type."
```

---

## Task C2: Mirror thought events in impact router

**Files:**
- Modify: `backend/app/routers/impact.py`

- [ ] **Step 1: Add thoughts at impact phase transitions**

Place thought events analogous to Task C1 — at subgraph build (`"bfs subgraph · N decisions · M edges · anchor PR #X"`), before reasoning (`"reasoning over N-node subgraph"`), and after usage (`"resolved · impact ripple"`).

- [ ] **Step 2: Commit**

```bash
git add backend/app/routers/impact.py && \
  git commit -m "feat(x-ray): mirror thought events in /api/impact

Same signal shape, scoped to the subgraph. UI can render a unified
trace across query and impact modes."
```

---

## Task C3: Frontend query.ts onThought subscriber

**Files:**
- Modify: `frontend/lib/query.ts`

- [ ] **Step 1: Add callback**

Locate the `startQuery` stream reader (or equivalent `EventSource` subscriber). Add an `onThought` callback alongside existing ones:

```ts
export type ThoughtEvent = { label: string };
export type QueryCallbacks = {
  // ...existing
  onThought?: (t: ThoughtEvent) => void;
};
```

Inside the event-switch:

```ts
case "thought": {
  try {
    const payload = JSON.parse(data) as ThoughtEvent;
    callbacks.onThought?.(payload);
  } catch { /* ignore */ }
  break;
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd frontend && pnpm tsc --noEmit
cd .. && git add frontend/lib/query.ts && \
  git commit -m "feat(x-ray): onThought callback in startQuery stream reader"
```

---

## Task C4: ReasoningXRay component

**Files:**
- Create: `frontend/components/ReasoningXRay.tsx`

- [ ] **Step 1: Full implementation**

```tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

import { useReducedMotion } from "../lib/motion";

export type TraceStep = {
  id: string;
  timestamp: number; // ms since stream start
  kind: "phase" | "citation" | "thought";
  text: string;
};

type Props = {
  steps: TraceStep[];
  outputTokens: number;
  maxTokens: number; // e.g. 8192
  done: boolean;
};

export function ReasoningXRay({ steps, outputTokens, maxTokens, done }: Props) {
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem("xray.open");
    return saved === null ? true : saved === "1";
  });
  useEffect(() => {
    window.localStorage.setItem("xray.open", open ? "1" : "0");
  }, [open]);

  // Graceful dissolve on done — scan-line fades, panel auto-collapses
  // after 1s (unless user has expanded manually mid-stream)
  const userOpenedRef = useRef(false);
  const [scanOpacity, setScanOpacity] = useState(1);

  useEffect(() => {
    if (!done) return;
    const fade = setTimeout(() => setScanOpacity(0), 0);
    const collapse = setTimeout(() => {
      if (!userOpenedRef.current) setOpen(false);
    }, 1600);
    return () => {
      clearTimeout(fade);
      clearTimeout(collapse);
    };
  }, [done]);

  const progress = useMemo(() => Math.min(1, outputTokens / maxTokens), [outputTokens, maxTokens]);

  if (steps.length === 0) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/60">
      <button
        type="button"
        onClick={() => {
          userOpenedRef.current = true;
          setOpen((v) => !v);
        }}
        className="flex w-full items-center justify-between px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-zinc-400 transition hover:bg-zinc-900/60"
      >
        <span className="flex items-center gap-2">
          <span className="text-cyan-400">⚡</span>
          <span>reasoning trace</span>
          <span className="text-zinc-600">· {steps.length} steps</span>
        </span>
        <span className={open ? "rotate-90 text-[#d4a24c]" : "text-zinc-600"}>›</span>
      </button>
      {!done ? (
        <div className="relative h-0.5 bg-zinc-900">
          <motion.div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500/40 via-cyan-300 to-cyan-500/40"
            style={{ width: `${Math.round(progress * 100)}%`, opacity: scanOpacity }}
            transition={reduced ? { duration: 0 } : { duration: 0.15 }}
          />
        </div>
      ) : null}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.ul
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduced ? { duration: 0 } : { duration: 0.2, ease: "easeOut" }}
            className="space-y-1 overflow-hidden border-t border-cyan-400/20 bg-black/40 px-3 py-2"
          >
            {steps.map((s) => (
              <motion.li
                key={s.id}
                initial={reduced ? false : { opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={reduced ? { duration: 0 } : { duration: 0.14, ease: "easeOut" }}
                className="flex items-baseline gap-2 font-mono text-[10px] leading-relaxed"
              >
                <span className="w-14 tabular-nums text-cyan-400/80">
                  ⟶ {(s.timestamp / 1000).toFixed(1)}s
                </span>
                <span className={s.kind === "citation" ? "text-[#d4a24c]" : "text-cyan-100"}>
                  {s.text}
                </span>
              </motion.li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd .. && git add frontend/components/ReasoningXRay.tsx && \
  git commit -m "feat(x-ray): ReasoningXRay panel — cyan scan-line + amber citations

Two-palette hierarchy (cyan for system logic, amber for historical data).
Graceful dissolve on done: scan-line fades 0→0 opacity over 600ms, then
panel auto-collapses after 1s unless the user manually opened it during
the stream. Reduced-motion aware."
```

---

## Task C5: Wire X-Ray into AskPanel with client-side citation discovery

**Files:**
- Modify: `frontend/components/AskPanel.tsx`

- [ ] **Step 1: Track steps + mount panel**

```tsx
import { ReasoningXRay, type TraceStep } from "./ReasoningXRay";
import { parseCitations } from "../lib/citations";

// Inside AskPanel state:
const [steps, setSteps] = useState<TraceStep[]>([]);
const [outputTokens, setOutputTokens] = useState(0);
const streamStartRef = useRef<number>(0);
const seenCitations = useRef<Set<string>>(new Set());

const pushStep = (kind: TraceStep["kind"], text: string) => {
  const ts = performance.now() - streamStartRef.current;
  setSteps((prev) => [...prev, { id: `${kind}-${prev.length}`, timestamp: ts, kind, text }]);
};

// At the start of run():
setSteps([]);
streamStartRef.current = performance.now();
seenCitations.current.clear();

// Inside run's startQuery callbacks, add:
onPhase: (phase) => {
  setPhase(phase);
  pushStep("phase", phase.replace("_", " "));
},
onThought: (t) => pushStep("thought", t.label),
onDelta: (text) => {
  setAnswer((prev) => prev + text);
  // Detect freshly-discovered citations
  const fresh = parseCitations(text);
  for (const m of fresh) {
    if (!seenCitations.current.has(m.token)) {
      seenCitations.current.add(m.token);
      if (m.prNumber) {
        const title = decisions.find((d) => d.pr_number === m.prNumber)?.title ?? "";
        pushStep("citation", `resolved citation → PR #${m.prNumber} ${title ? "· " + title.slice(0, 40) : ""}`);
      }
    }
  }
},
onUsage: (u) => {
  setUsage(u);
  setOutputTokens(u.output_tokens);
},
```

In the render tree, after `<ReasoningTrace ... />`:

```tsx
<ReasoningXRay
  steps={steps}
  outputTokens={outputTokens}
  maxTokens={8192}
  done={phase === "done"}
/>
```

- [ ] **Step 2: Typecheck + biome**

```bash
cd frontend && pnpm tsc --noEmit && pnpm biome check components/AskPanel.tsx
```

- [ ] **Step 3: Commit**

```bash
cd .. && git add frontend/components/AskPanel.tsx && \
  git commit -m "feat(x-ray): mount ReasoningXRay inside AskPanel with live trace

Trace combines three signal sources: phase events, backend thought events,
and client-side citation-token discovery from the delta stream. Each
event timestamped relative to stream start — real timing."
```

---

## Task C6: Browser smoke — X-Ray + demo dry-run

- [ ] **Step 1: Run a query on zustand**

```
preview_eval(location.href='/ledger/pmndrs/zustand')
click suggested query
observe the ReasoningXRay panel expands below the answer
scan-line progresses cyan
trace lines accumulate: phase → thought → citation, citation, citation...
on done: scan-line fades, trace collapses after 1s
```

- [ ] **Step 2: Final demo dry-run of all four features in one flow**

In a single session:
1. Land on gallery — see cost badges
2. Click zustand — graph loads with timeline rail at bottom
3. Hit play on timeline → watch 10s reveal
4. Ask "Why does persist middleware use a hydrationVersion counter?"
5. X-Ray expands during stream
6. Hover a citation chip → ProvenanceCard unfurls
7. Click same citation chip → graph pans, kin tints
8. Press Esc → clears thread
9. Navigate back to gallery

If any step has jank or delay, log it and fix.

- [ ] **Step 3: Commit + push + CI**

```bash
git push
gh run watch ...
```

---

# Feature DEMO — Script & Video Take (3 hours, ~2 tasks)

## Task DEMO1: Rewrite DEMO-SCRIPT.md segments 2 + 3

**Files:**
- Modify: `docs/DEMO-SCRIPT.md`

- [ ] **Step 1: Rewrite segment 2 to lead with Time Machine**

Replace segment 2's body with:

```markdown
## Segment 2 — the ledger comes alive (30 s)

Click `pmndrs/zustand`. The graph reveals — 41 category-coloured nodes.
Hit the ▶ on the timeline rail at the bottom.

> *"Opus 4.7 read every merged PR, every review thread, every linked issue —
> classified them, extracted rationales, and stitched this into a graph of
> decisions across three years. Watch it build itself."*

The graph animates from empty → present over 10 seconds, nodes fading in
at their merge dates with an amber pulse, edges drawing themselves as
both endpoints surface. Stop on "present."

> *"Red animated edges are `supersedes`; dashed blue are `depends_on`.
> The amber ring around #3336 is the newest decision."*
```

Replace segment 3's body to add X-Ray + Provenance Peek + Follow the Thread:

```markdown
## Segment 3 — ask, watch, verify, navigate (60 s)

Move to the ask panel. Click *"Why does persist middleware use a
hydrationVersion counter?"*.

> *"Now we ask a question the code itself can't answer. Opus 4.7 holds the
> entire ledger in one context and reasons with citations live."*

The answer streams in. Below it, the Reasoning X-Ray expands — a cyan
scan-line at the top, a vertical trace showing what Opus is doing:
`loading ledger · 41 decisions` · `scanning 41 decisions across 4
categories · token budget 8K` · `resolved citation → PR #3336 ·
hydrationVersion counter` · `cross-checking every cited claim against
ledger text` · `resolved · all citations verified`.

> *"The cyan trace is Opus's live thinking; the amber lines are the
> historical decisions it's pulling in. Every line is real signal —
> we're not faking a thought process."*

Hover a citation chip — the Provenance Peek unfurls. Amber drop-cap,
italic serif quote, attribution chip, mini-timeline showing where this
comment fell in the PR's discussion, and a "3 other claims cite this
thread" link.

> *"Every citation is the actual reviewer's words, quoted verbatim from
> the PR, verified by self-check against the ledger."*

Click the same chip. The graph pans smoothly to #3336, it pulses amber,
and four kin decisions softly tint — decisions citing the same PR,
same author, or directly connected. Status chip top-left: `following
thread: PR #3336 · 4 kin · clear`.

> *"Citations aren't text — they're a map. Click any one, the graph
> becomes a view of that decision's kin."*

Press Esc to clear.
```

- [ ] **Step 2: Update the totals section**

Refresh `Totals at record time` with new numbers pulled from the ledger after the final run.

- [ ] **Step 3: Commit**

```bash
git add docs/DEMO-SCRIPT.md && \
  git commit -m "docs(demo): rewrite segments 2+3 for Time Machine, X-Ray, Peek, Thread

Segment 2 now leads with the 10-second cinematic graph build-up via
the timeline rail. Segment 3 flows ask → x-ray expand → hover peek →
click follow. Script voiceover tuned to each on-screen beat."
```

---

## Task DEMO2: Manual demo dry-run (recorded) + final push

- [ ] **Step 1: QuickTime screen-record a 90–120s take**

Follow DEMO-SCRIPT exactly. Record several takes; keep the cleanest.

- [ ] **Step 2: Commit any final tweaks that surfaced during the take**

For any jitter or delay noticed, patch + commit. Common likely fixes: slow first-play of TimelineRail (preload), initial stagger of ProvenanceCard on fresh-mount chips.

- [ ] **Step 3: Final push + submission**

```bash
git push
gh run watch ...
```

Confirm CI green. Tag:

```bash
git tag -a submission-v1 -m "Hackathon submission v1 — 2026-04-26"
git push origin submission-v1
```

---

## Self-review checklist

| Spec section | Covered by |
|---|---|
| 2. Time Machine (A) | A1–A6 |
| 3. Provenance Peek (B) | B1–B4 |
| 4. Reasoning X-Ray (C) | C1–C6 |
| 5. Follow the Thread (E) | E1–E6 |
| 6. Shared infra (color tokens, motion constants, graph props) | A1 (tokens), A4 (context), E5 (graph prop extension) |
| 7. YAGNI list | Enforced by task scope — no tasks for deferred items |
| 8. Demo script integration | DEMO1–DEMO2 |
| 9. Test plan | Vitest unit tests in A2/B1/E1; backend pytest in C1; browser smoke in E6/A6/B4/C6 |
| 10. Rollout order | E → A → B → C strictly enforced |
| 11. Risks | MotionValue perf check in A6; thought events sourced from real state in C1; buffer-zero policy honored via task order |

No placeholders. Type consistency: `KinshipTarget`, `KinshipResult`, `ThreadState`, `TraceStep`, `Tick`, `TickCluster`, `Scale` are defined once and reused. `onFollow` signature `(args: { prNumber: number; author: string }) => void` identical across CitationChip, ReasoningTrace, AskPanel, LedgerPage.
