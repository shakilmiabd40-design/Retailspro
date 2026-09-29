"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSettings } from "@/lib/settings/store";
import { useProducts } from "@/lib/products/store";
import type { StockUpdate } from "@/lib/products/store";
import { useCollection } from "@/lib/persist/hooks";
import { takeNumberOrFallback } from "@/lib/persist/numbers";
import { isFullyReceived } from "./utils";
import type { POItem, POStatus, PurchaseOrder, ReceivingLine } from "./types";


export type NewPoInput = {
  supplierId: string;
  poDate: string;
  expectedDate?: string;
  notes?: string;
  items: Omit<POItem, "id" | "qtyReceived">[];
  shippingCost: number;
  discount: number;
  status: "draft" | "approved";
};

interface PurchaseOrdersContextValue {
  purchaseOrders: PurchaseOrder[];
  hydrated: boolean;
  getPo: (id: string) => PurchaseOrder | undefined;
  createPo: (input: NewPoInput) => PurchaseOrder;
  updatePo: (id: string, updater: (po: PurchaseOrder) => PurchaseOrder) => void;
  approvePo: (id: string) => void;
  sendPo: (id: string) => void;
  cancelPo: (id: string) => void;
  deletePo: (id: string) => { ok: true } | { ok: false; error: string };
  receiveStock: (id: string, lines: ReceivingLine[], note?: string) => void;
}

const PurchaseOrdersContext = createContext<PurchaseOrdersContextValue | null>(null);

export function PurchaseOrdersProvider({ children }: { children: ReactNode }) {
  const { bulkUpdateStock } = useProducts();
  const { settings } = useSettings();
  const [purchaseOrders, setPurchaseOrders, hydrated] = useCollection<PurchaseOrder>("purchase_orders");

  const getPo = (id: string) => purchaseOrders.find((p) => p.id === id);

  function createPo(input: NewPoInput): PurchaseOrder {
    const now = new Date().toISOString();
    const po: PurchaseOrder = {
      id: crypto.randomUUID(),
      poNumber: `${settings.invoice.numbering.po}${takeNumberOrFallback("po")}`,
      supplierId: input.supplierId,
      status: input.status,
      poDate: input.poDate,
      expectedDate: input.expectedDate,
      notes: input.notes,
      items: input.items.map((i) => ({ ...i, id: crypto.randomUUID(), qtyReceived: 0 })),
      shippingCost: input.shippingCost,
      discount: input.discount,
      receivings: [],
      createdAt: now,
      updatedAt: now,
    };
    setPurchaseOrders((prev) => [po, ...prev]);
    return po;
  }

  function updatePo(id: string, updater: (po: PurchaseOrder) => PurchaseOrder) {
    setPurchaseOrders((prev) => prev.map((p) => (p.id === id ? { ...updater(p), updatedAt: new Date().toISOString() } : p)));
  }

  function approvePo(id: string) {
    updatePo(id, (p) => (p.status === "draft" ? { ...p, status: "approved" } : p));
  }

  function sendPo(id: string) {
    updatePo(id, (p) => (p.status === "approved" ? { ...p, status: "sent" } : p));
  }

  function cancelPo(id: string) {
    updatePo(id, (p) => (p.status !== "received" && p.status !== "cancelled" ? { ...p, status: "cancelled" } : p));
  }

  function deletePo(id: string): { ok: true } | { ok: false; error: string } {
    const po = getPo(id);
    if (!po) return { ok: false, error: "Purchase order not found." };
    if (po.receivings.length > 0) {
      return { ok: false, error: "This PO has received stock — cancel it instead of deleting." };
    }
    setPurchaseOrders((prev) => prev.filter((p) => p.id !== id));
    return { ok: true };
  }

  function receiveStock(id: string, lines: ReceivingLine[], note?: string) {
    const po = getPo(id);
    if (!po) return;

    const updates: StockUpdate[] = lines
      .filter((l) => l.qty > 0)
      .map((l) => {
        const item = po.items.find((i) => i.variantId === l.variantId)!;
        return { productId: item.productId, variantId: l.variantId, value: l.qty, mode: "add" as const };
      });
    if (updates.length) bulkUpdateStock(updates);

    updatePo(id, (p) => {
      const nextItems = p.items.map((i) => {
        const line = lines.find((l) => l.variantId === i.variantId);
        if (!line || line.qty <= 0) return i;
        return { ...i, qtyReceived: Math.min(i.qtyOrdered, i.qtyReceived + line.qty), unitCost: line.unitCost || i.unitCost };
      });
      const nextPo: PurchaseOrder = {
        ...p,
        items: nextItems,
        receivings: [...p.receivings, { id: crypto.randomUUID(), date: new Date().toISOString(), items: lines.filter((l) => l.qty > 0), note }],
      };
      const status: POStatus = isFullyReceived(nextPo) ? "received" : "partially_received";
      return { ...nextPo, status };
    });
  }

  const value = useMemo<PurchaseOrdersContextValue>(
    () => ({ purchaseOrders, hydrated, getPo, createPo, updatePo, approvePo, sendPo, cancelPo, deletePo, receiveStock }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [purchaseOrders, hydrated]
  );

  return <PurchaseOrdersContext.Provider value={value}>{children}</PurchaseOrdersContext.Provider>;
}

export function usePurchaseOrders() {
  const ctx = useContext(PurchaseOrdersContext);
  if (!ctx) throw new Error("usePurchaseOrders must be used within a PurchaseOrdersProvider");
  return ctx;
}
