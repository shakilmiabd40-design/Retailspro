"use client";

import { useAccess } from "@/lib/settings/access";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Boxes, Printer, Image as ImageIcon, Trash2 } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StockMatrixModal } from "@/components/products/stock-matrix-modal";
import { ProductStatusBadge, StockStatusBadge } from "@/components/products/status-badges";
import {
  lowStockVariantCount,
  outOfStockVariantCount,
  stockStatusFor,
  totalStock,
  formatTaka,
} from "@/lib/products/utils";

export default function ProductDetailsPage() {
  const { can } = useAccess();
  const showCost = can("products", "financial");
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getProduct, hydrated, deleteProduct } = useProducts();
  const showToast = useToast();
  const product = getProduct(params.id);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!hydrated) {
    return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  if (!product) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          Product not found
        </p>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          It may have been deleted. Go back to the product list.
        </p>
        <Link
          href="/products"
          className="focus-ring mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white"
          style={{ background: "var(--brand)" }}
        >
          <ArrowLeft size={14} />
          Back to Products
        </Link>
      </div>
    );
  }

  function handlePrintBarcodes() {
    if (!product) return;
    const win = window.open("", "_blank", "width=420,height=600");
    if (!win) {
      showToast("Pop-up blocked — allow pop-ups to print barcodes", "error");
      return;
    }
    const rows = product.variants
      .map(
        (v) => `
        <div style="border:1px solid #ddd;border-radius:8px;padding:10px 12px;margin-bottom:8px;">
          <div style="font-weight:600;font-size:13px;">${product.name} — ${v.color} / ${v.size}</div>
          <div style="font-size:12px;color:#555;">SKU: ${v.sku}</div>
          <div style="font-family:monospace;font-size:20px;letter-spacing:2px;margin-top:4px;">${v.barcode || "— no barcode —"}</div>
        </div>`
      )
      .join("");
    win.document.write(`
      <html><head><title>Barcodes — ${product.name}</title></head>
      <body style="font-family: ui-sans-serif, system-ui; padding:16px;">
        <h2 style="font-size:15px;">${product.name} (${product.sku})</h2>
        ${rows}
        <script>window.onload = () => window.print();</script>
      </body></html>
    `);
    win.document.close();
  }

  const stock = totalStock(product);
  const status = stockStatusFor(stock);

  return (
    <>
      <button
        onClick={() => router.back()}
        className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium"
        style={{ color: "var(--text-muted)" }}
      >
        <ArrowLeft size={14} />
        Back
      </button>

      {/* Top summary */}
      <div className="card flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
        <div
          className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl"
          style={{ background: "var(--surface-2)" }}
        >
          <ImageIcon size={26} style={{ color: "var(--text-faint)" }} />
          {product.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              className="absolute inset-0 h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          )}
        </div>

        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[19px] font-semibold" style={{ color: "var(--text)" }}>
              {product.name}
            </h1>
            <ProductStatusBadge status={product.status} />
          </div>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
            {product.sku} {product.barcode ? `· ${product.barcode}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            <span>
              Brand: <b style={{ color: "var(--text)" }}>{product.brand || "—"}</b>
            </span>
            <span>
              Category: <b style={{ color: "var(--text)" }}>{product.category || "—"}</b>
            </span>
            {product.gender && (
              <span>
                Gender: <b style={{ color: "var(--text)" }}>{product.gender}</b>
              </span>
            )}
            {product.shoeType && (
              <span>
                Type: <b style={{ color: "var(--text)" }}>{product.shoeType}</b>
              </span>
            )}
          </div>
          <p className="mt-3 text-[17px] font-semibold" style={{ color: "var(--text)" }}>
            {formatTaka(product.sellingPrice, 2)}
            {showCost && product.discountPrice && (
              <span className="ml-2 text-[13px] font-normal line-through" style={{ color: "var(--text-faint)" }}>
                {formatTaka(product.costPrice, 2)}
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
          <Link
            href={`/products/${product.id}/edit`}
            className="focus-ring flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            <Pencil size={14} />
            Edit Product
          </Link>
          <button
            onClick={() => setStockModalOpen(true)}
            className="focus-ring flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            <Boxes size={14} />
            Update Stock
          </button>
          <button
            onClick={handlePrintBarcodes}
            className="focus-ring flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            <Printer size={14} />
            Print Barcode
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="focus-ring flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--red)" }}
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryTile label="Total Stock" value={`${stock} pairs`} />
        <SummaryTile label="Total Variants" value={String(product.variants.length)} />
        <SummaryTile label="Low Stock Variants" value={String(lowStockVariantCount(product))} accent="var(--brand)" />
        <SummaryTile label="Out of Stock Variants" value={String(outOfStockVariantCount(product))} accent="var(--red)" />
      </div>

      {product.description && (
        <div className="card p-5">
          <p className="mb-1 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            Description
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {product.description}
          </p>
        </div>
      )}

      {/* Variants & Stock */}
      <div className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            Variants &amp; Stock
          </p>
          <StockStatusBadge status={status} />
        </div>
        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full min-w-[680px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                <th className="px-3 py-2 font-medium">Color</th>
                <th className="px-3 py-2 font-medium">Size</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium">Barcode</th>
                {showCost && <th className="px-3 py-2 font-medium">Cost</th>}
                <th className="px-3 py-2 font-medium">Price</th>
                <th className="px-3 py-2 font-medium">Stock</th>
                <th className="px-3 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>
                    {v.color}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    {v.size}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    {v.sku}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                    {v.barcode || "—"}
                  </td>
                  {showCost && (
                    <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                      {formatTaka(v.cost, 2)}
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>
                    {formatTaka(v.price, 2)}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--text)" }}>
                    {v.stock}
                  </td>
                  <td className="px-3 py-2">
                    <StockStatusBadge status={stockStatusFor(v.stock)} />
                  </td>
                </tr>
              ))}
              {product.variants.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center" style={{ color: "var(--text-muted)" }}>
                    No variants yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StockMatrixModal product={product} open={stockModalOpen} onClose={() => setStockModalOpen(false)} />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete product"
        message={`Are you sure you want to delete "${product.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          deleteProduct(product.id);
          showToast("Product deleted");
          router.push("/products");
        }}
      />
    </>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="card p-4">
      <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        {label}
      </p>
      <p className="mt-1 text-[18px] font-semibold" style={{ color: accent ?? "var(--text)" }}>
        {value}
      </p>
    </div>
  );
}
