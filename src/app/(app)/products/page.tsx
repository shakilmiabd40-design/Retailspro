"use client";

import { useAccess } from "@/lib/settings/access";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  RefreshCcw,
  Upload,
  Download,
  X,
  Eye,
  Pencil,
  Copy,
  Boxes,
  Archive,
  Package,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RowActionsMenu, type RowAction } from "@/components/products/row-actions-menu";
import { StockMatrixModal } from "@/components/products/stock-matrix-modal";
import { ProductStatusBadge, StockStatusBadge } from "@/components/products/status-badges";
import { formatTaka } from "@/lib/products/utils";
import { productStockStatus, totalStock } from "@/lib/products/utils";
import { downloadCsv, productsToCsv, parseImportCsv } from "@/lib/products/csv";
import type { Product, ProductStatus, StockStatus } from "@/lib/products/types";

const PAGE_SIZES = [20, 50, 100] as const;

export default function ProductsListPage() {
  const { can } = useAccess();
  const showCost = can("products", "financial");
  const { products, catalog, deleteProducts, duplicateProduct, setProductsStatus, setProductsCategory, addProduct } =
    useProducts();
  const showToast = useToast();
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [brand, setBrand] = useState("all");
  const [stockStatus, setStockStatus] = useState<"all" | StockStatus>("all");
  const [productStatus, setProductStatus] = useState<"all" | ProductStatus>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(20);
  const [page, setPage] = useState(1);
  const [adjustStockProduct, setAdjustStockProduct] = useState<Product | null>(null);
  const [confirmState, setConfirmState] = useState<{ ids: string[]; label: string } | null>(null);
  const [bulkCategoryValue, setBulkCategoryValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtersActive =
    search.trim() !== "" || category !== "all" || brand !== "all" || stockStatus !== "all" || productStatus !== "all";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        const hit =
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      if (category !== "all" && p.category !== category) return false;
      if (brand !== "all" && p.brand !== brand) return false;
      if (stockStatus !== "all" && productStockStatus(p) !== stockStatus) return false;
      if (productStatus !== "all" && p.status !== productStatus) return false;
      return true;
    });
  }, [products, search, category, brand, stockStatus, productStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function resetToFirstPage() {
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setCategory("all");
    setBrand("all");
    setStockStatus("all");
    setProductStatus("all");
    resetToFirstPage();
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    const allSelected = pageItems.every((p) => selected.has(p.id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        pageItems.forEach((p) => next.delete(p.id));
      } else {
        pageItems.forEach((p) => next.add(p.id));
      }
      return next;
    });
  }

  function handleExport(ids?: string[]) {
    const source = ids ? products.filter((p) => ids.includes(p.id)) : filtered;
    if (!source.length) {
      showToast("Nothing to export", "error");
      return;
    }
    downloadCsv(`products-${Date.now()}.csv`, productsToCsv(source));
    showToast(`Exported ${source.length} product${source.length > 1 ? "s" : ""}`);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rows = parseImportCsv(String(reader.result));
        let count = 0;
        for (const row of rows) {
          if (!row.name || !row.sku) continue;
          const cost = Number(row.costPrice) || 0;
          const price = Number(row.sellingPrice) || 0;
          const stock = Number(row.stock ?? row.totalStock) || 0;
          const product: Product = {
            id: crypto.randomUUID(),
            name: row.name,
            sku: row.sku,
            brand: row.brand || "Unbranded",
            category: row.category || "Uncategorized",
            status: row.status === "inactive" ? "inactive" : "active",
            costPrice: cost,
            sellingPrice: price,
            colors: ["Default"],
            sizes: ["OS"],
            variants: [
              {
                id: crypto.randomUUID(),
                color: "Default",
                size: "OS",
                sku: `${row.sku}-DEF-OS`,
                barcode: "",
                cost,
                price,
                stock,
                reserved: 0,
                status: "active",
              },
            ],
            createdAt: new Date().toISOString(),
          };
          addProduct(product);
          count++;
        }
        showToast(count ? `Imported ${count} product${count > 1 ? "s" : ""}` : "No valid rows found in file", count ? "success" : "error");
      } catch {
        showToast("Could not read that file", "error");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function rowActionsFor(p: Product): RowAction[] {
    return [
      { label: "View", icon: Eye, onClick: () => router.push(`/products/${p.id}`) },
      { label: "Edit", icon: Pencil, onClick: () => router.push(`/products/${p.id}/edit`) },
      {
        label: "Duplicate",
        icon: Copy,
        onClick: () => {
          duplicateProduct(p.id);
          showToast(`Duplicated "${p.name}"`);
        },
      },
      { label: "Adjust Stock", icon: Boxes, onClick: () => setAdjustStockProduct(p) },
      {
        label: p.status === "active" ? "Archive" : "Delete",
        icon: Archive,
        danger: true,
        onClick: () => setConfirmState({ ids: [p.id], label: p.name }),
      },
    ];
  }

  const categories = Array.from(new Set([...catalog.categories, ...products.map((p) => p.category)])).sort();
  const brands = Array.from(new Set([...catalog.brands, ...products.map((p) => p.brand)])).sort();

  const allOnPageSelected = pageItems.length > 0 && pageItems.every((p) => selected.has(p.id));

  return (
    <>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            Products
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {products.length} product{products.length === 1 ? "" : "s"} total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--surface)" }}
          >
            <Upload size={15} />
            Import
          </button>
          <button
            onClick={() => handleExport()}
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--surface)" }}
          >
            <Download size={15} />
            Export
          </button>
          <Link
            href="/products/bulk-stock-update"
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--surface)" }}
          >
            <RefreshCcw size={15} />
            Bulk Stock Update
          </Link>
          <Link
            href="/products/new"
            className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white"
            style={{ background: "var(--brand)" }}
          >
            <Plus size={15} />
            Add Product
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
          <Search size={15} style={{ color: "var(--text-faint)" }} />
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetToFirstPage();
            }}
            placeholder="Search by name, SKU or barcode..."
            className="w-full bg-transparent text-[13px] outline-none"
            style={{ color: "var(--text)" }}
          />
        </label>

        <FilterSelect
          label="Category"
          value={category}
          onChange={(v) => {
            setCategory(v);
            resetToFirstPage();
          }}
          options={["all", ...categories]}
        />
        <FilterSelect
          label="Brand"
          value={brand}
          onChange={(v) => {
            setBrand(v);
            resetToFirstPage();
          }}
          options={["all", ...brands]}
        />
        <FilterSelect
          label="Stock Status"
          value={stockStatus}
          onChange={(v) => {
            setStockStatus(v as typeof stockStatus);
            resetToFirstPage();
          }}
          options={["all", "in-stock", "low-stock", "out-of-stock"]}
          labels={{ all: "All", "in-stock": "In Stock", "low-stock": "Low Stock", "out-of-stock": "Out of Stock" }}
        />
        <FilterSelect
          label="Product Status"
          value={productStatus}
          onChange={(v) => {
            setProductStatus(v as typeof productStatus);
            resetToFirstPage();
          }}
          options={["all", "active", "inactive"]}
          labels={{ all: "All", active: "Active", inactive: "Inactive" }}
        />

        {filtersActive && (
          <button
            onClick={clearFilters}
            className="focus-ring flex items-center gap-1 rounded-xl px-3 py-2 text-[13px] font-medium"
            style={{ color: "var(--brand)" }}
          >
            <X size={14} />
            Clear Filters
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3"
          style={{ background: "var(--brand-tint-bg)", borderColor: "var(--brand-tint-border)" }}
        >
          <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
            {selected.size} selected
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => router.push(`/products/bulk-stock-update?ids=${Array.from(selected).join(",")}`)}
              className="focus-ring rounded-lg border px-3 py-1.5 text-[12.5px] font-medium"
              style={{ borderColor: "var(--brand-tint-border)", color: "var(--text)", background: "var(--surface)" }}
            >
              Update Stock
            </button>

            <select
              value={bulkCategoryValue}
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                setProductsCategory(Array.from(selected), value);
                showToast(`Category updated for ${selected.size} product(s)`);
                setBulkCategoryValue("");
              }}
              className="focus-ring rounded-lg border px-2.5 py-1.5 text-[12.5px] font-medium"
              style={{ borderColor: "var(--brand-tint-border)", color: "var(--text)", background: "var(--surface)" }}
            >
              <option value="">Change Category...</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                setProductsStatus(Array.from(selected), "active");
                showToast(`Marked ${selected.size} product(s) active`);
              }}
              className="focus-ring rounded-lg border px-3 py-1.5 text-[12.5px] font-medium"
              style={{ borderColor: "var(--brand-tint-border)", color: "var(--text)", background: "var(--surface)" }}
            >
              Mark Active
            </button>
            <button
              onClick={() => {
                setProductsStatus(Array.from(selected), "inactive");
                showToast(`Marked ${selected.size} product(s) inactive`);
              }}
              className="focus-ring rounded-lg border px-3 py-1.5 text-[12.5px] font-medium"
              style={{ borderColor: "var(--brand-tint-border)", color: "var(--text)", background: "var(--surface)" }}
            >
              Mark Inactive
            </button>
            <button
              onClick={() => handleExport(Array.from(selected))}
              className="focus-ring rounded-lg border px-3 py-1.5 text-[12.5px] font-medium"
              style={{ borderColor: "var(--brand-tint-border)", color: "var(--text)", background: "var(--surface)" }}
            >
              Export Selected
            </button>
            <button
              onClick={() => setConfirmState({ ids: Array.from(selected), label: `${selected.size} products` })}
              className="focus-ring rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white"
              style={{ background: "var(--red)" }}
            >
              Delete / Archive
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <thead>
              <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} className="h-4 w-4" />
                </th>
                <th className="px-2 py-3 font-medium">Product</th>
                <th className="px-2 py-3 font-medium">SKU</th>
                <th className="px-2 py-3 font-medium">Category</th>
                <th className="px-2 py-3 font-medium">Variants</th>
                {showCost && <th className="px-2 py-3 font-medium">Cost Price</th>}
                <th className="px-2 py-3 font-medium">Selling Price</th>
                <th className="px-2 py-3 font-medium">Stock</th>
                <th className="px-2 py-3 font-medium">Status</th>
                <th className="w-10 px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => {
                const stock = totalStock(p);
                const status = productStockStatus(p);
                return (
                  <tr key={p.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleOne(p.id)}
                        className="h-4 w-4"
                      />
                    </td>
                    <td className="px-2 py-3">
                      <Link href={`/products/${p.id}`} className="flex items-center gap-3">
                        <span
                          className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg"
                          style={{ background: "var(--surface-2)" }}
                        >
                          <Package size={16} style={{ color: "var(--text-faint)" }} />
                          {p.imageUrl && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="absolute inset-0 h-full w-full object-cover"
                              onError={(e) => {
                                (e.currentTarget as HTMLImageElement).style.display = "none";
                              }}
                            />
                          )}
                        </span>
                        <span>
                          <span className="block text-[13px] font-medium" style={{ color: "var(--text)" }}>
                            {p.name}
                          </span>
                          <span className="block text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                            {p.brand}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-2 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {p.sku}
                    </td>
                    <td className="px-2 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {p.category}
                    </td>
                    <td className="px-2 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                      {p.variants.length}
                    </td>
                    {showCost && (
                      <td className="px-2 py-3 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                        {formatTaka(p.costPrice, 2)}
                      </td>
                    )}
                    <td className="px-2 py-3 text-[12.5px] font-medium" style={{ color: "var(--text)" }}>
                      {formatTaka(p.sellingPrice, 2)}
                    </td>
                    <td className="px-2 py-3">
                      <p className="text-[12.5px] font-medium" style={{ color: "var(--text)" }}>
                        {stock} {stock === 1 ? "pair" : "pairs"}
                      </p>
                      <div className="mt-1">
                        <StockStatusBadge status={status} />
                      </div>
                    </td>
                    <td className="px-2 py-3">
                      <ProductStatusBadge status={p.status} />
                    </td>
                    <td className="px-2 py-3 text-right">
                      <RowActionsMenu actions={rowActionsFor(p)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {pageItems.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <Package size={28} style={{ color: "var(--text-faint)" }} />
              <p className="text-[13.5px] font-medium" style={{ color: "var(--text)" }}>
                No products found
              </p>
              <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                Try adjusting your filters, or add a new product.
              </p>
            </div>
          )}
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Show
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]);
                resetToFirstPage();
              }}
              className="focus-ring rounded-lg border px-2 py-1"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
            >
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            per page · {filtered.length} results
          </div>

          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Page {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      <StockMatrixModal
        product={adjustStockProduct}
        open={!!adjustStockProduct}
        onClose={() => setAdjustStockProduct(null)}
      />

      <ConfirmDialog
        open={!!confirmState}
        title="Delete / Archive product"
        message={`Are you sure you want to delete "${confirmState?.label}"? This cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          if (confirmState) {
            deleteProducts(confirmState.ids);
            setSelected((prev) => {
              const next = new Set(prev);
              confirmState.ids.forEach((id) => next.delete(id));
              return next;
            });
            showToast(`Deleted ${confirmState.ids.length} product(s)`);
          }
          setConfirmState(null);
        }}
      />
    </>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  labels,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels?: Record<string, string>;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring rounded-xl border px-3 py-2 text-[13px]"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {labels?.[opt] ?? (opt === "all" ? "All" : opt)}
          </option>
        ))}
      </select>
    </label>
  );
}
