import { api } from "./api";

/**
 * Document numbers (ORD-10241, PO-3002…) must be unique across everyone using the app, yet the stores create
 * records synchronously. So each browser keeps a small pool of numbers reserved from the server in advance;
 * unused ones are handed back when the tab closes so sequences stay gapless for a single user.
 */
export type NumberSequence = "order" | "po" | "return" | "warranty" | "claim" | "pos_invoice" | "pos_return" | "pos_session" | "barcode";

// "barcode" gets a bigger pool: building a color × size matrix can need many at once, all in one go.
const TARGET: Record<NumberSequence, number> = { order: 3, po: 2, return: 2, warranty: 8, claim: 2, pos_invoice: 6, pos_return: 2, pos_session: 1, barcode: 40 };
const pools = new Map<NumberSequence, number[]>();
const filling = new Set<NumberSequence>();

async function refill(name: NumberSequence) {
  const pool = pools.get(name) ?? [];
  const need = TARGET[name] - pool.length;
  if (need <= 0 || filling.has(name)) return;
  filling.add(name);
  try {
    const { numbers } = await api<{ numbers: number[] }>("POST", "/api/counters/allocate", { name, count: need });
    pools.set(name, [...(pools.get(name) ?? []), ...numbers]);
  } catch {
    /* retried on the next take / prefetch */
  } finally {
    filling.delete(name);
  }
}

export function prefetchNumbers() {
  (Object.keys(TARGET) as NumberSequence[]).forEach((n) => void refill(n));
}

/** Next reserved number, or null if the pool is momentarily empty (it refills in the background). */
export function takeNumber(name: NumberSequence): number | null {
  const pool = pools.get(name) ?? [];
  const n = pool.shift();
  pools.set(name, pool);
  void refill(name);
  return n ?? null;
}

/** For records created automatically (warranties, returns) where blocking isn't an option. */
export function takeNumberOrFallback(name: NumberSequence): number {
  return takeNumber(name) ?? Number(String(Date.now()).slice(-9));
}

export function releaseNumbers() {
  for (const [name, pool] of pools) {
    if (!pool.length) continue;
    try {
      const blob = new Blob([JSON.stringify({ name, numbers: pool })], { type: "application/json" });
      navigator.sendBeacon("/api/counters/release", blob);
    } catch {
      /* best effort */
    }
    pools.set(name, []);
  }
}

/** Awaited version for sign-out: the release must reach the server while the session is still valid. */
export async function releaseNumbersNow() {
  const jobs: Promise<unknown>[] = [];
  for (const [name, pool] of pools) {
    if (!pool.length) continue;
    jobs.push(api("POST", "/api/counters/release", { name, numbers: pool }).catch(() => undefined));
    pools.set(name, []);
  }
  await Promise.all(jobs);
}

export function resetNumbers() {
  pools.clear();
  filling.clear();
}
