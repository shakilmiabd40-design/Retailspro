/**
 * Sales & COD report builder.
 *
 * Runs on the server over the broad candidate set from `order-candidates.ts` and
 * produces compact rows plus totals. The business formulas stay in
 * `src/lib/orders/utils.ts`; this module only selects and shapes them.
 *
 * Keep this module free of server-only / database imports so it can be unit tested.
 */

import type { Order } from "@/lib/orders/types";
import {
  actualCourierCost,
  collectedAmount,
  expectedCod,
  grossRevenue,
  productSales,
  salesRevenue,
} from "@/lib/orders/utils";
import type { DateTypeKey, SettlementLabel } from "@/lib/reports/dates";
import type { SalesCodKpis, SalesCodReport, SalesCodReportRow } from "@/lib/reports/types";
import type { CodSettings } from "./cod";
import { dayInRange, deliveredDayFor, reportDayFor } from "./order-days";
import { settlementPositionFor } from "./settlement-summary";

export interface SalesCodBuildOptions {
  from: string;
  to: string;
  dateType: DateTypeKey;
  receivedByOrder: Map<string, number>;
  settings: CodSettings;
  overrides?: Record<string, { expected?: number }>;
  /** Courier company, or "all". */
  courier?: string;
  /** SettlementLabel, or "all". */
  settlementStatus?: SettlementLabel | "all";
  /** Order status, or "all". Sales & COD only ever includes Delivered orders. */
  status?: string;
}

const sum = (rows: SalesCodReportRow[], pick: (row: SalesCodReportRow) => number) =>
  rows.reduce((total, row) => total + pick(row), 0);

export function buildSalesCodReport(orders: Order[], options: SalesCodBuildOptions): SalesCodReport {
  const { from, to, dateType, receivedByOrder, settings, overrides, courier = "all", settlementStatus = "all", status = "all" } = options;
  const rows: SalesCodReportRow[] = [];
  let grossRevenueTotal = 0;

  for (const order of orders) {
    // Only Delivered orders count as sales; Partial / Refuse / Cancelled are out.
    if (order.status !== "delivered") continue;
    if (status !== "all" && order.status !== status) continue;
    if (courier !== "all" && order.courier.company !== courier) continue;

    const reportDay = reportDayFor(order, dateType);
    if (!dayInRange(reportDay, from, to)) continue;

    const position = settlementPositionFor(order, receivedByOrder, settings, overrides?.[order.id]?.expected);
    if (settlementStatus !== "all" && position.status !== settlementStatus) continue;

    const expected = expectedCod(order);
    const collected = collectedAmount(order);
    grossRevenueTotal += grossRevenue(order);
    rows.push({
      orderId: order.id,
      orderNumber: order.orderNumber,
      deliveredDay: deliveredDayFor(order) ?? "",
      reportDay,
      customerName: order.customerName,
      phone: order.phone,
      expectedCod: expected,
      collected,
      courier: order.courier.company || "",
      courierCost: actualCourierCost(order),
      settlementStatus: position.applies ? position.status : "",
      productSales: productSales(order),
      revenue: salesRevenue(order),
      deliveryCharge: order.deliveryCharge,
      difference: expected - collected,
    });
  }

  rows.sort((a, b) => b.reportDay.localeCompare(a.reportDay));

  const expectedTotal = sum(rows, (row) => row.expectedCod);
  const collectedTotal = sum(rows, (row) => row.collected);
  const kpis: SalesCodKpis = {
    deliveredOrders: rows.length,
    productSales: sum(rows, (row) => row.productSales),
    grossRevenue: grossRevenueTotal,
    courierCost: sum(rows, (row) => row.courierCost),
    netRevenue: sum(rows, (row) => row.revenue),
    deliveryCharge: sum(rows, (row) => row.deliveryCharge),
    expectedCod: expectedTotal,
    collected: collectedTotal,
    difference: expectedTotal - collectedTotal,
  };

  return { rows, kpis };
}
