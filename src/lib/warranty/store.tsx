"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCollection } from "@/lib/persist/hooks";
import { takeNumberOrFallback } from "@/lib/persist/numbers";
import type { ClaimStatus, Warranty } from "./types";
import { useSettings } from "@/lib/settings/store";


/** Minimal shape Orders passes in — avoids a circular import on the Order type. */
export type DeliveredOrderForWarranty = {
  id: string;
  orderNumber: string;
  /** "pos" when the id / number are a POS invoice's. */
  source?: "order" | "pos";
  customerName: string;
  phone: string;
  items: { productId: string; productName: string; variantId: string; color: string; size: string; sku: string; qty: number }[];
};

interface WarrantyContextValue {
  warranties: Warranty[];
  hydrated: boolean;
  getWarranty: (id: string) => Warranty | undefined;
  createWarrantiesForOrder: (order: DeliveredOrderForWarranty) => void;
  /**
   * Removes the warranties for an order/invoice from LOCAL state only — no API call. For when the sale that
   * created them turns out never to have reached the server (a same-instant conflict tore up the whole compound
   * write); at that point they were never really issued, so there is nothing to delete server-side.
   */
  discardForOrder: (orderId: string) => void;
  voidWarrantiesForOrderItem: (orderId: string, variantId: string, reason: string) => void;
  addClaim: (warrantyId: string, input: { issueType: string; description?: string }) => void;
  updateClaimStatus: (warrantyId: string, claimId: string, status: ClaimStatus, resolutionNotes?: string) => void;
}

const WarrantyContext = createContext<WarrantyContextValue | null>(null);

export function WarrantyProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [warranties, setWarranties, hydrated] = useCollection<Warranty>("warranties");

  const getWarranty = (id: string) => warranties.find((w) => w.id === id);

  function createWarrantiesForOrder(order: DeliveredOrderForWarranty) {
    const now = new Date();
    const end = new Date(now.getTime() + settings.warranty.durationDays * 24 * 60 * 60 * 1000);
    const created: Warranty[] = order.items.map((item) => {
      const w: Warranty = {
        id: crypto.randomUUID(),
        warrantyNumber: `${settings.invoice.numbering.warranty}${takeNumberOrFallback("warranty")}`,
        orderId: order.id,
        orderNumber: order.orderNumber,
        source: order.source ?? "order",
        customerName: order.customerName,
        customerPhone: order.phone,
        productId: item.productId,
        productName: item.productName,
        variantId: item.variantId,
        color: item.color,
        size: item.size,
        sku: item.sku,
        qty: item.qty,
        startDate: now.toISOString(),
        endDate: end.toISOString(),
        status: "active",
        claims: [],
        createdAt: now.toISOString(),
      };
      return w;
    });
    setWarranties((prev) => [...created, ...prev]);
  }

  const discardForOrder = (orderId: string) => setWarranties((prev) => prev.filter((w) => w.orderId !== orderId));

  /** Sales-return rule: warranty for the returned item(s) is voided. */
  function voidWarrantiesForOrderItem(orderId: string, variantId: string, reason: string) {
    setWarranties((prev) =>
      prev.map((w) => (w.orderId === orderId && w.variantId === variantId && w.status !== "void" ? { ...w, status: "void", voidReason: reason } : w))
    );
  }

  function addClaim(warrantyId: string, input: { issueType: string; description?: string }) {
    const claimNo = `${settings.invoice.numbering.claim}${takeNumberOrFallback("claim")}`;
    setWarranties((prev) =>
      prev.map((w) =>
        w.id === warrantyId
          ? {
              ...w,
              status: "claimed",
              claims: [
                ...w.claims,
                {
                  id: crypto.randomUUID(),
                  claimNumber: claimNo,
                  issueType: input.issueType,
                  description: input.description,
                  status: "submitted",
                  submittedAt: new Date().toISOString(),
                },
              ],
            }
          : w
      )
    );
  }

  function updateClaimStatus(warrantyId: string, claimId: string, status: ClaimStatus, resolutionNotes?: string) {
    const isClosing = status === "closed" || status === "rejected" || status === "replaced" || status === "refunded";
    setWarranties((prev) =>
      prev.map((w) =>
        w.id === warrantyId
          ? {
              ...w,
              status: isClosing ? "closed" : "claimed",
              claims: w.claims.map((c) =>
                c.id === claimId
                  ? { ...c, status, resolutionNotes: resolutionNotes ?? c.resolutionNotes, closedAt: isClosing ? new Date().toISOString() : c.closedAt }
                  : c
              ),
            }
          : w
      )
    );
  }

  const value = useMemo<WarrantyContextValue>(
    () => ({ warranties, hydrated, getWarranty, createWarrantiesForOrder, discardForOrder, voidWarrantiesForOrderItem, addClaim, updateClaimStatus }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [warranties, hydrated]
  );

  return <WarrantyContext.Provider value={value}>{children}</WarrantyContext.Provider>;
}

export function useWarranty() {
  const ctx = useContext(WarrantyContext);
  if (!ctx) throw new Error("useWarranty must be used within a WarrantyProvider");
  return ctx;
}
