import type { OrderStatus } from "@/lib/orders/types";
import type { CustomerLookupResult, LookupOrder } from "@/lib/customers/types";

export const ALL_STATUSES: OrderStatus[] = ["pending", "processing", "in_transit", "delivered", "partial_delivered", "refuse_return", "cancelled"];
const ACTIVE_STATUSES = new Set<OrderStatus>(["pending", "processing", "in_transit"]);

/** Created date is an ISO string on stored orders; tolerate malformed values without throwing. */
const byRecency = (a: LookupOrder, b: LookupOrder) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);

/** Compact rows returned by the POS invoice/return history queries. */
export interface PosHistoryRow {
  id: string;
  order_number: string | null;
  /** `completed` sale or `return` — mapped to the order statuses used by the warning. */
  status: string | null;
  created_at: string | null;
  total: string | null;
  refusal_reason: string | null;
}

/**
 * POS sales have no delivery lifecycle: a completed sale is a finished purchase, and a POS return is
 * the closest equivalent to a refused/returned order. Keeping this mapping pure lets the aggregation
 * tests cover the combined order + POS history without a database.
 */
export function mapPosHistoryRows(rows: PosHistoryRow[]): LookupOrder[] {
  return rows.map((row) => ({
    id: String(row.id),
    orderNumber: String(row.order_number ?? ""),
    status: row.status === "return" ? "refuse_return" : "delivered",
    createdAt: String(row.created_at ?? ""),
    total: Number(row.total) || 0,
    refusalReason: row.refusal_reason,
  }));
}

export function emptyCustomerLookup(valid = true): CustomerLookupResult {
  return {
    found: false,
    valid,
    total: 0,
    counts: Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<OrderStatus, number>,
    activeOrders: [],
    lastOrder: null,
    lifetimeDelivered: 0,
    lastRefusal: null,
    lastRefusalReason: null,
  };
}

/**
 * Pure aggregation over the compact order projection returned by the lookup query. Kept free of
 * database and server-only imports so the behaviour can be unit tested directly.
 *
 * `excludeOrderId` is only used for the "possible duplicate" check: while editing an order, that
 * order's own active status must not be reported back as a duplicate. History totals are unchanged.
 */
export function aggregateCustomerHistory(orders: LookupOrder[], excludeOrderId?: string | null): CustomerLookupResult {
  const counts = emptyCustomerLookup().counts;
  for (const order of orders) {
    if (order.status in counts) counts[order.status] += 1;
  }

  const sorted = [...orders].sort(byRecency);
  const last = sorted[0];
  const lastRefusal = sorted.find((o) => o.status === "refuse_return");
  const activeOrders = sorted
    .filter((o) => ACTIVE_STATUSES.has(o.status) && o.id !== excludeOrderId)
    .slice(0, 3)
    .map((o) => ({ id: o.id, orderNumber: o.orderNumber, status: o.status, createdAt: o.createdAt, total: o.total }));

  const rawTotal = orders.reduce((sum, o) => (o.status === "delivered" && Number.isFinite(o.total) ? sum + o.total : sum), 0);

  return {
    found: orders.length > 0,
    valid: true,
    total: orders.length,
    counts,
    activeOrders,
    lastOrder: last ? { orderNumber: last.orderNumber, status: last.status, createdAt: last.createdAt } : null,
    lifetimeDelivered: Math.round(rawTotal * 100) / 100,
    lastRefusal: lastRefusal ? { orderNumber: lastRefusal.orderNumber, createdAt: lastRefusal.createdAt, refusalReason: lastRefusal.refusalReason ?? null } : null,
    lastRefusalReason: lastRefusal?.refusalReason ?? null,
  };
}
