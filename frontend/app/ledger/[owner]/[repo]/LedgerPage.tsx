"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Group, Panel, type PanelImperativeHandle, Separator } from "react-resizable-panels";

import { AskPanel } from "../../../../components/AskPanel";
import { DecisionSidePanel } from "../../../../components/DecisionSidePanel";
import { LedgerGraph } from "../../../../components/LedgerGraph";
import type { LedgerResponse } from "../../../../lib/api";
import { useReducedMotion } from "../../../../lib/motion";

// react-resizable-panels v4 treats bare numeric values as PIXELS — we have to
// pass strings with a unit suffix to get percentages.
const SIDE_PANEL_OPEN = "22%";
const ASK_PANEL_DEFAULT = "34%";
const ASK_PANEL_COLLAPSED = "4%";
const GRAPH_DEFAULT = "66%";
const SIDE_PANEL_MIN = "15%";
const GRAPH_MIN = "25%";
const ASK_PANEL_MIN = "4%";

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

  const sidePanelRef = useRef<PanelImperativeHandle | null>(null);
  const askPanelRef = useRef<PanelImperativeHandle | null>(null);

  // Auto-open the side panel when a decision is clicked; collapse when cleared.
  useEffect(() => {
    const panel = sidePanelRef.current;
    if (!panel) return;
    if (selected) {
      panel.expand();
      panel.resize(SIDE_PANEL_OPEN);
    } else {
      panel.collapse();
    }
  }, [selected]);

  // Ask-panel resize follows the collapsed toggle.
  useEffect(() => {
    const panel = askPanelRef.current;
    if (!panel) return;
    panel.resize(askCollapsed ? ASK_PANEL_COLLAPSED : ASK_PANEL_DEFAULT);
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

  return (
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
          {/* GRAPH — primary surface, gets the bulk of the width by default. */}
          <Panel id="graph" defaultSize={GRAPH_DEFAULT} minSize={GRAPH_MIN}>
            <section className="relative h-full border-r border-zinc-800">
              <LedgerGraph
                decisions={ledger.decisions}
                edges={ledger.edges}
                selectedId={selectedId}
                onSelect={setSelectedId}
                subgraphAnchorPr={subgraph?.anchorPr ?? null}
                subgraphPrs={subgraph?.prs ?? null}
              />
              {subgraph ? (
                <button
                  type="button"
                  onClick={() => setSubgraph(null)}
                  className="absolute left-3 top-3 rounded-md border border-[#d4a24c]/60 bg-[#d4a24c]/10 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-[#d4a24c] transition hover:border-[#d4a24c]"
                >
                  impact subgraph: {subgraph.prs.length} nodes · clear
                </button>
              ) : null}
            </section>
          </Panel>

          <ResizeSeparator />

          {/* SIDE PANEL — collapsed by default; opens when a node is selected. */}
          <Panel
            id="side"
            panelRef={sidePanelRef}
            defaultSize="0%"
            minSize={SIDE_PANEL_MIN}
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

          <ResizeSeparator />

          {/* ASK PANEL — always rendered; collapses to an edge tab via ⌘\. */}
          <Panel
            id="ask"
            panelRef={askPanelRef}
            defaultSize={ASK_PANEL_DEFAULT}
            minSize={ASK_PANEL_MIN}
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
              />
            )}
          </Panel>
        </Group>
      </div>
    </div>
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
