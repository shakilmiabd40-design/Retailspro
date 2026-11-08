import type { SettlementMode } from "@/lib/settings/types";
import type { CodPendingBuckets } from "@/lib/reports/types";

export type { CodPendingBuckets };

/**
 * COD / courier settlement maths.
 *
 * This mirrors src/lib/settlements/compute.ts (the client ledger) but runs on the
 * server with the saved settings, so R1's "COD pending" uses the same payout
 * allocations the Settlement report uses instead of the order's legacy flag.
 *
 * Keep this module free of server-only imports so it can be unit tested.
 */

export interface CodSettings {
  settlementMode: SettlementMode;
  codChargePct: number;
  riskManagementPct: number;
}

export interface CodOrderInput {
  id: string;
  status: "delivered" | "partial_delivered";
  /** YYYY-MM-DD in the business timezone. */
  deliveryDay: string | null;
  /** What the customer actually paid, when recorded. */
  customerPaid: number;
  /** Fallback for delivered orders without a recorded customerPaid. */
  expectedCod: number;
  forwardCost: number;
  returnCost: number;
  otherCost: number;
  /** delivery.settlementStatus === "settled" from before the payout ledger existed. */
  legacySettled: boolean;
  /** settlements.overrides[orderId].expected */
  overrideExpected?: number;
}

export function collectedFor(order: Pick<CodOrderInput, "status" | "customerPaid" | "expectedCod">): number {
  if (order.status === "delivered") return order.customerPaid > 0 ? order.customerPaid : order.expectedCod;
  return order.customerPaid;
}

/** Expected courier remittance for one order, following the settlement policy. */
export function codExpected(order: CodOrderInput, settings: CodSettings): number {
  const collected = collectedFor(order);
  if (order.status !== "delivered" && order.status !== "partial_delivered") return 0;

  const policy = Math.max(
    0,
    collected -
      (order.forwardCost + order.returnCost + order.otherCost) -
      (collected * (settings.codChargePct || 0)) / 100 -
      (collected * (settings.riskManagementPct || 0)) / 100,
  );

  // Settings -> Courier & Settlement: auto (ignore overrides), manual (only typed
  // amounts), auto + override.
  if (settings.settlementMode === "manual") {
    return order.overrideExpected === undefined ? 0 : Math.max(0, order.overrideExpected);
  }
  if (settings.settlementMode === "auto_override" && order.overrideExpected !== undefined) {
    return Math.max(0, order.overrideExpected);
  }
  return policy;
}

function daysBetween(fromDay: string, toDay: string): number {
  const from = new Date(`${fromDay}T00:00:00.000Z`).getTime();
  const to = new Date(`${toDay}T00:00:00.000Z`).getTime();
  return Math.max(0, Math.round((to - from) / 86_400_000));
}

/**
 * Outstanding COD by order, split into the 0-7 / 8-14 / 15+ ageing buckets.
 * A payout allocation reduces pending, so a partially settled order only shows
 * the remainder.
 */
export function computeCodPending(
  orders: CodOrderInput[],
  receivedByOrder: Map<string, number>,
  settings: CodSettings,
  todayDay: string,
): CodPendingBuckets {
  const out: CodPendingBuckets = {
    total: 0,
    pending0to7: 0,
    pending8to14: 0,
    pending15plus: 0,
    openOrders: 0,
    expectedTotal: 0,
    receivedTotal: 0,
  };

  for (const order of orders) {
    const expected = codExpected(order, settings);
    const received = receivedByOrder.get(order.id) ?? 0;
    // A legacy "settled" flag with no allocations means the old app already
    // treated this order as paid. Keep it paid, not outstanding forever.
    const effectiveReceived = received === 0 && order.legacySettled && expected > 0 ? expected : received;

    if (expected <= 0 && effectiveReceived <= 0) continue;
    out.expectedTotal += expected;
    out.receivedTotal += effectiveReceived;

    const pending = Math.max(0, expected - effectiveReceived);
    if (pending <= 0) continue;
    out.total += pending;
    out.openOrders += 1;

    const age = order.deliveryDay ? daysBetween(order.deliveryDay, todayDay) : 0;
    if (age <= 7) out.pending0to7 += pending;
    else if (age <= 14) out.pending8to14 += pending;
    else out.pending15plus += pending;
  }

  return out;
}
