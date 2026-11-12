/**
 * Settlement position of one order, using the saved settlement policy.
 *
 * This mirrors `src/lib/settlements/compute.ts` (the client ledger) without
 * depending on the browser mirror of settings, so report rows can be built on
 * the server. Keep this module free of server-only imports so it can be tested.
 */

import { actualCourierCost, collectedAmount } from "@/lib/orders/utils";
import type { Order } from "@/lib/orders/types";
import type { SettlementLabel } from "@/lib/reports/dates";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import type { SettlementMode } from "@/lib/settings/types";
import type { CodSettings } from "./cod";

export interface SettlementDocument {
  payouts?: { allocations?: { orderId?: string; amount?: number }[] }[];
  overrides?: Record<string, { expected?: number; note?: string }>;
}

export interface SettlementSettingsDocument {
  courier?: {
    settlementMode?: SettlementMode;
    codChargePct?: number;
    riskManagementPct?: number;
  };
}

/** Sum of positive payout allocations per order. */
export function buildReceivedByOrder(doc: SettlementDocument | null | undefined): Map<string, number> {
  const received = new Map<string, number>();
  for (const payout of doc?.payouts ?? []) {
    for (const allocation of payout.allocations ?? []) {
      if (!allocation.orderId || !(Number(allocation.amount) > 0)) continue;
      received.set(allocation.orderId, (received.get(allocation.orderId) ?? 0) + Number(allocation.amount));
    }
  }
  return received;
}

/** Saved settings win; missing values fall back to the same defaults the app uses. */
export function settlementSettingsFrom(doc: SettlementSettingsDocument | null | undefined): CodSettings {
  return {
    settlementMode: doc?.courier?.settlementMode ?? DEFAULT_SETTINGS.courier.settlementMode,
    codChargePct: Number(doc?.courier?.codChargePct ?? DEFAULT_SETTINGS.courier.codChargePct),
    riskManagementPct: Number(doc?.courier?.riskManagementPct ?? DEFAULT_SETTINGS.courier.riskManagementPct),
  };
}

/** Policy amount the courier should remit before any admin override. */
export function policyExpectedFor(order: Order, settings: CodSettings): number {
  if (order.status !== "delivered" && order.status !== "partial_delivered") return 0;
  const collected = order.status === "delivered" ? collectedAmount(order) : order.delivery.customerPaid;
  const cost = actualCourierCost(order);
  const codCharge = (collected * (settings.codChargePct || 0)) / 100;
  const riskCharge = (collected * (settings.riskManagementPct || 0)) / 100;
  return Math.max(0, collected - cost - codCharge - riskCharge);
}

export interface SettlementPosition {
  applies: boolean;
  policyExpected: number;
  expected: number;
  overridden: boolean;
  received: number;
  pending: number;
  status: SettlementLabel;
  /** Marked settled on the order itself before payouts were tracked in the ledger. */
  legacy: boolean;
}

export function settlementPositionFor(
  order: Order,
  receivedByOrder: Map<string, number>,
  settings: CodSettings,
  overrideExpected?: number,
): SettlementPosition {
  const overridden = settings.settlementMode !== "auto" && overrideExpected !== undefined;
  const policy = policyExpectedFor(order, settings);
  const expected = overridden ? Math.max(0, overrideExpected) : settings.settlementMode === "manual" ? 0 : policy;

  const receivedBefore = receivedByOrder.get(order.id) ?? 0;
  const statusAllowsPayout =
    order.status === "delivered" ||
    order.status === "partial_delivered" ||
    (order.status === "refuse_return" && overridden && expected > 0);

  // A legacy "settled" order with no ledger allocation is treated as paid, so it
  // does not sit in the pending pile forever.
  const legacy = statusAllowsPayout && receivedBefore === 0 && order.delivery.settlementStatus === "settled" && expected > 0;
  const received = legacy ? expected : receivedBefore;

  const applies = statusAllowsPayout && (settings.settlementMode === "manual" || expected > 0 || received > 0);
  const status: SettlementLabel = received >= expected && received > 0 ? "Settled" : received > 0 ? "Partially Settled" : "Unsettled";

  return {
    applies,
    policyExpected: policy,
    expected,
    overridden,
    received,
    pending: Math.max(0, expected - received),
    status,
    legacy,
  };
}
