"use client";

import { useMemo } from "react";
import { useOrders } from "@/lib/orders/store";
import { usePurchaseOrders } from "@/lib/purchase-orders/store";
import { useReturns } from "@/lib/returns/store";
import { useWarranty } from "@/lib/warranty/store";
import { useSettlements } from "@/lib/settlements/store";
import { taka } from "@/lib/reports/format";
import { useAudit } from "./audit";
import type { AuditAction, AuditEntry } from "./types";

const NOT_RECORDED = "Not recorded";

function actionForOrderLabel(label: string): AuditAction {
  if (label === "Order Created") return "create";
  if (label.startsWith("Edited")) return "edit";
  return "status_change";
}

/**
 * Everything the app itself logged (settings, users, stock, data…) merged with events
 * rebuilt from each module's own history (order timeline, PO receivings, returns,
 * warranty claims, settlement payouts) so the log is useful from day one.
 */
export function useAuditFeed(): { entries: AuditEntry[]; hydrated: boolean } {
  const { entries: native, hydrated } = useAudit();
  const { orders } = useOrders();
  const { purchaseOrders } = usePurchaseOrders();
  const { returns } = useReturns();
  const { warranties } = useWarranty();
  const { payouts } = useSettlements();

  const entries = useMemo(() => {
    const derived: AuditEntry[] = [];
    const base = { userId: "", source: "derived" as const };

    for (const o of orders) {
      for (const a of o.activity) {
        derived.push({
          ...base,
          id: `d:order:${o.id}:${a.id}`,
          at: a.at,
          userName: a.by ?? NOT_RECORDED,
          userId: a.by ? `name:${a.by}` : "",
          module: "Orders",
          action: actionForOrderLabel(a.label),
          entity: `Order ${o.orderNumber}`,
          summary: a.detail ? `${a.label} — ${a.detail}` : a.label,
        });
      }
    }

    for (const po of purchaseOrders) {
      derived.push({ ...base, id: `d:po:${po.id}`, at: po.createdAt, userName: NOT_RECORDED, module: "Purchase Orders", action: "create", entity: `PO ${po.poNumber}`, summary: `Purchase order created with ${po.items.length} line${po.items.length === 1 ? "" : "s"}` });
      for (const r of po.receivings) {
        const qty = r.items.reduce((s, i) => s + i.qty, 0);
        derived.push({ ...base, id: `d:po-recv:${po.id}:${r.id}`, at: r.date, userName: NOT_RECORDED, module: "Purchase Orders", action: "status_change", entity: `PO ${po.poNumber}`, summary: `Received ${qty} unit${qty === 1 ? "" : "s"} into stock` });
      }
    }

    for (const r of returns) {
      derived.push({ ...base, id: `d:ret:${r.id}`, at: r.createdAt, userName: NOT_RECORDED, module: "Returns", action: "create", entity: `Return ${r.returnNumber}`, summary: `${r.type === "customer" ? "Customer" : "Supplier"} return logged for ${r.partyName}` });
      if (r.returnReceivedAt) {
        derived.push({ ...base, id: `d:ret-recv:${r.id}`, at: r.returnReceivedAt, userName: NOT_RECORDED, module: "Returns", action: "status_change", entity: `Return ${r.returnNumber}`, summary: "Marked received — stock updated" });
      }
    }

    for (const w of warranties) {
      derived.push({ ...base, id: `d:war:${w.id}`, at: w.createdAt, userName: "System", userId: "system", module: "Warranty", action: "create", entity: `Warranty ${w.warrantyNumber}`, summary: `Auto-created on delivery of ${w.orderNumber}` });
      for (const c of w.claims) {
        derived.push({ ...base, id: `d:claim:${w.id}:${c.id}`, at: c.submittedAt, userName: NOT_RECORDED, module: "Warranty", action: "create", entity: `Warranty ${w.warrantyNumber}`, summary: `Claim submitted — ${c.issueType}` });
        if (c.closedAt) {
          derived.push({ ...base, id: `d:claim-close:${w.id}:${c.id}`, at: c.closedAt, userName: NOT_RECORDED, module: "Warranty", action: "status_change", entity: `Warranty ${w.warrantyNumber}`, summary: `Claim closed — ${c.issueType}` });
        }
      }
    }

    for (const p of payouts) {
      derived.push({ ...base, id: `d:pay:${p.id}`, at: p.createdAt, userName: NOT_RECORDED, module: "Settlement", action: "create", entity: `Payout ${p.payoutNumber}`, summary: `${p.courier} payout of ${taka(p.amount)} recorded across ${p.allocations.length} order${p.allocations.length === 1 ? "" : "s"}` });
    }

    return [...native, ...derived].filter((e) => e.at).sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [native, orders, purchaseOrders, returns, warranties, payouts]);

  return { entries, hydrated };
}
