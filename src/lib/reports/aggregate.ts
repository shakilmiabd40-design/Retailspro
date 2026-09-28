import { bucketOf, bucketsBetween, type GroupBy } from "./dates";

export type TrendRow = { label: string; key: string } & Record<string, string | number>;

/** Sums the given measures into Daily / Weekly / Monthly buckets; empty buckets stay in so charts have no gaps. */
export function trendBuckets<T>(
  items: T[],
  dateOf: (t: T) => Date | null,
  range: { from: string; to: string; groupBy: GroupBy },
  measures: Record<string, (t: T) => number>
): TrendRow[] {
  const rows = new Map<string, TrendRow>();
  for (const b of bucketsBetween(range.from, range.to, range.groupBy)) {
    const row: TrendRow = { label: b.label, key: b.key };
    for (const k of Object.keys(measures)) row[k] = 0;
    rows.set(b.key, row);
  }
  for (const item of items) {
    const d = dateOf(item);
    if (!d) continue;
    const row = rows.get(bucketOf(d, range.groupBy).key);
    if (!row) continue;
    for (const [k, fn] of Object.entries(measures)) row[k] = (row[k] as number) + fn(item);
  }
  return [...rows.values()];
}

export function countBy<T>(items: T[], keyOf: (t: T) => string, weight: (t: T) => number = () => 1): Map<string, number> {
  const m = new Map<string, number>();
  for (const i of items) m.set(keyOf(i), (m.get(keyOf(i)) ?? 0) + weight(i));
  return m;
}
