import type { Order, OrderStatus } from "@/lib/orders/types";
import { ORDER_STATUS_LABELS } from "@/lib/orders/utils";
import { parseDate, type DateTypeKey, type ReportFilters } from "./dates";

export const ALL_ORDER_STATUSES: OrderStatus[] = ["pending", "processing", "in_transit", "delivered", "partial_delivered", "refuse_return", "cancelled"];
export const COURIER_RESULT_STATUSES: OrderStatus[] = ["delivered", "partial_delivered", "refuse_return"];

/** Date types offered by the server-backed Sales & COD report. */
export const SALES_COD_DATE_TYPES: DateTypeKey[] = ["delivered", "order_created", "dispatch", "final_status"];
/** Date types offered by the server-backed Courier Cost & Profit/Loss report. */
export const COURIER_REPORT_DATE_TYPES: DateTypeKey[] = ["final_status", "delivered", "dispatch", "order_created"];
/** Date types offered by the server-backed Order Status report. */
export const ORDER_STATUS_DATE_TYPES: DateTypeKey[] = ["order_created", "dispatch", "final_status"];
/** Date types offered by the server-backed Product Sales report. */
export const PRODUCT_SALES_DATE_TYPES: DateTypeKey[] = ["delivered", "order_created", "final_status"];

// ---- per-order dates ----------------------------------------------------------

/** Timestamp of the last activity entry that matches — the audit trail is the source for status dates. */
function activityAt(order: Order, match: (label: string, detail?: string) => boolean): Date | null {
  for (let i = order.activity.length - 1; i >= 0; i--) {
    const a = order.activity[i];
    if (match(a.label, a.detail)) return new Date(a.at);
  }
  return null;
}

function editedInto(order: Order): Date | null {
  const label = ORDER_STATUS_LABELS[order.status];
  return activityAt(order, (l, d) => l === "Edited by Super Admin" && !!d && d.includes(`→ ${label}`));
}

export function createdDate(o: Order): Date {
  return new Date(o.createdAt);
}

export function deliveredDate(o: Order): Date | null {
  if (o.status !== "delivered") return null;
  if (o.delivery.deliveryDate) return parseDate(o.delivery.deliveryDate);
  return activityAt(o, (l) => l === "Marked Delivered") ?? editedInto(o) ?? new Date(o.updatedAt);
}

export function dispatchDate(o: Order): Date | null {
  if (o.courier.dispatchDate) return parseDate(o.courier.dispatchDate);
  return activityAt(o, (l) => l.startsWith("Dispatched via"));
}

/** Delivered / Partial / Refuse (and Cancelled, for order-count reports). Pending → In Transit have none yet. */
export function finalStatusDate(o: Order): Date | null {
  switch (o.status) {
    case "delivered":
      return deliveredDate(o);
    case "partial_delivered":
      return activityAt(o, (l) => l === "Marked Partial Delivered") ?? editedInto(o) ?? (o.delivery.deliveryDate ? parseDate(o.delivery.deliveryDate) : new Date(o.updatedAt));
    case "refuse_return":
      return activityAt(o, (l) => l === "Marked Refuse Return") ?? editedInto(o) ?? (o.delivery.deliveryDate ? parseDate(o.delivery.deliveryDate) : new Date(o.updatedAt));
    case "cancelled":
      return o.cancellation.cancelledAt ? new Date(o.cancellation.cancelledAt) : new Date(o.updatedAt);
    default:
      return null;
  }
}

export function returnReceivedDate(o: Order): Date | null {
  return o.returnInfo.returnReceived && o.returnInfo.returnDate ? new Date(o.returnInfo.returnDate) : null;
}

export function orderDateFor(o: Order, type: DateTypeKey): Date | null {
  switch (type) {
    case "order_created":
      return createdDate(o);
    case "delivered":
      return deliveredDate(o);
    case "dispatch":
      return dispatchDate(o);
    case "final_status":
      return finalStatusDate(o);
    case "return_received":
      return returnReceivedDate(o);
    default:
      return null;
  }
}

// ---- product filters (category / brand / product / SKU) -----------------------------

export type ProductMeta = Map<string, { category: string; brand: string }>;

/** The subset of `ReportFilters` that category/brand/product/SKU matching needs. */
export type ProductFilterFields = Pick<ReportFilters, "category" | "brand" | "productId" | "sku">;

export function matchesProductFilters(item: { productId: string; sku: string }, f: ProductFilterFields, meta: ProductMeta): boolean {
  const m = meta.get(item.productId);
  if (f.category !== "all" && m?.category !== f.category) return false;
  if (f.brand !== "all" && m?.brand !== f.brand) return false;
  if (f.productId !== "all" && item.productId !== f.productId) return false;
  const q = f.sku.trim().toLowerCase();
  if (q && !item.sku.toLowerCase().includes(q)) return false;
  return true;
}
