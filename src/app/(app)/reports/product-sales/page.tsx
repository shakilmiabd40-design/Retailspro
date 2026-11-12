"use client";

import { useMemo } from "react";
import { PRODUCT_SALES_DATE_TYPES } from "@/lib/reports/orders";
import { num, sum, taka } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { useProductSalesReport } from "@/lib/reports/use-report";
import type { ProductSalesReportRow } from "@/lib/reports/types";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { RankBars } from "@/components/reports/charts";

export default function ProductSalesReportPage() {
  const state = useReportFilters("delivered");
  const f = state.applied;
  const { data, loading, error } = useProductSalesReport({
    from: f.from,
    to: f.to,
    dateType: f.dateType,
    category: f.category,
    brand: f.brand,
    productId: f.productId,
    sku: f.sku,
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const kpis = data?.kpis;

  const topProducts = useMemo(() => {
    const m = new Map<string, { label: string; value: number }>();
    for (const row of rows) m.set(row.productId, { label: row.product, value: (m.get(row.productId)?.value ?? 0) + row.revenue });
    return [...m.values()].sort((a, b) => b.value - a.value).slice(0, 6);
  }, [rows]);

  if (error) return <p className="rounded-xl border px-4 py-3 text-[13px]" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</p>;
  if (loading || !kpis) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const columns: Column<ProductSalesReportRow>[] = [
    { key: "product", header: "Product", value: (r) => r.product, total: () => "Total" },
    { key: "variant", header: "Variant (color/size)", value: (r) => r.variant },
    { key: "sku", header: "SKU", value: (r) => r.sku },
    { key: "qty", header: "Qty Sold", align: "right", value: (r) => r.qty, total: (rs) => num(sum(rs, (r) => r.qty)) },
    { key: "revenue", header: "Revenue", align: "right", value: (r) => r.revenue, cell: (r) => taka(r.revenue), total: (rs) => taka(sum(rs, (r) => r.revenue)) },
    { key: "avg", header: "Avg Selling Price", align: "right", value: (r) => (r.qty ? Math.round((r.revenue / r.qty) * 100) / 100 : null), cell: (r) => (r.qty ? taka(r.revenue / r.qty) : "—") },
    { key: "returned", header: "Return Qty", align: "right", value: (r) => r.returned, total: (rs) => num(sum(rs, (r) => r.returned)) },
    { key: "net", header: "Net Sold Qty", align: "right", value: (r) => r.qty - r.returned, total: (rs) => num(sum(rs, (r) => r.qty - r.returned)) },
    { key: "category", header: "Category", hidden: true, value: (r) => r.category },
    { key: "brand", header: "Brand", hidden: true, value: (r) => r.brand },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Product Sales Report" description="What sold, by product and by shoe variant." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={PRODUCT_SALES_DATE_TYPES} product />
      <RuleNote>Only Delivered orders count as sold. Return Qty is customer returns received in the same period; Net Sold Qty = sold − returned. Report days use the Asia/Dhaka business day.</RuleNote>

      <KpiGrid
        items={[
          { label: "Total qty sold", value: num(kpis.qty), tone: "brand" },
          { label: "Total revenue", value: taka(kpis.revenue), tone: "good" },
          { label: "Return qty", value: num(kpis.returned), tone: kpis.returned ? "warn" : "neutral" },
          { label: "Net sold qty", value: num(kpis.net) },
        ]}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Top variants" subtitle="By quantity sold">
          <RankBars rows={rows.slice(0, 6).map((r) => ({ label: `${r.product} · ${r.variant}`, value: r.qty, sub: taka(r.revenue) }))} unit=" pcs" />
        </Panel>
        <Panel title="Top products" subtitle="By revenue">
          <RankBars rows={topProducts.map((p) => ({ label: p.label, value: Math.round(p.value) }))} color="#22c55e" />
        </Panel>
      </div>

      <DataTable exportName="product-sales" title="Variant-wise sales" columns={columns} rows={rows} rowKey={(r) => r.variantId} />
    </div>
  );
}
