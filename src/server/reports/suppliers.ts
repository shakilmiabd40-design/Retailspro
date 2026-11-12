/**
 * Supplier Report builder (server side).
 *
 * Mirrors the client report exactly: purchase value and received quantity come
 * from the counted purchase orders (stock received in the period in GRN mode,
 * the purchase-order total otherwise), and supplier returns are valued at the
 * product cost of the returned variant.
 *
 * Keep this module free of server-only / database imports so it can be unit tested.
 */

import type { ReturnRecord } from "@/lib/returns/types";
import type { ProductMeta } from "@/lib/reports/orders";
import type { SupplierKpis, SupplierReport, SupplierReportRow } from "@/lib/reports/types";
import { dayInRange } from "./business-day";
import { reportDayOf } from "./order-days";
import { buildPurchaseReport, type PurchaseDateType } from "./purchases";

export type { PurchaseDateType };

export interface SupplierBuildOptions {
  from: string;
  to: string;
  dateType: PurchaseDateType;
  /** Supplier id, or "all". */
  supplierId?: string;
  /** All suppliers (id → name), so a supplier without purchases can still show returns. */
  suppliers: { id: string; name: string }[];
  /** Purchase-order id → supplier id, for supplier returns that reference a purchase order. */
  poSuppliers: Map<string, string>;
  /** Variant id → product cost; empty when the caller may not see cost prices. */
  variantCosts: Map<string, number>;
  meta: ProductMeta;
}

export function buildSupplierReport(
  purchaseOrders: Parameters<typeof buildPurchaseReport>[0],
  returns: ReturnRecord[],
  options: SupplierBuildOptions,
): SupplierReport {
  const { from, to, dateType, supplierId = "all", suppliers, poSuppliers, variantCosts } = options;
  const grnMode = dateType === "grn";

  const { rows } = buildPurchaseReport(purchaseOrders, {
    from,
    to,
    dateType,
    supplierId,
    supplierNames: new Map(suppliers.map((supplier) => [supplier.id, supplier.name])),
    meta: options.meta,
  });

  const map = new Map<string, SupplierReportRow>();
  for (const supplier of suppliers) {
    if (supplierId !== "all" && supplier.id !== supplierId) continue;
    map.set(supplier.id, {
      id: supplier.id,
      name: supplier.name,
      poCount: 0,
      purchase: 0,
      receivedQty: 0,
      returnQty: 0,
      returnValue: 0,
      lastPurchaseDay: null,
    });
  }

  for (const row of rows) {
    const target = map.get(row.supplierId);
    if (!target) continue;
    target.poCount += 1;
    target.purchase += grnMode ? row.receivedInPeriodValue : row.cost;
    target.receivedQty += grnMode ? row.receivedInPeriodQty : row.received;
    if (!target.lastPurchaseDay || row.sortDay > target.lastPurchaseDay) target.lastPurchaseDay = row.sortDay;
  }

  for (const record of returns) {
    if (record.type !== "supplier") continue;
    const day = reportDayOf(record.returnReceivedAt ?? record.createdAt);
    if (!dayInRange(day, from, to)) continue;

    const bySupplierId = poSuppliers.get(record.referenceId);
    const target = bySupplierId
      ? map.get(bySupplierId)
      : [...map.values()].find((supplier) => supplier.name === record.partyName);
    if (!target) continue;

    for (const item of record.items) {
      target.returnQty += item.qty;
      target.returnValue += item.qty * (variantCosts.get(item.variantId) ?? 0);
    }
  }

  const list = [...map.values()]
    .filter((row) => row.poCount > 0 || row.returnQty > 0)
    .sort((a, b) => b.purchase - a.purchase);

  const kpis: SupplierKpis = {
    totalPurchase: list.reduce((sum, row) => sum + row.purchase, 0),
    receivedQty: list.reduce((sum, row) => sum + row.receivedQty, 0),
    returnQty: list.reduce((sum, row) => sum + row.returnQty, 0),
    returnValue: list.reduce((sum, row) => sum + row.returnValue, 0),
  };

  return { rows: list, kpis };
}
