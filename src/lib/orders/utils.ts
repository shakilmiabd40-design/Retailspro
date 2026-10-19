import type { KnownCancelReason, Order, OrderStatus } from "./types";
import { formatDateTime, runtime } from "@/lib/settings/runtime";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  in_transit: "In Transit",
  delivered: "Delivered",
  partial_delivered: "Partial Delivered",
  refuse_return: "Refuse Return",
  cancelled: "Cancelled",
};

export const CANCEL_REASON_LABELS: Record<KnownCancelReason, string> = {
  customer_changed_mind: "Customer Changed Mind",
  wrong_order: "Wrong Order",
  duplicate_order: "Duplicate Order",
  customer_requested_cancellation: "Customer Requested Cancellation",
  unable_to_contact: "Unable to Contact",
  other: "Other",
};

export const FINAL_STATUSES: OrderStatus[] = ["delivered", "partial_delivered", "refuse_return", "cancelled"];

/** Section 23 — allowed forward transitions. Cancel is handled separately (section 10). */
export const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ["processing"],
  processing: ["in_transit"],
  in_transit: ["delivered", "partial_delivered", "refuse_return"],
  delivered: [],
  partial_delivered: [],
  refuse_return: [],
  cancelled: [],
};

/** Custom reasons (from Settings → Orders) are stored as their own label; legacy ones are keys. */
export function cancelReasonLabel(reason: string): string {
  return (CANCEL_REASON_LABELS as Record<string, string>)[reason] ?? reason;
}

/** Section 10 — cancel is only allowed before the parcel reaches the courier (Settings → Orders picks which pre-courier statuses). */
export function canCancelOrder(status: OrderStatus): boolean {
  return (status === "pending" || status === "processing") && runtime.cancelAllowed.includes(status);
}

export function isFinalStatus(status: OrderStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

// ---- Section 24 — financial formulas -------------------------------------

export function productSubtotal(order: Order): number {
  return order.items.reduce((sum, i) => sum + i.price * i.qty, 0);
}

export function totalDiscount(order: Order): number {
  return order.items.reduce((sum, i) => sum + i.discount, 0);
}

/** Expected COD = Product Subtotal - Discount + Customer Delivery Charge */
export function expectedCod(order: Order): number {
  return productSubtotal(order) - totalDiscount(order) + order.deliveryCharge;
}

/**
 * An order-level discount is stored by spreading it over the lines (pro rata to each line's value, the last
 * line absorbing rounding), exactly like the POS cart discount — so Expected COD, revenue and every report
 * stay correct without a separate field.
 */
export function foldOrderDiscount<T extends { price: number; qty: number; discount: number }>(items: T[], amount: number): T[] {
  const nets = items.map((i) => Math.max(0, i.price * i.qty - i.discount));
  const total = nets.reduce((s, n) => s + n, 0);
  const off = Math.min(Math.max(0, amount), total);
  if (off <= 0 || total <= 0) return items;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  let allocated = 0;
  let last = -1;
  const shares = nets.map((n, idx) => {
    if (n <= 0) return 0;
    last = idx;
    const share = r2((off * n) / total);
    allocated += share;
    return share;
  });
  if (last >= 0) shares[last] = r2(shares[last] + (off - allocated));
  return items.map((i, idx) => ({ ...i, discount: r2(i.discount + shares[idx]) }));
}

/** Actual Courier Cost = Forward + Return + Other */
export function actualCourierCost(order: Order): number {
  return order.courier.forwardCost + order.courier.returnCost + order.courier.otherCost;
}

/** Courier Net = Customer Paid - Actual Courier Cost (Partial Delivered only). */
export function courierNet(order: Order): number {
  return order.delivery.customerPaid - actualCourierCost(order);
}

export function totalItemQty(order: Order): number {
  return order.items.reduce((sum, i) => sum + i.qty, 0);
}

/**
 * Product sales — Delivered orders only: product price × qty minus discounts. The customer's delivery
 * charge is not merchandise revenue, so it isn't in here (section 19).
 */
export function productSales(order: Order): number {
  if (order.status !== "delivered") return 0;
  return productSubtotal(order) - totalDiscount(order);
}

/**
 * Gross revenue — everything the customer pays for a Delivered order: product sales after discounts plus the
 * delivery charge billed. Nothing is taken off yet (no product cost, no courier cost).
 *   Gross profit = gross revenue − product cost
 *   Net profit   = gross profit − courier & other cost   (= net revenue − product cost)
 */
export function grossRevenue(order: Order): number {
  if (order.status !== "delivered") return 0;
  return productSales(order) + order.deliveryCharge;
}

/**
 * Net revenue — what a Delivered order really earns: everything the customer pays for it (product sales after
 * discounts + the delivery charge they were billed) minus what the courier costs the shop (courier delivery
 * charge + return + other cost = Actual Courier Cost).
 *
 * The customer's delivery charge counts as money in because the shop pays the courier company separately;
 * that is why a shop can bill ৳100 delivery, give a ৳100 discount, and still only lose the ৳100 courier fee once.
 * This is the "revenue" on the dashboard and in the reports, and the figure profit is worked out from.
 */
export function salesRevenue(order: Order): number {
  if (order.status !== "delivered") return 0;
  return grossRevenue(order) - actualCourierCost(order);
}

/** Collected Amount — what actually landed in hand, per status (section 24/25). */
export function collectedAmount(order: Order): number {
  if (order.status === "delivered") return order.delivery.customerPaid || expectedCod(order);
  if (order.status === "partial_delivered") return order.delivery.customerPaid;
  return 0;
}

/** Courier Cost counted toward the business — 0 for Cancelled (never shipped). */
export function courierCostForSummary(order: Order): number {
  if (order.status === "cancelled") return 0;
  return actualCourierCost(order);
}

/** Courier Profit — only meaningful (and only positive) for Partial Delivered. */
export function courierProfit(order: Order): number {
  if (order.status !== "partial_delivered") return 0;
  return Math.max(0, courierNet(order));
}

/** Courier Loss — Partial Delivered (if net negative) or full cost for Refuse Return. */
export function courierLoss(order: Order): number {
  if (order.status === "refuse_return") return actualCourierCost(order);
  if (order.status === "partial_delivered") return Math.max(0, -courierNet(order));
  return 0;
}

export function formatOrderDate(iso: string): string {
  return formatDateTime(iso);
}

// ---- Super Admin edit helpers ---------------------------------------------

export type StockEffect = "reserved" | "consumed" | "none";

/**
 * What an order currently does to product stock:
 *  - reserved: units are held (Pending / Processing / In Transit, or Partial/Refuse still on the way back)
 *  - consumed: units are permanently sold (Delivered)
 *  - none: nothing held (Cancelled, or a return that is already back on the shelf)
 */
export function stockEffectFor(order: Pick<Order, "status" | "returnInfo">): StockEffect {
  switch (order.status) {
    case "pending":
    case "processing":
    case "in_transit":
      return "reserved";
    case "delivered":
      return "consumed";
    case "partial_delivered":
    case "refuse_return":
      return order.returnInfo.returnReceived ? "none" : "reserved";
    case "cancelled":
      return "none";
  }
}

/** Short human-readable list of what changed between two versions of an order (for the activity log). */
export function describeOrderChanges(before: Order, after: Order): string[] {
  const changes: string[] = [];
  if (before.status !== after.status) {
    changes.push(`Status: ${ORDER_STATUS_LABELS[before.status]} → ${ORDER_STATUS_LABELS[after.status]}`);
  }
  const customerKeys = ["customerName", "phone", "altPhone", "address", "district", "area", "notes"] as const;
  if (customerKeys.some((k) => (before[k] ?? "") !== (after[k] ?? ""))) changes.push("Customer details");
  const sig = (o: Order) => o.items.map((i) => `${i.variantId}|${i.qty}|${i.price}|${i.discount}`).sort().join(";");
  if (sig(before) !== sig(after)) changes.push("Products");
  if (before.deliveryCharge !== after.deliveryCharge) {
    changes.push(`Delivery charge: ${before.deliveryCharge} → ${after.deliveryCharge}`);
  }
  if (JSON.stringify(before.courier) !== JSON.stringify(after.courier)) changes.push("Courier info");
  if (JSON.stringify(before.delivery) !== JSON.stringify(after.delivery)) changes.push("Delivery result");
  if (
    before.returnInfo.returnRequired !== after.returnInfo.returnRequired ||
    before.returnInfo.returnReceived !== after.returnInfo.returnReceived
  ) {
    changes.push("Return info");
  }
  if (JSON.stringify(before.cancellation) !== JSON.stringify(after.cancellation)) changes.push("Cancellation info");
  return changes;
}
