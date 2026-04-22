"use client";

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
};

function DecisionNode({ data }: NodeProps<FlowNode<DecisionNodeData>>) {
  const style = categoryStyle(data.category);
  const ring = data.isAnchor
    ? "ring-2 ring-amber-300 shadow-[0_0_24px_rgba(253,224,71,0.35)] scale-[1.08]"
    : data.selected
      ? "ring-2 ring-zinc-300 scale-105 shadow-lg shadow-black/50"
      : data.inSubgraph
        ? "ring-1 ring-amber-400/60 shadow-[0_0_12px_rgba(253,224,71,0.25)]"
        : "shadow-md shadow-black/40";
  const dimmed = !data.isAnchor && !data.inSubgraph && data.selected === false;
  // Dim non-subgraph nodes when there IS an active subgraph so the traced
  // neighborhood visually pops. `inSubgraph=true` on at least one node means
  // a subgraph is active.
  const inactiveDim = data.inSubgraph ? "" : "opacity-40";
  const hasActiveSubgraph = data.isAnchor; // sentinel: only shown when caller sets anchor
  return (
    <div
      className={`flex min-w-[180px] max-w-[220px] flex-col rounded-lg border px-3 py-2 text-left font-mono text-[11px] leading-tight transition ${ring} ${style.bg} ${style.border} ${style.text} ${
        hasActiveSubgraph === false && dimmed && data.inSubgraph === false ? "" : ""
      } ${hasActiveSubgraph && !data.inSubgraph && !data.isAnchor ? inactiveDim : ""}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-zinc-600 !border-0" />
      <span className="text-zinc-500">#{data.pr}</span>
      <span className="mt-0.5 line-clamp-3 text-zinc-100">{data.title}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600 !border-0" />
    </div>
  );
}

const NODE_TYPES = { decision: DecisionNode } as const;

const EDGE_STYLES: Record<string, { stroke: string; strokeDasharray?: string }> = {
  supersedes: { stroke: "#f87171" },
  depends_on: { stroke: "#60a5fa", strokeDasharray: "6 4" },
  related_to: { stroke: "#a1a1aa", strokeDasharray: "2 4" },
};

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
  const { nodes, flowEdges } = useMemo(() => {
    const COLS = Math.max(4, Math.ceil(Math.sqrt(decisions.length)));
    const X_STEP = 250;
    const Y_STEP = 130;

    const sortedByTime = [...decisions].sort((a, b) =>
      (a.decided_at ?? "").localeCompare(b.decided_at ?? ""),
    );
    const positionById = new Map<string, { x: number; y: number }>();
    sortedByTime.forEach((d, idx) => {
      const row = Math.floor(idx / COLS);
      const col = row % 2 === 0 ? idx % COLS : COLS - 1 - (idx % COLS);
      positionById.set(d.id, { x: col * X_STEP, y: row * Y_STEP });
    });

    const subgraphSet = new Set(subgraphPrs ?? []);

    const nodes: FlowNode<DecisionNodeData>[] = decisions.map((d) => {
      const inSubgraph = subgraphSet.has(d.pr_number);
      const isAnchor = subgraphAnchorPr != null && subgraphAnchorPr === d.pr_number;
      return {
        id: d.id,
        type: "decision",
        position: positionById.get(d.id) ?? { x: 0, y: 0 },
        data: {
          pr: d.pr_number,
          title: d.title,
          category: d.category,
          selected: d.id === selectedId,
          inSubgraph,
          isAnchor,
        },
      };
    });

    const flowEdges: FlowEdge[] = edges.map((e, idx) => {
      const inSub = subgraphSet.size > 0 && subgraphSet.has(e.from_pr) && subgraphSet.has(e.to_pr);
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
          strokeWidth: inSub ? 2.2 : 1,
          opacity: subgraphSet.size > 0 ? (inSub ? 1 : 0.2) : 1,
        },
        animated: inSub || e.kind === "supersedes",
      };
    });

    return { nodes, flowEdges };
  }, [decisions, edges, selectedId, subgraphAnchorPr, subgraphPrs]);

  return (
    <div className="h-full w-full bg-black">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        onNodeClick={(_, node) => onSelect(node.id)}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#27272a" gap={24} />
        <Controls className="!bg-zinc-900 !border-zinc-800" />
      </ReactFlow>
    </div>
  );
}
