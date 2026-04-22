"use client";

import dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  type Edge as FlowEdge,
  type Node as FlowNode,
  Handle,
  type NodeProps,
  Position,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";

import type { Decision, Edge } from "../lib/api";
import { categoryStyle } from "./CategoryBadge";

type DecisionNodeData = {
  pr: number;
  title: string;
  category: string;
  selected: boolean;
  inSubgraph: boolean;
  isAnchor: boolean;
  subgraphActive: boolean;
};

const NODE_WIDTH = 210;
const NODE_HEIGHT = 64;

function DecisionNode({ data }: NodeProps<FlowNode<DecisionNodeData>>) {
  const style = categoryStyle(data.category);
  const ring = data.isAnchor
    ? "ring-2 ring-[#d4a24c] shadow-[0_0_24px_var(--accent-glow)] scale-[1.08]"
    : data.selected
      ? "ring-2 ring-zinc-300 scale-[1.04] shadow-lg shadow-black/50"
      : data.inSubgraph
        ? "ring-1 ring-[#d4a24c]/60 shadow-[0_0_12px_rgba(212,162,76,0.25)]"
        : "shadow-md shadow-black/40";
  const dim = data.subgraphActive && !data.inSubgraph && !data.isAnchor ? "opacity-30" : "";
  return (
    <div
      className={`flex flex-col rounded-lg border px-3 py-2 text-left font-mono text-[11px] leading-tight transition-all duration-300 ${ring} ${style.bg} ${style.border} ${style.text} ${dim}`}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-600 !border-0" />
      <span className="text-zinc-500">#{data.pr}</span>
      <span className="mt-0.5 line-clamp-3 text-zinc-100">{data.title}</span>
      <Handle type="source" position={Position.Right} className="!bg-zinc-600 !border-0" />
    </div>
  );
}

const NODE_TYPES = { decision: DecisionNode } as const;

const EDGE_STYLES: Record<string, { stroke: string; strokeDasharray?: string }> = {
  supersedes: { stroke: "#f87171" },
  depends_on: { stroke: "#60a5fa", strokeDasharray: "6 4" },
  related_to: { stroke: "#a1a1aa", strokeDasharray: "2 4" },
};

/**
 * Dagre-hierarchical layout. Sorts each rank chronologically so "the older
 * the decision the further left it sits" still reads in the chrome even
 * though edges drive the actual structure.
 */
function layoutWithDagre(
  decisions: Decision[],
  edges: Edge[],
): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph({ compound: false });
  g.setGraph({
    rankdir: "LR",
    nodesep: 28,
    ranksep: 84,
    marginx: 32,
    marginy: 32,
    ranker: "longest-path",
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const d of decisions) {
    g.setNode(d.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const e of edges) {
    g.setEdge(e.from_id, e.to_id);
  }

  dagre.layout(g);

  const out = new Map<string, { x: number; y: number }>();
  for (const d of decisions) {
    const n = g.node(d.id);
    if (n) {
      // Dagre returns center-coords; React Flow wants top-left.
      out.set(d.id, { x: n.x - NODE_WIDTH / 2, y: n.y - NODE_HEIGHT / 2 });
    }
  }

  // Isolates (no edges) fall through at x=0,y=0 from dagre. Stack them in a
  // trailing column sorted by time so they aren't a dogpile.
  const withoutPos = decisions.filter((d) => !out.has(d.id));
  if (withoutPos.length) {
    const maxX = Math.max(0, ...Array.from(out.values()).map((p) => p.x + NODE_WIDTH));
    const sorted = [...withoutPos].sort((a, b) =>
      (a.decided_at ?? "").localeCompare(b.decided_at ?? ""),
    );
    sorted.forEach((d, i) => {
      out.set(d.id, { x: maxX + 60, y: i * (NODE_HEIGHT + 24) });
    });
  }

  return out;
}

function TimeAxisRail({ earliest, latest }: { earliest: string | null; latest: string | null }) {
  if (!earliest || !latest) return null;
  const start = new Date(earliest);
  const end = new Date(latest);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  const labels: string[] = [];
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  for (let y = startYear; y <= endYear; y++) {
    labels.push(String(y));
  }
  return (
    <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 border-t border-zinc-800/60 bg-black/40 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-4xl items-center justify-between px-6 font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-500">
        <span>{labels[0]}</span>
        <span className="mx-4 flex-1 border-t border-dashed border-zinc-700/50" />
        <span>time →</span>
        <span className="mx-4 flex-1 border-t border-dashed border-zinc-700/50" />
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  );
}

function CategoryLegend({ categories }: { categories: string[] }) {
  const sorted = Array.from(new Set(categories)).sort();
  return (
    <div className="pointer-events-auto absolute right-3 top-3 max-w-[220px] rounded-lg border border-zinc-800 bg-zinc-950/80 p-2 font-mono text-[10px] leading-tight text-zinc-400 backdrop-blur-sm">
      <div className="mb-1 uppercase tracking-[0.18em] text-zinc-500">categories</div>
      <ul className="flex flex-wrap gap-1">
        {sorted.map((c) => {
          const s = categoryStyle(c);
          return (
            <li
              key={c}
              className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 ${s.bg} ${s.text} ${s.border}`}
            >
              {c.replaceAll("_", " ")}
            </li>
          );
        })}
      </ul>
      <div className="mt-2 border-t border-zinc-800 pt-2 space-y-0.5 text-zinc-500">
        <div className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-5 bg-[#f87171]" />
          supersedes
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-0.5 w-5 bg-[#60a5fa]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #60a5fa 0 3px, transparent 3px 6px)",
            }}
          />
          depends on
        </div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-0.5 w-5"
            style={{
              backgroundImage:
                "repeating-linear-gradient(90deg, #a1a1aa 0 2px, transparent 2px 4px)",
            }}
          />
          related
        </div>
      </div>
    </div>
  );
}

export function LedgerGraph({
  decisions,
  edges,
  selectedId,
  onSelect,
  subgraphAnchorPr,
  subgraphPrs,
}: {
  decisions: Decision[];
  edges: Edge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  subgraphAnchorPr?: number | null;
  subgraphPrs?: number[] | null;
}) {
  const { nodes, flowEdges, categories, earliest, latest } = useMemo(() => {
    const positions = layoutWithDagre(decisions, edges);
    const subgraphSet = new Set(subgraphPrs ?? []);
    const subgraphActive = subgraphSet.size > 0;

    const nodes: FlowNode<DecisionNodeData>[] = decisions.map((d) => {
      const inSubgraph = subgraphSet.has(d.pr_number);
      const isAnchor = subgraphAnchorPr != null && subgraphAnchorPr === d.pr_number;
      return {
        id: d.id,
        type: "decision",
        position: positions.get(d.id) ?? { x: 0, y: 0 },
        data: {
          pr: d.pr_number,
          title: d.title,
          category: d.category,
          selected: d.id === selectedId,
          inSubgraph,
          isAnchor,
          subgraphActive,
        },
      };
    });

    const flowEdges: FlowEdge[] = edges.map((e, idx) => {
      const inSub = subgraphActive && subgraphSet.has(e.from_pr) && subgraphSet.has(e.to_pr);
      const baseStyle = EDGE_STYLES[e.kind] ?? EDGE_STYLES.related_to;
      return {
        id: `${e.from_id}-${e.to_id}-${idx}`,
        source: e.from_id,
        target: e.to_id,
        label: e.kind.replace("_", " "),
        labelStyle: { fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" },
        labelBgStyle: { fill: "#18181b", fillOpacity: 0.8 },
        labelBgPadding: [4, 2],
        style: {
          ...baseStyle,
          strokeWidth: inSub ? 2.4 : 1.2,
          opacity: subgraphActive ? (inSub ? 1 : 0.15) : 0.85,
        },
        animated: inSub || e.kind === "supersedes",
      };
    });

    const times = decisions
      .map((d) => d.decided_at)
      .filter((x): x is string => !!x)
      .sort();
    return {
      nodes,
      flowEdges,
      categories: decisions.map((d) => d.category),
      earliest: times[0] ?? null,
      latest: times[times.length - 1] ?? null,
    };
  }, [decisions, edges, selectedId, subgraphAnchorPr, subgraphPrs]);

  return (
    <div className="relative h-full w-full bg-black">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, node) => onSelect(node.id)}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        minZoom={0.12}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#18181b" gap={28} />
        <Controls className="!bg-zinc-900 !border-zinc-800" />
      </ReactFlow>
      <CategoryLegend categories={categories} />
      <TimeAxisRail earliest={earliest} latest={latest} />
    </div>
  );
}
