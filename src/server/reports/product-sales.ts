/**
 * Product Sales report builder.
 *
 * Sells are Delivered orders only. Revenue per variant is the line total after
 * the line discount (`price × qty − discount`), exactly like the original
 * client-side page. Returned quantity comes from customer returns that were
 * physically received inside the period.
 *
 * Keep this module free of server-only / database imports so it can be unit tested.
 */

import type { Order } from "@/lib/orders/types";
import type { ReturnRecord } from "@/lib/returns/types";
import type { DateTypeKey } from "@/lib/reports/dates";
import { matchesProductFilters, type ProductFilterFields, type ProductMeta } from "@/lib/reports/orders";
import type { ProductSalesKpis, ProductSalesReport, ProductSalesReportRow } from "@/lib/reports/types";
import { dayInRange, reportDayFor, reportDayOf } from "./order-days";

export interface ProductSalesBuildOptions extends ProductFilterFields {
  from: string;
  to: string;
  dateType: DateTypeKey;
}

type SaleLine = { productId: string; productName: string; color: string; size: string; sku: string; variantId: string; qty: number };

export function buildProductSalesReport(
  orders: Order[],
  returns: ReturnRecord[],
  meta: ProductMeta,
  options: ProductSalesBuildOptions,
): ProductSalesReport {
  const { from, to, dateType } = options;
  const rows = new Map<string, ProductSalesReportRow>();

  const rowFor = (line: SaleLine): ProductSalesReportRow => {
    let row = rows.get(line.variantId);
    if (!row) {
      const product = meta.get(line.productId);
      row = {
        variantId: line.variantId,
        productId: line.productId,
        product: line.productName,
        variant: `${line.color} / ${line.size}`,
        sku: line.sku,
        category: product?.category ?? "—",
        brand: product?.brand ?? "—",
        qty: 0,
        revenue: 0,
        returned: 0,
      };
      rows.set(line.variantId, row);
    }
    return row;
  };

  for (const order of orders) {
    if (order.status !== "delivered") continue;
    const reportDay = reportDayFor(order, dateType);
    if (!dayInRange(reportDay, from, to)) continue;

    for (const item of order.items) {
      if (!matchesProductFilters(item, options, meta)) continue;
      const row = rowFor(item);
      row.qty += item.qty;
      row.revenue += item.price * item.qty - item.discount;
    }
  }

  // Customer returns that physically came back inside the same period.
  for (const record of returns) {
    if (record.type !== "customer" || !record.returnReceived) continue;
    if (!dayInRange(reportDayOf(record.returnReceivedAt), from, to)) continue;

    for (const item of record.items) {
      if (!matchesProductFilters(item, options, meta)) continue;
      rowFor(item).returned += item.qty;
    }
  }

  const list = [...rows.values()]
    .filter((row) => row.qty > 0 || row.returned > 0)
    .sort((a, b) => b.qty - a.qty);

  const kpis: ProductSalesKpis = {
    qty: list.reduce((total, row) => total + row.qty, 0),
    revenue: list.reduce((total, row) => total + row.revenue, 0),
    returned: list.reduce((total, row) => total + row.returned, 0),
    net: 0,
  };
  kpis.net = kpis.qty - kpis.returned;

  return { rows: list, kpis };
}
