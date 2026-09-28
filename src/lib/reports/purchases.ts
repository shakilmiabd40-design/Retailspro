import type { PurchaseOrder, POItem } from "@/lib/purchase-orders/types";
import { poGrandTotal } from "@/lib/purchase-orders/utils";
import { inRange, parseDate, type DateTypeKey, type ReportFilters } from "./dates";
import { matchesProductFilters, type ProductMeta } from "./orders";

/** Draft and cancelled purchase orders aren't real purchases yet (or any more). */
export const COUNTED_PO_STATUSES = ["approved", "sent", "partially_received", "received"];

export interface GrnLine {
  key: string;
  date: Date;
  po: PurchaseOrder;
  item: POItem;
  qty: number;
  unitCost: number;
  value: number;
}

export interface PoSummary {
  po: PurchaseOrder;
  ordered: number;
  received: number;
  pending: number;
  cost: number;
  pendingValue: number;
  /** Value of goods received inside the report period (GRN mode). */
  receivedInPeriodValue: number;
  receivedInPeriodQty: number;
  lastDate: Date;
}

export function poDateOf(po: PurchaseOrder): Date {
  return parseDate(po.poDate || po.createdAt);
}

/**
 * Builds the purchase-order set and receiving lines for a period.
 *  - GRN date: purchase orders that received stock in the period; GRN lines are only receipts inside the period.
 *  - PO created date: purchase orders created in the period; GRN lines are every receipt against them.
 * Product filters narrow lines; shipping and discount are only added when no product filter is on.
 */
export function buildPurchases(
  purchaseOrders: PurchaseOrder[],
  f: ReportFilters,
  dateType: DateTypeKey,
  meta: ProductMeta,
  productFilterOn: boolean
): { summaries: PoSummary[]; grn: GrnLine[] } {
  const grnMode = dateType === "grn";
  const summaries: PoSummary[] = [];
  const grn: GrnLine[] = [];

  for (const po of purchaseOrders) {
    if (!COUNTED_PO_STATUSES.includes(po.status)) continue;
    if (f.supplierId !== "all" && po.supplierId !== f.supplierId) continue;

    const items = po.items.filter((i) => matchesProductFilters(i, f, meta));
    if (!items.length) continue;
    const itemByVariant = new Map(items.map((i) => [i.variantId, i]));

    const lines: GrnLine[] = [];
    for (const r of po.receivings) {
      const when = parseDate(r.date);
      if (grnMode && !inRange(when, f.from, f.to)) continue;
      r.items.forEach((l, idx) => {
        const item = itemByVariant.get(l.variantId);
        if (!item) return;
        lines.push({ key: `${r.id}-${idx}`, date: when, po, item, qty: l.qty, unitCost: l.unitCost, value: l.qty * l.unitCost });
      });
    }

    const included = grnMode ? lines.length > 0 : inRange(poDateOf(po), f.from, f.to);
    if (!included) continue;

    const ordered = items.reduce((s, i) => s + i.qtyOrdered, 0);
    const received = items.reduce((s, i) => s + i.qtyReceived, 0);
    const pending = items.reduce((s, i) => s + Math.max(0, i.qtyOrdered - i.qtyReceived), 0);
    const inPeriod = lines.filter((l) => inRange(l.date, f.from, f.to));
    summaries.push({
      po,
      ordered,
      received,
      pending,
      cost: productFilterOn ? items.reduce((s, i) => s + i.qtyOrdered * i.unitCost, 0) : poGrandTotal(po),
      pendingValue: items.reduce((s, i) => s + Math.max(0, i.qtyOrdered - i.qtyReceived) * i.unitCost, 0),
      receivedInPeriodQty: inPeriod.reduce((s, l) => s + l.qty, 0),
      receivedInPeriodValue: inPeriod.reduce((s, l) => s + l.value, 0),
      lastDate: grnMode ? lines.map((l) => l.date).sort((a, b) => b.getTime() - a.getTime())[0] : poDateOf(po),
    });
    grn.push(...lines);
  }

  summaries.sort((a, b) => b.lastDate.getTime() - a.lastDate.getTime());
  grn.sort((a, b) => b.date.getTime() - a.date.getTime());
  return { summaries, grn };
}
