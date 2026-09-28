"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { TagListManager } from "@/components/products/tag-list-manager";

export default function CategoriesPage() {
  const { catalog, products, addCatalogItem, removeCatalogItem } = useProducts();

  return (
    <>
      <Link href="/products" className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back to Products
      </Link>
      <div>
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
          Categories
        </h1>
      </div>
      <TagListManager
        title="Product Categories"
        description="Categories show up as suggestions on the Add/Edit Product form and as a filter on the product list."
        items={catalog.categories}
        onAdd={(v) => addCatalogItem("categories", v)}
        onRemove={(v) => removeCatalogItem("categories", v)}
        usageCount={(v) => products.filter((p) => p.category === v).length}
        placeholder="e.g. Sandals"
      />
    </>
  );
}
