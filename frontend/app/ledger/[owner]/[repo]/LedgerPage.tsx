"use client";

import { AnimatePresence, motion, useMotionValue } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Group, Panel, type PanelImperativeHandle, Separator } from "react-resizable-panels";

import { AskPanel } from "../../../../components/AskPanel";
import { DecisionSidePanel } from "../../../../components/DecisionSidePanel";
import { ConflictFinderButton } from "../../../../components/ConflictFinderButton";
import { InterviewButton } from "../../../../components/InterviewButton";
import { InterviewDrawer } from "../../../../components/InterviewDrawer";
import { LedgerGraph } from "../../../../components/LedgerGraph";
import { TimelineRail } from "../../../../components/TimelineRail";
import { useThreadFollower } from "../../../../hooks/useThreadFollower";
import type { LedgerResponse } from "../../../../lib/api";
import { useTypedCue } from "../../../../lib/demo/TypedInput";
import { useCueTrigger } from "../../../../lib/demo/useDemoClock";
import { InterviewProvider } from "../../../../lib/InterviewProvider";
import { useReducedMotion } from "../../../../lib/motion";

// react-resizable-panels v4 treats bare numeric values as PIXELS — we have to
// pass strings with a unit suffix to get percentages.
//
// Layout: outer group is [ graph | right-rail ]. The right-rail itself is an
// inner group of [ side | ask ], so dragging the side↔ask separator never
// disturbs the graph's width. On first load the graph owns 72% and the whole
// right rail is the ask panel; clicking a decision opens the side panel inside
// the rail without stealing pixels from the graph.
const GRAPH_DEFAULT = "72%";
const GRAPH_MIN = "40%";
const RIGHT_DEFAULT = "28%";
const RIGHT_MIN = "20%";
// Sizes inside the inner (right-rail) group — these are percentages of the rail,
// not of the viewport.
const SIDE_OPEN_IN_RAIL = "55%";
const ASK_DEFAULT_IN_RAIL = "100%";
const ASK_COLLAPSED_IN_RAIL = "14%";

export function LedgerPage({
  ledger,
  suggestedQueries,
}: {
  ledger: LedgerResponse;
  suggestedQueries: string[];
}) {
  const reduced = useReducedMotion();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [subgraph, setSubgraph] = useState<{ anchorPr: number; prs: number[] } | null>(null);
  const [askCollapsed, setAskCollapsed] = useState(false);
  const selected = ledger.decisions.find((d) => d.id === selectedId) ?? null;
  const thread = useThreadFollower(ledger.decisions, ledger.edges);

  const sidePanelRef = useRef<PanelImperativeHandle | null>(null);
  const askPanelRef = useRef<PanelImperativeHandle | null>(null);

  // Demo cue triggers — all no-ops when not in demo mode (cue never fires
  // because the clock never starts).
  useTypedCue("type-query", "textarea#q", "Why does Hono reject node:* modules in core?");
  useTypedCue("type-impact-query", "textarea#q", "What breaks if node:* is allowed in core?");
  useCueTrigger("time-machine-play", () => {
    const btn = document.querySelector<HTMLButtonElement>('button[title^="play"]');
    btn?.click();
  });
  useCueTrigger("click-node-4291", () => {
    const node = document.querySelector<HTMLElement>("[data-pr='4291']");
    node?.click();
  });
  useCueTrigger("click-node-3813", () => {
    const node = document.querySelector<HTMLElement>("[data-pr='3813']");
    node?.click();
  });
  useCueTrigger("hover-first-chip", () => {
    const chip = document.querySelector<HTMLElement>('.relative.inline-block a[href*="github"]');
    chip?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  });
  useCueTrigger("click-first-chip", () => {
    const chip = document.querySelector<HTMLElement>('.relative.inline-block a[href*="github"]');
    chip?.click();
  });

  // Time Machine: a single cutoff motion value shared by the graph (per-node
  // opacity pipeline) and the scrubber rail. Starts at +Infinity ("present"
  // — every decision visible); scrubbing left fades anything younger than the
  // cursor.
  const cutoffMV = useMotionValue(Number.POSITIVE_INFINITY);
  const graphPaneRef = useRef<HTMLElement | null>(null);
  const [railWidth, setRailWidth] = useState(800);
  useEffect(() => {
    const el = graphPaneRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 800;
      // Rail occupies the full graph pane horizontally; sub-component padding
      // handles its own breathing room.
      setRailWidth(Math.max(200, w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-open the side panel when a decision is clicked; collapse when cleared.
  useEffect(() => {
    const panel = sidePanelRef.current;
    if (!panel) return;
    if (selected) {
      panel.expand();
      panel.resize(SIDE_OPEN_IN_RAIL);
    } else {
      panel.collapse();
    }
  }, [selected]);

  // Ask-panel resize follows the collapsed toggle.
  useEffect(() => {
    const panel = askPanelRef.current;
    if (!panel) return;
    panel.resize(askCollapsed ? ASK_COLLAPSED_IN_RAIL : ASK_DEFAULT_IN_RAIL);
  }, [askCollapsed]);

  // Keyboard shortcuts: ⌘\ toggles the ask panel; Esc clears selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setAskCollapsed((v) => !v);
      }
      if (e.key === "Escape" && selectedId) {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  const repoSlugs = ledger.repo.split("/");
  const owner = repoSlugs[0] ?? "";
  const repo = repoSlugs[1] ?? "";

  return (
    <InterviewProvider owner={owner} repo={repo}>
      <div className="flex h-screen flex-col bg-black text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-5 py-3 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <Link
            href="/"
            className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500 transition hover:text-zinc-200"
          >
            ← postmortem
          </Link>
          <span className="font-mono text-sm text-zinc-200">{ledger.repo}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-zinc-500">
            {ledger.decision_count} decisions · {ledger.citation_count} citations ·{" "}
            {ledger.alternative_count} alts · {ledger.edge_count} edges
          </span>
          <span className="h-4 w-px bg-zinc-800" />
          <span
            className="font-mono text-[11px] uppercase tracking-wider text-zinc-500"
            title={`ingestion $${ledger.cost.ingestion_cost_usd.toFixed(2)} · ${ledger.cost.query_count} queries $${ledger.cost.query_cost_usd.toFixed(2)}`}
          >
            <span className="tabular-nums text-[#d4a24c]">
              ${ledger.cost.total_cost_usd.toFixed(2)}
            </span>{" "}
            ledger cost
          </span>
          <span className="h-4 w-px bg-zinc-800" />
          <InterviewButton variant="toolbar" owner={owner} repo={repo} />
          <ConflictFinderButton repo={`${owner}/${repo}`} />
          <span className="h-4 w-px bg-zinc-800" />
          <button
            type="button"
            onClick={() => setAskCollapsed((v) => !v)}
            title="Toggle ask panel · ⌘\"
            className="rounded-md border border-zinc-800 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500 transition hover:border-[#d4a24c]/50 hover:text-zinc-200"
          >
            {askCollapsed ? "expand ask ⌘\\" : "collapse ask ⌘\\"}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <Group orientation="horizontal" className="h-full">
          {/* GRAPH — primary surface. Gets the bulk of the viewport and is NOT
              affected when the user drags the side↔ask separator (that handle
              lives in the inner group). */}
          <Panel id="graph" defaultSize={GRAPH_DEFAULT} minSize={GRAPH_MIN}>
            <section
              ref={graphPaneRef}
              className="relative flex h-full flex-col border-r border-zinc-800"
            >
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
                {thread.state.anchorPr !== null ? (
                  <button
                    type="button"
                    onClick={thread.clear}
                    className="absolute left-3 top-3 rounded-md border border-[#d4a24c]/60 bg-[#d4a24c]/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#d4a24c] transition hover:border-[#d4a24c]"
                  >
                    following thread: PR #{thread.state.anchorPr} · {thread.state.kinIds.size} kin ·
                    clear
                  </button>
                ) : subgraph ? (
                  <button
                    type="button"
                    onClick={() => setSubgraph(null)}
                    className="absolute left-3 top-3 rounded-md border border-[#d4a24c]/60 bg-[#d4a24c]/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#d4a24c] transition hover:border-[#d4a24c]"
                  >
                    impact subgraph: {subgraph.prs.length} nodes · clear
                  </button>
                ) : null}
              </div>
              <TimelineRail decisions={ledger.decisions} cutoffMV={cutoffMV} width={railWidth} />
            </section>
          </Panel>

          <ResizeSeparator />

          {/* RIGHT RAIL — hosts the inner [ side | ask ] group. Resizing
              within this panel stays local to the rail. */}
          <Panel id="right" defaultSize={RIGHT_DEFAULT} minSize={RIGHT_MIN}>
            <Group orientation="horizontal" className="h-full">
              {/* SIDE PANEL — collapsed by default; opens when a node is selected. */}
              <Panel
                id="side"
                panelRef={sidePanelRef}
                defaultSize="0%"
                minSize="30%"
                collapsedSize="0%"
                collapsible
                className="bg-zinc-950"
              >
                <AnimatePresence>
                  {selected ? (
                    <motion.section
                      key={selected.id}
                      initial={reduced ? false : { opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 20 }}
                      transition={reduced ? { duration: 0 } : { duration: 0.22, ease: "easeOut" }}
                      className="flex h-full flex-col border-r border-zinc-800"
                    >
                      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-3 py-2 backdrop-blur">
                        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                          decision detail
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedId(null)}
                          title="Close (Esc)"
                          className="rounded-sm px-2 py-0.5 font-mono text-[11px] text-zinc-500 transition hover:bg-zinc-900 hover:text-zinc-100"
                        >
                          ×
                        </button>
                      </div>
                      <div className="flex-1 overflow-hidden">
                        <DecisionSidePanel decision={selected} />
                      </div>
                    </motion.section>
                  ) : null}
                </AnimatePresence>
              </Panel>

              {selected ? <ResizeSeparator /> : null}

              {/* ASK PANEL — always rendered; collapses to an edge tab via ⌘\. */}
              <Panel
                id="ask"
                panelRef={askPanelRef}
                defaultSize={ASK_DEFAULT_IN_RAIL}
                minSize={ASK_COLLAPSED_IN_RAIL}
              >
                {askCollapsed ? (
                  <button
                    type="button"
                    onClick={() => setAskCollapsed(false)}
                    className="group flex h-full w-full flex-col items-center justify-center gap-3 border-l border-zinc-800 bg-zinc-950/60 transition hover:bg-zinc-900"
                    title="Expand ask panel (⌘\)"
                  >
                    <span
                      className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-500 group-hover:text-zinc-200"
                      style={{ writingMode: "vertical-rl" }}
                    >
                      ask postmortem
                    </span>
                    <span className="font-mono text-lg text-[#d4a24c]">⌘\</span>
                  </button>
                ) : (
                  <AskPanel
                    repo={ledger.repo}
                    decisions={ledger.decisions}
                    suggestedQueries={suggestedQueries}
                    selectedDecision={selected}
                    onSubgraph={(anchorPr, prs) => setSubgraph({ anchorPr, prs })}
                    onFollow={thread.follow}
                  />
                )}
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
        <InterviewDrawer owner={owner} repo={repo} decisions={ledger.decisions} />
      </div>
    </InterviewProvider>
  );
}

function ResizeSeparator() {
  return (
    <Separator className="group relative w-[3px] cursor-col-resize bg-zinc-900 transition hover:bg-[#d4a24c]/60 data-[active=true]:bg-[#d4a24c]">
      <span className="pointer-events-none absolute inset-y-0 -left-1 -right-1 flex items-center justify-center">
        <span className="h-8 w-[3px] rounded-full bg-zinc-800 transition group-hover:bg-[#d4a24c]" />
      </span>
    </Separator>
  );
}
