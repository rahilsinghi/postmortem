import { afterEach, describe, expect, test } from "vitest";

import { hasBeenSeen, markSeen, resetSeenSet } from "./ProvenanceCard";

afterEach(() => resetSeenSet());

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
