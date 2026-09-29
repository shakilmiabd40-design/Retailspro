import type { ProductStatus, StockStatus } from "@/lib/products/types";

const PRODUCT_STATUS_STYLES: Record<ProductStatus, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "var(--green)", bg: "var(--green-soft)" },
  inactive: { label: "Inactive", color: "var(--text-muted)", bg: "var(--surface-2)" },
};

const STOCK_STATUS_STYLES: Record<StockStatus, { label: string; color: string; bg: string }> = {
  "in-stock": { label: "In Stock", color: "var(--green)", bg: "var(--green-soft)" },
  "low-stock": { label: "Low Stock", color: "var(--brand)", bg: "var(--brand-soft)" },
  "out-of-stock": { label: "Out of Stock", color: "var(--red)", bg: "var(--red-soft)" },
};

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const s = PRODUCT_STATUS_STYLES[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap"
      style={{ color: s.color, background: s.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

export function StockStatusBadge({ status }: { status: StockStatus }) {
  const s = STOCK_STATUS_STYLES[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap"
      style={{ color: s.color, background: s.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}
