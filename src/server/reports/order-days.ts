/**
 * Server-side equivalents of `orderDateFor` in `src/lib/reports/orders.ts`,
 * returning the Asia/Dhaka business day instead of a Date instant.
 *
 * Why a separate module: a report day must not depend on the server process
 * timezone. Date-only fields (`deliveryDate`, `dispatchDate`, …) are already
 * calendar days and are kept verbatim; timestamps are converted to Asia/Dhaka.
 * Feeding a date-only value through `new Date(y, m, d)` and then converting it
 * would shift the day on servers east of Dhaka.
 *
 * Keep this module free of server-only imports so it can be unit tested.
 */

import type { Order } from "@/lib/orders/types";
import { ORDER_STATUS_LABELS } from "@/lib/orders/utils";
import type { DateTypeKey } from "@/lib/reports/dates";
import { dhakaDay } from "./business-day";

export { dayInRange } from "./business-day";

/** Day of a date-only string or an instant; invalid values become null. */
export function reportDayOf(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return dhakaDay(value);
}

/** Timestamp of the last activity entry that matches — mirrors `activityAt`. */
function activityDay(order: Order, match: (label: string, detail?: string) => boolean): string | null {
  for (let i = order.activity.length - 1; i >= 0; i--) {
    const entry = order.activity[i];
    if (match(entry.label, entry.detail)) return reportDayOf(entry.at);
  }
  return null;
}

function editedIntoDay(order: Order): string | null {
  const label = ORDER_STATUS_LABELS[order.status];
  return activityDay(order, (entryLabel, detail) => entryLabel === "Edited by Super Admin" && !!detail && detail.includes(`→ ${label}`));
}

export function createdDayFor(order: Order): string | null {
  return reportDayOf(order.createdAt);
}

export function updatedDayFor(order: Order): string | null {
  return reportDayOf(order.updatedAt);
}

export function deliveredDayFor(order: Order): string | null {
  if (order.status !== "delivered") return null;
  if (order.delivery.deliveryDate) return reportDayOf(order.delivery.deliveryDate);
  return activityDay(order, (label) => label === "Marked Delivered") ?? editedIntoDay(order) ?? reportDayOf(order.updatedAt);
}

export function dispatchDayFor(order: Order): string | null {
  if (order.courier.dispatchDate) return reportDayOf(order.courier.dispatchDate);
  return activityDay(order, (label) => label.startsWith("Dispatched via"));
}

/** Delivered / Partial / Refuse / Cancelled — mirrors `finalStatusDate`. */
export function finalStatusDayFor(order: Order): string | null {
  switch (order.status) {
    case "delivered":
      return deliveredDayFor(order);
    case "partial_delivered":
      return (
        activityDay(order, (label) => label === "Marked Partial Delivered") ??
        editedIntoDay(order) ??
        reportDayOf(order.delivery.deliveryDate) ??
        reportDayOf(order.updatedAt)
      );
    case "refuse_return":
      return (
        activityDay(order, (label) => label === "Marked Refuse Return") ??
        editedIntoDay(order) ??
        reportDayOf(order.delivery.deliveryDate) ??
        reportDayOf(order.updatedAt)
      );
    case "cancelled":
      return order.cancellation.cancelledAt ? reportDayOf(order.cancellation.cancelledAt) : reportDayOf(order.updatedAt);
    default:
      return null;
  }
}

export function returnReceivedDayFor(order: Order): string | null {
  return order.returnInfo.returnReceived && order.returnInfo.returnDate ? reportDayOf(order.returnInfo.returnDate) : null;
}

export function reportDayFor(order: Order, type: DateTypeKey): string | null {
  switch (type) {
    case "order_created":
      return createdDayFor(order);
    case "delivered":
      return deliveredDayFor(order);
    case "dispatch":
      return dispatchDayFor(order);
    case "final_status":
      return finalStatusDayFor(order);
    case "return_received":
      return returnReceivedDayFor(order);
    default:
      return null;
  }
}
