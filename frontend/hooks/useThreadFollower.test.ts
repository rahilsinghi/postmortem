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
