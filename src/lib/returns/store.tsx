"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCollection } from "@/lib/persist/hooks";
import { takeNumberOrFallback } from "@/lib/persist/numbers";
import { useProducts } from "@/lib/products/store";
import type { StockUpdate } from "@/lib/products/store";
import { useOrders } from "@/lib/orders/store";
import { useWarranty } from "@/lib/warranty/store";
import { useSettings } from "@/lib/settings/store";
import type { ReturnItem, ReturnRecord } from "./types";


export type NewCustomerReturnInput = {
  orderId: string;
  items: Omit<ReturnItem, "id">[];
  action: "refund" | "exchange" | "warranty_claim";
  refundAmount?: number;
  refundMethod?: string;
  notes?: string;
};

export type NewSupplierReturnInput = {
  supplierId: string;
  supplierName: string;
  poId?: string;
  poLabel?: string;
  items: Omit<ReturnItem, "id">[];
  transportCost?: number;
  notes?: string;
};

interface ReturnsContextValue {
  returns: ReturnRecord[];
  hydrated: boolean;
  getReturn: (id: string) => ReturnRecord | undefined;
  createCustomerReturn: (input: NewCustomerReturnInput) => { ok: true; record: ReturnRecord } | { ok: false; error: string };
  createSupplierReturn: (input: NewSupplierReturnInput) => ReturnRecord;
  approveReturn: (id: string) => void;
  rejectReturn: (id: string) => void;
  markReturnReceived: (id: string) => void;
  closeReturn: (id: string) => void;
  deleteReturn: (id: string) => { ok: true } | { ok: false; error: string };
}

const ReturnsContext = createContext<ReturnsContextValue | null>(null);

export function ReturnsProvider({ children }: { children: ReactNode }) {
  const { bulkUpdateStock } = useProducts();
  const { getOrder } = useOrders();
  const { voidWarrantiesForOrderItem } = useWarranty();
  const { settings } = useSettings();
  const [returns, setReturns, hydrated] = useCollection<ReturnRecord>("returns");

  const getReturn = (id: string) => returns.find((r) => r.id === id);

  function nextNumber() {
    return `${settings.invoice.numbering.return}${takeNumberOrFallback("return")}`;
  }

  function createCustomerReturn(input: NewCustomerReturnInput): { ok: true; record: ReturnRecord } | { ok: false; error: string } {
    const order = getOrder(input.orderId);
    if (!order) return { ok: false, error: "Order not found." };
    // Important rule (spec C2): only Delivered orders can have a customer return.
    if (settings.returns.customerOnlyDelivered && order.status !== "delivered") {
      return { ok: false, error: "Only Delivered orders can have a customer return (this order was never a completed sale)." };
    }
    if (!input.items.length) return { ok: false, error: "Add at least one item to return." };

    const now = new Date().toISOString();
    const record: ReturnRecord = {
      id: crypto.randomUUID(),
      returnNumber: nextNumber(),
      type: "customer",
      referenceId: order.id,
      referenceLabel: order.orderNumber,
      partyName: order.customerName,
      status: "requested",
      items: input.items.map((i) => ({ ...i, id: crypto.randomUUID() })),
      action: input.action,
      refundAmount: input.refundAmount,
      refundMethod: input.refundMethod,
      notes: input.notes,
      returnReceived: false,
      createdAt: now,
      updatedAt: now,
    };
    setReturns((prev) => [record, ...prev]);
    return { ok: true, record };
  }

  function createSupplierReturn(input: NewSupplierReturnInput): ReturnRecord {
    const now = new Date().toISOString();
    const record: ReturnRecord = {
      id: crypto.randomUUID(),
      returnNumber: nextNumber(),
      type: "supplier",
      referenceId: input.poId ?? input.supplierId,
      referenceLabel: input.poLabel ?? input.supplierName,
      partyName: input.supplierName,
      status: "requested",
      items: input.items.map((i) => ({ ...i, id: crypto.randomUUID() })),
      transportCost: input.transportCost,
      notes: input.notes,
      returnReceived: false,
      createdAt: now,
      updatedAt: now,
    };
    setReturns((prev) => [record, ...prev]);
    return record;
  }

  function updateReturn(id: string, updater: (r: ReturnRecord) => ReturnRecord) {
    setReturns((prev) => prev.map((r) => (r.id === id ? { ...updater(r), updatedAt: new Date().toISOString() } : r)));
  }

  function approveReturn(id: string) {
    const record = getReturn(id);
    updateReturn(id, (r) => (r.status === "requested" ? { ...r, status: "approved" } : r));
    // Section 19 / C2 — approving a customer return voids the warranty for those items.
    if (record && record.type === "customer") {
      if (settings.warranty.voidOnReturn) record.items.forEach((item) => voidWarrantiesForOrderItem(record.referenceId, item.variantId, "Item returned by customer"));
    }
  }

  function rejectReturn(id: string) {
    updateReturn(id, (r) => (r.status === "requested" ? { ...r, status: "rejected" } : r));
  }

  /**
   * Marking the parcel physically received. For customer returns, resellable
   * (New) condition items go back to available stock; Damaged items are left
   * out of sellable stock (tracked only via the return record, per spec C2).
   * For supplier returns, stock decreases — the item is leaving the business.
   */
  function markReturnReceived(id: string) {
    const record = getReturn(id);
    if (!record || record.returnReceived) return;

    if (record.type === "customer") {
      const updates: StockUpdate[] = record.items
        .filter((i) => i.condition !== "damaged")
        .map((i) => ({ productId: i.productId, variantId: i.variantId, value: i.qty, mode: "add" as const }));
      if (updates.length) bulkUpdateStock(updates);
    } else {
      const updates: StockUpdate[] = record.items.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        value: i.qty,
        mode: "remove" as const,
      }));
      if (updates.length) bulkUpdateStock(updates);
    }

    updateReturn(id, (r) => ({ ...r, status: "received", returnReceived: true, returnReceivedAt: new Date().toISOString() }));
  }

  function closeReturn(id: string) {
    updateReturn(id, (r) => ({ ...r, status: "closed" }));
  }

  function deleteReturn(id: string): { ok: true } | { ok: false; error: string } {
    const record = getReturn(id);
    if (!record) return { ok: false, error: "Return not found." };
    if (record.status === "received" || record.status === "closed") {
      return { ok: false, error: "This return has already been received/closed — it can't be deleted." };
    }
    setReturns((prev) => prev.filter((r) => r.id !== id));
    return { ok: true };
  }

  const value = useMemo<ReturnsContextValue>(
    () => ({
      returns,
      hydrated,
      getReturn,
      createCustomerReturn,
      createSupplierReturn,
      approveReturn,
      rejectReturn,
      markReturnReceived,
      closeReturn,
      deleteReturn,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [returns, hydrated]
  );

  return <ReturnsContext.Provider value={value}>{children}</ReturnsContext.Provider>;
}

export function useReturns() {
  const ctx = useContext(ReturnsContext);
  if (!ctx) throw new Error("useReturns must be used within a ReturnsProvider");
  return ctx;
}
