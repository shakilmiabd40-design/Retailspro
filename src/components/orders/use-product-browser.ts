"use client";

import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import type { Product, Variant } from "@/lib/products/types";
import type { OrderItem } from "@/lib/orders/types";
import { useCart } from "@/lib/pos/use-cart";
import { emptyDraft } from "@/lib/pos/utils";
import type { SaleDraft } from "@/lib/pos/types";

type PBBrowserLine = SaleDraft["lines"][number] & { variantId: string; qty: number; key: string };

/** useCart reuses existing POS defaults for the scratch draft; there are no limits to apply in the Orders module. */
const POS_CART_OPTS = { userId: "order-edit", userName: "orders", policy: { cap: null, roleCap: Infinity, canOverride: false }, persist: false };

export interface OrderProductBrowser {
  draft: SaleDraft;
  searchRef: RefObject<HTMLInputElement | null>;
  /** Mirror the module's `items` into the cart that ProductBrowser reads. */
  syncToItems: (items: OrderItem[]) => void;
  /** Add to the order via the cart picker. `key` is the line id to update instead of adding. */
  add: (p: Product, v: Variant, qty: number, key?: string) => void;
}

/**
 * Shared machinery for the Orders module's product search: a scratch cart (ProductBrowser's stock view) that
 * mirrors the local `items` state. Picks flow through `add`; local edits flow through `syncToItems`.
 */
export function useOrderProductBrowser(setItems: React.Dispatch<React.SetStateAction<OrderItem[]>>): OrderProductBrowser {
  const { draft, replace } = useCart(POS_CART_OPTS);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const syncToItems = useCallback(
    (items: OrderItem[]) => {
      replace({ ...emptyDraft(), lines: items.map((i) => ({ key: i.id, variantId: i.variantId, qty: i.qty }) as PBBrowserLine) });
    },
    [replace]
  );

  const add = useCallback(
    (p: Product, v: Variant, qty: number, key?: string) => {
      const q = Math.max(1, qty);
      // Stock is validated authoritatively on save (it credits what this order already holds).
      setItems((prev) => {
        const existing = prev.find((i) => i.variantId === v.id);
        if (key && prev.some((i) => i.id === key)) return prev.map((i) => (i.id === key ? { ...i, qty: i.qty + q } : i));
        if (existing) return prev.map((i) => (i.variantId === v.id ? { ...i, qty: i.qty + q } : i));
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            productId: p.id,
            productName: p.name,
            variantId: v.id,
            color: v.color,
            size: v.size,
            sku: v.sku,
            price: v.price,
            qty: q,
            discount: 0,
          },
        ];
      });
    },
    [setItems]
  );

  return { draft, searchRef, syncToItems, add };
}
