import type { Order } from "@/lib/orders/types";
import { actualCourierCost, collectedAmount } from "@/lib/orders/utils";
import type { SettlementLabel } from "@/lib/reports/dates";
import { runtime } from "@/lib/settings/runtime";
import type { CourierPayout, SettlementOverride } from "./types";

export interface AllocationRef {
  payoutId: string;
  payoutNumber: string;
  amount: number;
  paidDate: string;
}

export type AllocationIndex = Map<string, AllocationRef[]>;

export function buildAllocationIndex(payouts: CourierPayout[]): AllocationIndex {
  const index: AllocationIndex = new Map();
  for (const p of payouts) {
    for (const a of p.allocations) {
      if (a.amount <= 0) continue;
      const list = index.get(a.orderId) ?? [];
      list.push({ payoutId: p.id, payoutNumber: p.payoutNumber, amount: a.amount, paidDate: p.paidDate });
      index.set(a.orderId, list);
    }
  }
  return index;
}

/**
 * Policy-agnostic default (courier deducts its fee from the COD it remits):
 *  Delivered → collected − courier cost · Partial → customer paid − courier cost
 *  Refuse / Cancelled → 0. Never below 0. Admins can override per order.
 */
export function policyExpected(order: Order): number {
  if (order.status === "delivered") return Math.max(0, collectedAmount(order) - actualCourierCost(order));
  if (order.status === "partial_delivered") return Math.max(0, order.delivery.customerPaid - actualCourierCost(order));
  return 0;
}

export interface SettlementRow {
  order: Order;
  applies: boolean;
  policyExpected: number;
  expected: number;
  overridden: boolean;
  received: number;
  pending: number;
  status: SettlementLabel;
  lastPaidAt?: string;
  note?: string;
  /** Marked settled on the order itself before payouts were tracked in the ledger. */
  legacy: boolean;
  allocations: AllocationRef[];
}

export function computeSettlement(order: Order, index: AllocationIndex, overrides: Record<string, SettlementOverride>): SettlementRow {
  // Settings → Courier & Settlement: auto (ignore overrides) · manual (only typed amounts) · auto + override.
  const mode = runtime.settlementMode;
  const override = overrides[order.id];
  const overridden = mode !== "auto" && override?.expected !== undefined;
  const policy = policyExpected(order);
  const expected = overridden ? Math.max(0, override!.expected!) : mode === "manual" ? 0 : policy;
  const allocations = index.get(order.id) ?? [];
  let received = allocations.reduce((s, a) => s + a.amount, 0);

  const statusAllowsPayout = order.status === "delivered" || order.status === "partial_delivered" || (order.status === "refuse_return" && overridden && expected > 0);
  const legacy = statusAllowsPayout && allocations.length === 0 && order.delivery.settlementStatus === "settled" && expected > 0;
  if (legacy) received = expected;

  // Nothing expected and nothing received → not part of settlement tracking.
  const applies = statusAllowsPayout && (mode === "manual" || expected > 0 || received > 0);
  const status: SettlementLabel = received >= expected && received > 0 ? "Settled" : received > 0 ? "Partially Settled" : "Unsettled";
  const lastPaidAt = allocations.length ? allocations.map((a) => a.paidDate).sort().at(-1) : undefined;

  return {
    order,
    applies,
    policyExpected: policy,
    expected,
    overridden,
    received,
    pending: Math.max(0, expected - received),
    status,
    lastPaidAt,
    note: override?.note,
    legacy,
    allocations,
  };
}

export function legacyFlagFor(row: SettlementRow): "settled" | "pending" {
  return row.status === "Settled" ? "settled" : "pending";
}
