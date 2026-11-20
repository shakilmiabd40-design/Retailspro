import type { OrderStatus } from "@/lib/orders/types";
import type { CustomerLookupResult, LookupOrder } from "@/lib/customers/types";

export const ALL_STATUSES: OrderStatus[] = ["pending", "processing", "in_transit", "delivered", "partial_delivered", "refuse_return", "cancelled"];
const ACTIVE_STATUSES = new Set<OrderStatus>(["pending", "processing", "in_transit"]);

/** Created date is an ISO string on stored orders; tolerate malformed values without throwing. */
const byRecency = (a: LookupOrder, b: LookupOrder) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);

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
