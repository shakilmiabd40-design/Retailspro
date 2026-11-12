/**
 * Courier Cost & Profit/Loss report builder.
 *
 * Mirrors the client report exactly: Delivered orders add courier cost only,
 * Partial Delivered adds customer paid − cost, and Refuse Return adds the full
 * cost as a loss. Formulas stay in `src/lib/orders/utils.ts`.
 *
 * Keep this module free of server-only / database imports so it can be unit tested.
 */

import type { Order, OrderStatus } from "@/lib/orders/types";
import { actualCourierCost, courierLoss, courierNet, courierProfit } from "@/lib/orders/utils";
import { COURIER_RESULT_STATUSES } from "@/lib/reports/orders";
import type { DateTypeKey } from "@/lib/reports/dates";
import type { CourierKpis, CourierReport, CourierReportRow } from "@/lib/reports/types";
import { dayInRange, reportDayFor } from "./order-days";

export interface CourierBuildOptions {
  from: string;
  to: string;
  dateType: DateTypeKey;
  /** Courier company, or "all". */
  courier?: string;
  /** Order status, or "all". Only Delivered / Partial / Refuse are ever included. */
  status?: string;
}

/** Customer-paid figure that matters for courier P/L: Partial only; Refuse is 0; Delivered isn't part of P/L. */
const paidForPl = (order: Order): number | null =>
  order.status === "partial_delivered" ? order.delivery.customerPaid : order.status === "refuse_return" ? 0 : null;

const netForPl = (order: Order): number | null =>
  order.status === "partial_delivered" ? courierNet(order) : order.status === "refuse_return" ? -actualCourierCost(order) : null;

const sum = (rows: CourierReportRow[], pick: (row: CourierReportRow) => number) =>
  rows.reduce((total, row) => total + pick(row), 0);

export function buildCourierReport(orders: Order[], options: CourierBuildOptions): CourierReport {
  const { from, to, dateType, courier = "all", status = "all" } = options;
  const rows: CourierReportRow[] = [];

  for (const order of orders) {
    if (!COURIER_RESULT_STATUSES.includes(order.status)) continue;
    if (status !== "all" && order.status !== status) continue;
    if (courier !== "all" && order.courier.company !== courier) continue;

    const reportDay = reportDayFor(order, dateType);
    if (!dayInRange(reportDay, from, to)) continue;

    rows.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      reportDay,
      status: order.status as OrderStatus,
      courier: order.courier.company || "",
      trackingId: order.courier.trackingId || "",
      forwardCost: order.courier.forwardCost,
      returnCost: order.courier.returnCost,
      otherCost: order.courier.otherCost,
      actualCost: actualCourierCost(order),
      customerPaid: paidForPl(order),
      courierNet: netForPl(order),
      profit: courierProfit(order),
      loss: courierLoss(order),
    });
  }

  rows.sort((a, b) => b.reportDay.localeCompare(a.reportDay));

  const profit = sum(rows, (row) => row.profit);
  const loss = sum(rows, (row) => row.loss);
  const kpis: CourierKpis = {
    forwardCost: sum(rows, (row) => row.forwardCost),
    returnCost: sum(rows, (row) => row.returnCost),
    otherCost: sum(rows, (row) => row.otherCost),
    actualCourierCost: sum(rows, (row) => row.actualCost),
    customerPaidPartial: sum(rows, (row) => (row.status === "partial_delivered" ? (row.customerPaid ?? 0) : 0)),
    profit,
    loss,
    netResult: profit - loss,
  };

  return { rows, kpis };
}
