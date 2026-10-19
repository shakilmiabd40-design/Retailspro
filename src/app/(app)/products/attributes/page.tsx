"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { TagListManager } from "@/components/products/tag-list-manager";

export default function AttributesPage() {
  const { catalog, products, addCatalogItem, removeCatalogItem } = useProducts();

  return (
    <>
      <Link href="/products" className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back to Products
      </Link>
      <div>
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
          Attributes
        </h1>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Manage the global Size and Color suggestions used when building product variants.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TagListManager
          title="Sizes"
          description="Suggested sizes shown while adding shoe attributes on a product."
          items={catalog.sizes}
          onAdd={(v) => addCatalogItem("sizes", v)}
          onRemove={(v) => removeCatalogItem("sizes", v)}
          usageCount={(v) => products.filter((p) => p.sizes.includes(v)).length}
          placeholder="e.g. 44"
        />
        <TagListManager
          title="Colors"
          description="Suggested colors shown while adding shoe attributes on a product."
          items={catalog.colors}
          onAdd={(v) => addCatalogItem("colors", v)}
          onRemove={(v) => removeCatalogItem("colors", v)}
          usageCount={(v) => products.filter((p) => p.colors.includes(v)).length}
          placeholder="e.g. Green"
        />
      </div>
    </>
  );
}
