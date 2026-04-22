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
};

function DecisionNode({ data }: NodeProps<FlowNode<DecisionNodeData>>) {
  const style = categoryStyle(data.category);
  return (
    <div
      className={`flex min-w-[180px] max-w-[220px] flex-col rounded-lg border px-3 py-2 text-left font-mono text-[11px] leading-tight transition ${
        data.selected
          ? "scale-105 shadow-lg shadow-black/50 ring-2 ring-zinc-300"
          : "shadow-md shadow-black/40"
      } ${style.bg} ${style.border} ${style.text}`}
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
}: {
  decisions: Decision[];
  edges: Edge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { nodes, flowEdges } = useMemo(() => {
    // Compact chronological grid: sort by decided_at, wrap into COLS columns.
    // Category is encoded as node color (not position) — lets the graph fit in
    // the left panel at a readable zoom. Odd rows snake right-to-left so edges
    // between chronologically-adjacent decisions stay short.
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

    const nodes: FlowNode<DecisionNodeData>[] = decisions.map((d) => ({
      id: d.id,
      type: "decision",
      position: positionById.get(d.id) ?? { x: 0, y: 0 },
      data: {
        pr: d.pr_number,
        title: d.title,
        category: d.category,
        selected: d.id === selectedId,
      },
    }));

    const flowEdges: FlowEdge[] = edges.map((e, idx) => ({
      id: `${e.from_id}-${e.to_id}-${idx}`,
      source: e.from_id,
      target: e.to_id,
      label: e.kind.replace("_", " "),
      labelStyle: { fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" },
      labelBgStyle: { fill: "#18181b", fillOpacity: 0.8 },
      labelBgPadding: [4, 2],
      style: EDGE_STYLES[e.kind] ?? EDGE_STYLES.related_to,
      animated: e.kind === "supersedes",
    }));

    return { nodes, flowEdges };
  }, [decisions, edges, selectedId]);

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
