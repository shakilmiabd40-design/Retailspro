"use client";

import { useCallback, useEffect, useState } from "react";
import type { Product, Variant } from "@/lib/products/types";
import { availableStock } from "@/lib/products/utils";
import type { CartCustomer, CartLine, DiscountLogEntry, DiscountType, HeldSale, SaleDraft } from "./types";
import { discountAmount, emptyDraft, EMPTY_CUSTOMER, NO_DISCOUNT } from "./utils";
import type { DiscountPolicy } from "./store";

const key = (userId: string) => `rp:pos:draft:${userId}`;

function load(userId: string): SaleDraft {
  try {
    const raw = sessionStorage.getItem(key(userId));
    if (!raw) return emptyDraft();
    const d = JSON.parse(raw) as Partial<SaleDraft>;
    return {
      lines: Array.isArray(d.lines) ? d.lines : [],
      cartDiscount: d.cartDiscount ?? { ...NO_DISCOUNT },
      customer: { ...EMPTY_CUSTOMER, ...(d.customer ?? {}) },
      discountLog: Array.isArray(d.discountLog) ? d.discountLog : [],
    };
  } catch {
    return emptyDraft();
  }
}

export interface CommitResult {
  type: DiscountType;
  value: number;
  /** Set when the entered value was cut back to the person's limit. */
  clamped?: string;
}

/**
 * The cart of the sale being rung up. Lives in the browser tab (sessionStorage), so a reload or a trip to another
 * POS page doesn't lose it. Nothing here touches stock — that only happens when the sale is completed.
 */
export function useCart(opts: { userId: string; userName: string; policy: DiscountPolicy; /** false = a scratch cart (e.g. the new items of an exchange) that isn't kept across reloads. */ persist?: boolean }) {
  const { userId, userName, policy, persist = true } = opts;
  const [draft, setDraft] = useState<SaleDraft>(() => (!persist || typeof window === "undefined" ? emptyDraft() : load(userId)));

  useEffect(() => {
    if (!persist) return;
    try {
      sessionStorage.setItem(key(userId), JSON.stringify(draft));
    } catch {
      /* private mode / quota — the cart just won't survive a reload */
    }
  }, [draft, userId, persist]);

  const addVariant = useCallback((product: Product, variant: Variant, qty = 1) => {
    setDraft((d) => {
      const existing = d.lines.find((l) => l.variantId === variant.id);
      if (existing) return { ...d, lines: d.lines.map((l) => (l.variantId === variant.id ? { ...l, qty: l.qty + qty } : l)) };
      const line: CartLine = {
        key: variant.id,
        productId: product.id,
        productName: product.name,
        imageUrl: product.imageUrl,
        variantId: variant.id,
        color: variant.color,
        size: variant.size,
        sku: variant.sku,
        barcode: variant.barcode || product.barcode,
        price: variant.price,
        cost: variant.cost,
        qty,
        discountType: "fixed",
        discountValue: 0,
      };
      return { ...d, lines: [...d.lines, line] };
    });
  }, []);

  const setQty = useCallback((variantId: string, qty: number) => setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.variantId === variantId ? { ...l, qty: Math.max(1, Math.floor(qty) || 1) } : l)) })), []);
  const remove = useCallback((variantId: string) => setDraft((d) => ({ ...d, lines: d.lines.filter((l) => l.variantId !== variantId) })), []);
  const setCustomer = useCallback((patch: Partial<CartCustomer>) => setDraft((d) => ({ ...d, customer: { ...d.customer, ...patch } })), []);
  const clear = useCallback(() => setDraft(emptyDraft()), []);
  const replace = useCallback((next: SaleDraft) => setDraft(next), []);
  const loadHeld = useCallback((h: HeldSale) => setDraft({ lines: h.lines, cartDiscount: h.cartDiscount, customer: h.customer, discountLog: h.discountLog }), []);

  /** Applies a typed discount, cutting it back to the person's limit, and records the change for the audit trail. */
  const commitDiscount = useCallback(
    (scope: { kind: "line"; variantId: string } | { kind: "cart" }, type: DiscountType, raw: number, liveBase: number): CommitResult => {
      let value = Number.isFinite(raw) && raw > 0 ? raw : 0;
      let clamped: string | undefined;
      const cap = policy.cap;
      const maxByPercent = type === "percent" ? 100 : liveBase;
      if (value > maxByPercent) {
        value = maxByPercent;
        clamped = type === "percent" ? "A discount can't be more than 100%." : "A discount can't be more than the amount it applies to.";
      }
      if (cap !== null && liveBase > 0) {
        const pct = type === "percent" ? value : (value / liveBase) * 100;
        if (pct > cap + 0.0001) {
          value = type === "percent" ? cap : Math.floor(((liveBase * cap) / 100) * 100) / 100;
          clamped = `Your discount limit is ${cap}% — ask a manager to override.`;
        }
      }
      value = Math.round(value * 100) / 100;

      setDraft((d) => {
        const prev = scope.kind === "cart" ? d.cartDiscount : d.lines.find((l) => l.variantId === scope.variantId);
        if (!prev) return d;
        const from = scope.kind === "cart" ? { type: (prev as SaleDraft["cartDiscount"]).type, value: (prev as SaleDraft["cartDiscount"]).value } : { type: (prev as CartLine).discountType, value: (prev as CartLine).discountValue };
        if (from.type === type && from.value === value) return d;
        const line = scope.kind === "line" ? (prev as CartLine) : null;
        const over = policy.canOverride && policy.cap === null && (type === "percent" ? value : liveBase > 0 ? (value / liveBase) * 100 : 0) > policy.roleCap;
        const entry: DiscountLogEntry = {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          byId: userId,
          by: userName,
          scope: scope.kind,
          target: line ? `${line.productName} (${line.color}/${line.size})` : "Whole cart",
          from,
          to: { type, value },
          amount: discountAmount(type, value, liveBase),
          override: over,
        };
        const log = [...d.discountLog, entry];
        return scope.kind === "cart"
          ? { ...d, cartDiscount: { type, value }, discountLog: log }
          : { ...d, lines: d.lines.map((l) => (l.variantId === scope.variantId ? { ...l, discountType: type, discountValue: value } : l)), discountLog: log };
      });
      return { type, value, clamped };
    },
    [policy.cap, policy.roleCap, policy.canOverride, userId, userName]
  );

  return { draft, addVariant, setQty, remove, setCustomer, clear, replace, loadHeld, commitDiscount };
}

/** Quantity of a variant already in the cart. */
export const qtyInCart = (d: SaleDraft, variantId: string) => d.lines.find((l) => l.variantId === variantId)?.qty ?? 0;

/** What can still be added for a variant once the cart's own quantity is taken off. */
export const availableToAdd = (d: SaleDraft, v: Variant) => Math.max(0, availableStock(v) - qtyInCart(d, v.id));

