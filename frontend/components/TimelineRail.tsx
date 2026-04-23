export type Tick = { id: string; date: Date; x: number };
export type TickCluster = { x: number; date: Date; members: string[] };

/**
 * Group overlapping ticks into stacks. Single linear pass over pixel-sorted
 * ticks: a tick within `minGap` pixels of its predecessor joins the current
 * cluster; otherwise the current cluster flushes and a new one starts.
 *
 * A cluster's x and date are the mean of its members.
 */
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
      current = {
        xs: [sorted[i].x],
        dates: [sorted[i].date.getTime()],
        ids: [sorted[i].id],
      };
    }
  }
  flush();
  return clusters;
}
