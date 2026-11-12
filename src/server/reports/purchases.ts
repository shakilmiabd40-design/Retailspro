/**
 * Purchase Report builder (server side).
 *
 * Mirrors the client report exactly:
 *  - GRN date: purchase orders that received stock in the period; the receiving
 *    table only lists receipts inside the period.
 *  - PO created date: purchase orders created in the period, with every receipt
 *    against them.
 *  - Product filters narrow the lines; shipping and discount are only added
 *    when no product filter is on.
 *
 * Report days use the fixed Asia/Dhaka business day, like the other
 * server-backed reports.
 *
 * Keep this module free of server-only / database imports so it can be unit tested.
 */

import type { PurchaseOrder, POItem } from "@/lib/purchase-orders/types";
import { poGrandTotal } from "@/lib/purchase-orders/utils";
import { matchesProductFilters, type ProductFilterFields, type ProductMeta } from "@/lib/reports/orders";
import type { PurchaseGrnRow, PurchaseKpis, PurchaseReport, PurchaseReportRow } from "@/lib/reports/types";
import { dayInRange } from "./business-day";
import { reportDayOf } from "./order-days";

/** Draft and cancelled purchase orders aren't real purchases yet (or any more). */
export const COUNTED_PO_STATUSES = ["approved", "sent", "partially_received", "received"];

export type PurchaseDateType = "grn" | "po_created";

export interface PurchaseBuildOptions extends Partial<ProductFilterFields> {
  from: string;
  to: string;
  dateType: PurchaseDateType;
  /** Supplier id, or "all". */
  supplierId?: string;
  /** True when a category / brand / product / SKU filter is active. */
  productFilterOn?: boolean;
  /** Supplier id → name, for the report rows. */
  supplierNames: Map<string, string>;
  meta: ProductMeta;
}

const supplierNameOf = (names: Map<string, string>, supplierId: string) => names.get(supplierId) ?? "Unknown supplier";

/** Business day of a purchase order: its PO date, or the created date when the PO has none. */
export function purchaseOrderDay(po: PurchaseOrder): string | null {
  return reportDayOf(po.poDate || po.createdAt);
}

export function buildPurchaseReport(purchaseOrders: PurchaseOrder[], options: PurchaseBuildOptions): PurchaseReport {
  const { from, to, dateType, supplierId = "all", productFilterOn = false, supplierNames, meta } = options;
  const filters: ProductFilterFields = {
    category: options.category ?? "all",
    brand: options.brand ?? "all",
    productId: options.productId ?? "all",
    sku: options.sku ?? "",
  };
  const grnMode = dateType === "grn";
  const rows: PurchaseReportRow[] = [];
  const grn: PurchaseGrnRow[] = [];

  for (const po of purchaseOrders) {
    if (!COUNTED_PO_STATUSES.includes(po.status)) continue;
    if (supplierId !== "all" && po.supplierId !== supplierId) continue;

    const items = po.items.filter((item) => matchesProductFilters(item, filters, meta));
    if (!items.length) continue;
    const itemByVariant = new Map(items.map((item) => [item.variantId, item]));

    const lines: { key: string; day: string; occurredAt: string; po: PurchaseOrder; item: POItem; qty: number; unitCost: number; value: number }[] = [];
    for (const receiving of po.receivings) {
      const day = reportDayOf(receiving.date);
      if (!day) continue;
      if (grnMode && !dayInRange(day, from, to)) continue;
      receiving.items.forEach((line, index) => {
        const item = itemByVariant.get(line.variantId);
        if (!item) return;
        lines.push({
          key: `${receiving.id}-${index}`,
          day,
          occurredAt: receiving.date,
          po,
          item,
          qty: line.qty,
          unitCost: line.unitCost,
          value: line.qty * line.unitCost,
        });
      });
    }

    const poDay = purchaseOrderDay(po);
    const included = grnMode ? lines.length > 0 : dayInRange(poDay, from, to);
    if (!included) continue;

    const ordered = items.reduce((sum, item) => sum + item.qtyOrdered, 0);
    const received = items.reduce((sum, item) => sum + item.qtyReceived, 0);
    const pending = items.reduce((sum, item) => sum + Math.max(0, item.qtyOrdered - item.qtyReceived), 0);
    const inPeriod = lines.filter((line) => dayInRange(line.day, from, to));
    const lastDay = grnMode ? inPeriod.map((line) => line.day).sort().at(-1) ?? poDay ?? "" : poDay ?? "";

    rows.push({
      poId: po.id,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      supplierName: supplierNameOf(supplierNames, po.supplierId),
      status: po.status,
      reportDay: poDay ?? "",
      sortDay: lastDay,
      ordered,
      received,
      pending,
      cost: productFilterOn ? items.reduce((sum, item) => sum + item.qtyOrdered * item.unitCost, 0) : poGrandTotal(po),
      pendingValue: items.reduce((sum, item) => sum + Math.max(0, item.qtyOrdered - item.qtyReceived) * item.unitCost, 0),
      receivedInPeriodQty: inPeriod.reduce((sum, line) => sum + line.qty, 0),
      receivedInPeriodValue: inPeriod.reduce((sum, line) => sum + line.value, 0),
    });

    for (const line of lines) {
      grn.push({
        key: line.key,
        reportDay: line.day,
        occurredAt: line.occurredAt,
        poId: line.po.id,
        poNumber: line.po.poNumber,
        supplierName: supplierNameOf(supplierNames, line.po.supplierId),
        productName: line.item.productName,
        color: line.item.color,
        size: line.item.size,
        sku: line.item.sku,
        qty: line.qty,
        unitCost: line.unitCost,
        value: line.value,
      });
    }
  }

  rows.sort((a, b) => b.sortDay.localeCompare(a.sortDay) || b.poNumber.localeCompare(a.poNumber));
  grn.sort((a, b) => b.reportDay.localeCompare(a.reportDay) || b.occurredAt.localeCompare(a.occurredAt));

  const kpis: PurchaseKpis = {
    purchaseOrders: rows.length,
    qtyOrdered: rows.reduce((sum, row) => sum + row.ordered, 0),
    qtyReceived: rows.reduce((sum, row) => sum + row.received, 0),
    qtyReceivedInPeriod: rows.reduce((sum, row) => sum + row.receivedInPeriodQty, 0),
    totalCost: rows.reduce((sum, row) => sum + row.cost, 0),
    pendingQty: rows.reduce((sum, row) => sum + row.pending, 0),
    pendingValue: rows.reduce((sum, row) => sum + row.pendingValue, 0),
  };

  return { rows, grn, kpis };
}
