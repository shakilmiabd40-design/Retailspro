"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PurchaseOrderForm } from "@/components/purchase-orders/purchase-order-form";
import { useProducts } from "@/lib/products/store";
import type { POItem } from "@/lib/purchase-orders/types";

/** Supports ?variantId=…&qty=… so a stock alert can open a purchase order with the item already added. */
function NewPurchaseOrder() {
  const params = useSearchParams();
  const { products, hydrated } = useProducts();

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const variantId = params.get("variantId");
  let prefillItems: POItem[] | undefined;
  if (variantId) {
    const product = products.find((p) => p.variants.some((v) => v.id === variantId));
    const variant = product?.variants.find((v) => v.id === variantId);
    if (product && variant) {
      const qty = Math.max(1, Math.floor(Number(params.get("qty")) || 1));
      prefillItems = [
        {
          id: crypto.randomUUID(),
          productId: product.id,
          productName: product.name,
          variantId: variant.id,
          color: variant.color,
          size: variant.size,
          sku: variant.sku,
          qtyOrdered: qty,
          qtyReceived: 0,
          unitCost: variant.cost,
        },
      ];
    }
  }

  return <PurchaseOrderForm prefillItems={prefillItems} />;
}

export default function CreatePurchaseOrderPage() {
  return (
    <Suspense fallback={null}>
      <NewPurchaseOrder />
    </Suspense>
  );
}
