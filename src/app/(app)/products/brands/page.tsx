"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { TagListManager } from "@/components/products/tag-list-manager";

export default function BrandsPage() {
  const { catalog, products, addCatalogItem, removeCatalogItem } = useProducts();

  return (
    <>
      <Link href="/products" className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back to Products
      </Link>
      <div>
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
          Brands
        </h1>
      </div>
      <TagListManager
        title="Brands"
        description="Brands show up as suggestions on the Add/Edit Product form and as a filter on the product list."
        items={catalog.brands}
        onAdd={(v) => addCatalogItem("brands", v)}
        onRemove={(v) => removeCatalogItem("brands", v)}
        usageCount={(v) => products.filter((p) => p.brand === v).length}
        placeholder="e.g. New Balance"
      />
    </>
  );
}
