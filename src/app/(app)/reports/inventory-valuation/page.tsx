"use client";

import { useMemo, useState } from "react";
import { useOrders } from "@/lib/orders/store";
import { useProducts } from "@/lib/products/store";
import { deliveredDate, matchesProductFilters, productMeta } from "@/lib/reports/orders";
import { formatDay } from "@/lib/reports/dates";
import { num, sum, taka, ymd } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { RankBars } from "@/components/reports/charts";

interface ValueRow {
  variantId: string;
  product: string;
  variant: string;
  sku: string;
  category: string;
  qty: number;
  unitCost: number;
  value: number;
  lastSold: Date | null;
  dead: boolean;
}

const DAY_MS = 86_400_000;

export default function InventoryValuationReportPage() {
  const state = useReportFilters("order_created");
  const f = state.applied;
  const { products, hydrated } = useProducts();
  const { orders, hydrated: ordersReady } = useOrders();
  const [deadDays, setDeadDays] = useState(60);
  const [deadOnly, setDeadOnly] = useState(false);
  const [now] = useState(() => Date.now());

  const all = useMemo<ValueRow[]>(() => {
    const meta = productMeta(products);
    const lastSold = new Map<string, Date>();
    for (const o of orders) {
      const d = deliveredDate(o);
      if (!d) continue;
      for (const i of o.items) {
        const cur = lastSold.get(i.variantId);
        if (!cur || d > cur) lastSold.set(i.variantId, d);
      }
    }
    const cutoff = now - Math.max(1, deadDays) * DAY_MS;
    const out: ValueRow[] = [];
    for (const p of products) {
      for (const v of p.variants) {
        if (v.stock <= 0 || !matchesProductFilters({ productId: p.id, sku: v.sku }, f, meta)) continue;
        const sold = lastSold.get(v.id) ?? null;
        out.push({
          variantId: v.id,
          product: p.name,
          variant: `${v.color} / ${v.size}`,
          sku: v.sku,
          category: p.category || "Uncategorized",
          qty: v.stock,
          unitCost: v.cost,
          value: v.stock * v.cost,
          lastSold: sold,
          dead: !sold || sold.getTime() < cutoff,
        });
      }
    }
    return out.sort((a, b) => b.value - a.value);
  }, [products, orders, f, deadDays, now]);

  const rows = useMemo(() => all.filter((r) => !deadOnly || r.dead), [all, deadOnly]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) m.set(r.category, (m.get(r.category) ?? 0) + r.value);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value: Math.round(value) }));
  }, [all]);

  if (!hydrated || !ordersReady) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const dead = all.filter((r) => r.dead);

  const columns: Column<ValueRow>[] = [
    { key: "sku", header: "SKU", value: (r) => r.sku, total: () => "Total" },
    { key: "product", header: "Product", value: (r) => r.product },
    { key: "variant", header: "Variant (color/size)", value: (r) => r.variant },
    { key: "qty", header: "Qty", align: "right", value: (r) => r.qty, total: (rs) => num(sum(rs, (r) => r.qty)) },
    { key: "cost", header: "Unit Cost", align: "right", value: (r) => r.unitCost, cell: (r) => taka(r.unitCost) },
    { key: "value", header: "Total Value", align: "right", value: (r) => r.value, cell: (r) => taka(r.value), total: (rs) => taka(sum(rs, (r) => r.value)) },
    { key: "last", header: "Last Sold Date", value: (r) => ymd(r.lastSold), cell: (r) => (r.lastSold ? formatDay(r.lastSold) : "Never sold") },
    {
      key: "dead",
      header: "Dead Stock",
      value: (r) => (r.dead ? "Yes" : "No"),
      cell: (r) => (r.dead ? <span style={{ color: "#b45309" }}>Yes</span> : <span style={{ color: "var(--text-faint)" }}>No</span>),
    },
    { key: "category", header: "Category", hidden: true, value: (r) => r.category },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Inventory Valuation" description="What your stock on hand is worth at cost." meta={`As of ${new Date().toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`} />
      <FilterBar
        state={state}
        product
        extra={
          <>
            <label className="block min-w-0">
              <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>
                Dead stock after (days)
              </span>
              <input type="number" min={1} value={deadDays} onChange={(e) => setDeadDays(Number(e.target.value))} className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} />
            </label>
            <label className="flex items-end gap-2 pb-2 text-[13px]" style={{ color: "var(--text)" }}>
              <input type="checkbox" checked={deadOnly} onChange={(e) => setDeadOnly(e.target.checked)} />
              Dead stock only
            </label>
          </>
        }
      />
      <RuleNote>Value = on-hand quantity × unit cost (reserved units still count, they&apos;re still yours). Dead stock has units on hand but no delivered sale in the last {deadDays} days.</RuleNote>

      <KpiGrid
        items={[
          { label: "Total inventory qty", value: num(sum(all, (r) => r.qty)) },
          { label: "Total inventory value", value: taka(sum(all, (r) => r.value)), tone: "brand", sub: "At cost" },
          { label: "Dead stock qty", value: num(sum(dead, (r) => r.qty)), tone: dead.length ? "warn" : "neutral", sub: `${num(dead.length)} variants` },
          { label: "Dead stock value", value: taka(sum(dead, (r) => r.value)), tone: dead.length ? "warn" : "neutral" },
        ]}
      />

      <Panel title="Value by category" subtitle="Stock on hand at cost">
        <RankBars rows={byCategory.slice(0, 8)} />
      </Panel>

      <DataTable exportName="inventory-valuation" title="Stock value by variant" columns={columns} rows={rows} rowKey={(r) => r.variantId} pageSize={30} />
    </div>
  );
}
