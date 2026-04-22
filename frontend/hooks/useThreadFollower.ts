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
