/**
 * Order Status report builder.
 *
 * Returns a compact row per order in the selected date range. The status
 * distribution and trend deliberately cover every status, so the status filter
 * stays on the table only — mirroring the original client-side page.
 *
 * Keep this module free of server-only / database imports so it can be unit tested.
 */

import type { Order } from "@/lib/orders/types";
import type { DateTypeKey } from "@/lib/reports/dates";
import type { OrderStatusReport, OrderStatusReportRow } from "@/lib/reports/types";
import { createdDayFor, dayInRange, reportDayFor, updatedDayFor } from "./order-days";

export interface OrderStatusBuildOptions {
  from: string;
  to: string;
  dateType: DateTypeKey;
  /** Courier company, or "all". */
  courier?: string;
}

export function buildOrderStatusReport(orders: Order[], options: OrderStatusBuildOptions): OrderStatusReport {
  const { from, to, dateType, courier = "all" } = options;
  const rows: OrderStatusReportRow[] = [];

  // Newest first, like the original client-side table.
  const sorted = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const order of sorted) {
    if (courier !== "all" && order.courier.company !== courier) continue;

    const reportDay = reportDayFor(order, dateType);
    if (!dayInRange(reportDay, from, to)) continue;

    rows.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      reportDay,
      createdDay: createdDayFor(order) ?? "",
      updatedDay: updatedDayFor(order) ?? "",
      status: order.status,
      courier: order.courier.company || "",
      trackingId: order.courier.trackingId || "",
      customerName: order.customerName,
      phone: order.phone,
    });
  }

  return { rows };
}
