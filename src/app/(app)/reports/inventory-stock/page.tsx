"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useProducts } from "@/lib/products/store";
import { useNotifications } from "@/lib/notifications/store";
import { levelUpperBound, STATUS_LABELS } from "@/lib/notifications/engine";
import { matchesProductFilters, productMeta } from "@/lib/reports/orders";
import { num } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { InventoryStatusBadge } from "@/components/notifications/badges";
import type { InventoryStatus } from "@/lib/notifications/types";

type StockLabel = "In Stock" | "Low Stock" | "Out of Stock";

interface StockRow {
  variantId: string;
  productId: string;
  product: string;
  variant: string;
  sku: string;
  category: string;
  brand: string;
  active: boolean;
  available: number;
  reserved: number;
  onHand: number;
  reorder: number;
  label: StockLabel;
  alert: InventoryStatus | null;
}

const LABEL_COLOR: Record<StockLabel, { color: string; bg: string }> = {
  "In Stock": { color: "var(--green)", bg: "var(--green-soft)" },
  "Low Stock": { color: "#b45309", bg: "rgba(180, 83, 9, 0.14)" },
  "Out of Stock": { color: "var(--red)", bg: "var(--red-soft)" },
};

export default function InventoryStockReportPage() {
  const state = useReportFilters("order_created");
  const f = state.applied;
  const { products, hydrated } = useProducts();
  const { board, settings, hydrated: notifReady } = useNotifications();
  const [stockFilter, setStockFilter] = useState<StockLabel | "all">("all");

  const lowBand = levelUpperBound("monitor", settings);

  const all = useMemo<StockRow[]>(() => {
    const meta = productMeta(products);
    const alertOf = new Map(board.map((b) => [b.variantId, b.status]));
    const out: StockRow[] = [];
    for (const p of products) {
      for (const v of p.variants) {
        if (!matchesProductFilters({ productId: p.id, sku: v.sku }, f, meta)) continue;
        const available = Math.max(0, v.stock - (v.reserved ?? 0));
        out.push({
          variantId: v.id,
          productId: p.id,
          product: p.name,
          variant: `${v.color} / ${v.size}`,
          sku: v.sku,
          category: p.category,
          brand: p.brand,
          active: p.status === "active" && v.status === "active",
          available,
          reserved: v.reserved ?? 0,
          onHand: v.stock,
          reorder: settings.reorderPoint,
          label: available <= 0 ? "Out of Stock" : available <= lowBand ? "Low Stock" : "In Stock",
          alert: alertOf.get(v.id) ?? null,
        });
      }
    }
    return out.sort((a, b) => a.available - b.available || a.product.localeCompare(b.product));
  }, [products, board, settings, lowBand, f]);

  const rows = useMemo(() => all.filter((r) => stockFilter === "all" || r.label === stockFilter), [all, stockFilter]);

  if (!hydrated || !notifReady) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const count = (l: StockLabel) => all.filter((r) => r.label === l).length;

  const columns: Column<StockRow>[] = [
    {
      key: "product",
      header: "Product",
      value: (r) => r.product,
      cell: (r) => (
        <Link href={`/products/${r.productId}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--text)" }}>
          {r.product}
        </Link>
      ),
    },
    { key: "variant", header: "Variant (color/size)", value: (r) => r.variant },
    { key: "sku", header: "SKU", value: (r) => r.sku },
    { key: "available", header: "Available Stock", align: "right", value: (r) => r.available },
    { key: "reserved", header: "Reserved Stock", align: "right", value: (r) => r.reserved },
    { key: "reorder", header: "Reorder Level", align: "right", value: (r) => r.reorder },
    {
      key: "status",
      header: "Stock Status",
      value: (r) => r.label,
      cell: (r) => (
        <span className="inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-medium" style={{ color: LABEL_COLOR[r.label].color, background: LABEL_COLOR[r.label].bg }}>
          {r.label}
        </span>
      ),
    },
    { key: "onhand", header: "On Hand", align: "right", hidden: true, value: (r) => r.onHand },
    { key: "alert", header: "Alert Status", hidden: true, value: (r) => (r.alert ? STATUS_LABELS[r.alert] : "—"), cell: (r) => (r.alert ? <InventoryStatusBadge status={r.alert} /> : "—") },
    { key: "category", header: "Category", hidden: true, value: (r) => r.category },
    { key: "brand", header: "Brand", hidden: true, value: (r) => r.brand },
    { key: "active", header: "Active", hidden: true, value: (r) => (r.active ? "Yes" : "No") },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Inventory Stock Report" description="Current stock, as of right now. This report isn't date-based." meta={`As of ${new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`} />
      <FilterBar
        state={state}
        product
        extra={
          <label className="block min-w-0">
            <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>
              Stock status
            </span>
            <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value as StockLabel | "all")} className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
              <option value="all">All</option>
              <option value="In Stock">In Stock</option>
              <option value="Low Stock">Low Stock</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>
          </label>
        }
      />
      <RuleNote>
        Available = on hand − reserved for open orders. Low Stock is {lowBand} or fewer available; Out of Stock is 0. Reorder Level comes from your notification thresholds.
      </RuleNote>

      <KpiGrid
        items={[
          { label: "Total variants", value: num(all.length) },
          { label: "In stock", value: num(count("In Stock")), tone: "good" },
          { label: "Low stock", value: num(count("Low Stock")), tone: "warn" },
          { label: "Out of stock", value: num(count("Out of Stock")), tone: count("Out of Stock") ? "bad" : "neutral" },
        ]}
      />

      <DataTable exportName="inventory-stock" title="Stock by variant" columns={columns} rows={rows} rowKey={(r) => r.variantId} pageSize={30} />
    </div>
  );
}
