"use client";

import type { RefObject } from "react";
import type { Product, Variant } from "@/lib/products/types";
import type { SaleDraft } from "@/lib/pos/types";
import { ProductBrowser } from "@/components/pos/product-browser";

/**
 * The POS product browser reused by the Orders module: search by name/SKU/barcode, product photos,
 * and four cards per row so the right item is easy to recognise before adding.
 */
export function OrderProductPicker({
  products,
  draft,
  searchRef,
  onAdd,
}: {
  products: Product[];
  draft: SaleDraft;
  searchRef: RefObject<HTMLInputElement | null>;
  onAdd: (product: Product, variant: Variant, qty: number) => void;
}) {
  return (
    <div className="relative mx-auto max-h-[70vh] overflow-hidden rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <ProductBrowser
        products={products}
        draft={draft}
        scanEnabled={false}
        beepOnScan={false}
        captureKeys={false}
        view="grid"
        onViewChange={() => {}}
        searchRef={searchRef}
        columns={4}
        onAdd={onAdd}
      />
    </div>
  );
}
