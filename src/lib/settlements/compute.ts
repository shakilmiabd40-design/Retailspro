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
  const collected = order.status === "delivered" ? collectedAmount(order) : order.delivery.customerPaid;
  if (order.status !== "delivered" && order.status !== "partial_delivered") return 0;

  const cost = actualCourierCost(order);
  const codCharge = (collected * (runtime.codChargePct || 0)) / 100;
  const riskCharge = (collected * (runtime.riskManagementPct || 0)) / 100;

  return Math.max(0, collected - cost - codCharge - riskCharge);
}

/**
 * The expected settlement for one order, honouring the settlement mode and an admin override.
 * Every screen must use this figure — a screen that invents its own expectation (for example by
 * falling back to the full COD) settles an order for money the customer never paid.
 */
export function expectedSettlement(order: Order, overrides: Record<string, SettlementOverride> = {}): number {
  const mode = runtime.settlementMode;
  const override = overrides[order.id];
  if (mode !== "auto" && override?.expected !== undefined) return Math.max(0, override.expected);
  if (mode === "manual") return 0;
  return policyExpected(order);
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
  const expected = expectedSettlement(order, overrides);
  const allocations = index.get(order.id) ?? [];
  let received = allocations.reduce((s, a) => s + a.amount, 0);

  const statusAllowsPayout = order.status === "delivered" || order.status === "partial_delivered" || (order.status === "refuse_return" && overridden && expected > 0);
  // Marked settled on the order itself → counts as Settled until a payout is recorded against it.
  // This must NOT depend on the expected amount: a Partial Delivered order the courier owes nothing
  // for (the customer paid less than the courier's charges) still has to be settleable, otherwise
  // "mark as settled" is accepted on the order and then silently ignored by the report.
  const legacy = statusAllowsPayout && allocations.length === 0 && order.delivery.settlementStatus === "settled";
  if (legacy) received = expected;

  // Nothing expected and nothing received → not part of settlement tracking.
  const applies = statusAllowsPayout && (mode === "manual" || expected > 0 || received > 0 || legacy);
  const status: SettlementLabel = legacy ? "Settled" : received >= expected && received > 0 ? "Settled" : received > 0 ? "Partially Settled" : "Unsettled";
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
