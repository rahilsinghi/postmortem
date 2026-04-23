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
