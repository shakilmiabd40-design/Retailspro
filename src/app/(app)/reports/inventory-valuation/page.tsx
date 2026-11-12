"use client";

import { useMemo, useState } from "react";
import { formatDay, parseDate } from "@/lib/reports/dates";
import { num, sum, taka } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { useInventoryValueReport } from "@/lib/reports/use-report";
import type { InventoryValueRow } from "@/lib/reports/types";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { RankBars } from "@/components/reports/charts";

const DATE_TYPES: ("order_created")[] = ["order_created"];

export default function InventoryValuationReportPage() {
  const state = useReportFilters("order_created");
  const f = state.applied;
  const [deadDays, setDeadDays] = useState(60);
  const [deadOnly, setDeadOnly] = useState(false);

  const { data, loading, error } = useInventoryValueReport({
    category: f.category,
    brand: f.brand,
    productId: f.productId,
    sku: f.sku,
    deadDays: String(deadDays),
  });

  const all = useMemo(() => data?.rows ?? [], [data]);
  const kpis = data?.kpis;
  const canSeeCost = data?.canSeeCost ?? false;

  const rows = useMemo(() => all.filter((r) => !deadOnly || r.dead), [all, deadOnly]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) m.set(r.category, (m.get(r.category) ?? 0) + (r.value ?? 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value: Math.round(value) }));
  }, [all]);

  if (error) return <p className="rounded-xl border px-4 py-3 text-[13px]" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</p>;
  if (loading || !kpis) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const dead = all.filter((r) => r.dead);

  const columns: Column<InventoryValueRow>[] = [
    { key: "sku", header: "SKU", value: (r) => r.sku, total: () => "Total" },
    { key: "product", header: "Product", value: (r) => r.product },
    { key: "variant", header: "Variant (color/size)", value: (r) => r.variant },
    { key: "qty", header: "Qty", align: "right", value: (r) => r.qty, total: (rs) => num(sum(rs, (r) => r.qty)) },
    { key: "cost", header: "Unit Cost", align: "right", value: (r) => r.unitCost, cell: (r) => (r.unitCost === null ? "—" : taka(r.unitCost)) },
    { key: "value", header: "Total Value", align: "right", value: (r) => r.value, cell: (r) => (r.value === null ? "—" : taka(r.value)), total: (rs) => (kpis.totalValue === null ? "—" : taka(sum(rs, (r) => r.value ?? 0))) },
    { key: "last", header: "Last Sold Date", value: (r) => r.lastSoldDay ?? "", cell: (r) => (r.lastSoldDay ? formatDay(parseDate(r.lastSoldDay)) : "Never sold") },
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
        dateTypes={DATE_TYPES}
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
          { label: "Total inventory qty", value: num(kpis.totalQty) },
          { label: "Total inventory value", value: kpis.totalValue === null ? "—" : taka(kpis.totalValue), tone: "brand", sub: canSeeCost ? "At cost" : "Cost hidden" },
          { label: "Dead stock qty", value: num(kpis.deadQty), tone: dead.length ? "warn" : "neutral", sub: `${num(dead.length)} variants` },
          { label: "Dead stock value", value: kpis.deadValue === null ? "—" : taka(kpis.deadValue), tone: dead.length ? "warn" : "neutral" },
        ]}
      />

      <Panel title="Value by category" subtitle="Stock on hand at cost">
        <RankBars rows={byCategory.slice(0, 8)} />
      </Panel>

      <DataTable exportName="inventory-valuation" title="Stock value by variant" columns={columns} rows={rows} rowKey={(r) => r.variantId} pageSize={30} />
    </div>
  );
}
