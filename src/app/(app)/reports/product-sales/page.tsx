"use client";

import { useMemo } from "react";
import { useOrders } from "@/lib/orders/store";
import { useProducts } from "@/lib/products/store";
import { useReturns } from "@/lib/returns/store";
import { filterOrders, matchesProductFilters, productMeta } from "@/lib/reports/orders";
import { inRange, type DateTypeKey } from "@/lib/reports/dates";
import { num, sum, taka } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { RankBars } from "@/components/reports/charts";

const DATE_TYPES: DateTypeKey[] = ["delivered", "order_created", "final_status"];

interface VariantSales {
  variantId: string;
  productId: string;
  product: string;
  variant: string;
  sku: string;
  category: string;
  brand: string;
  qty: number;
  revenue: number;
  returned: number;
}

export default function ProductSalesReportPage() {
  const state = useReportFilters("delivered");
  const f = state.applied;
  const { orders, hydrated } = useOrders();
  const { products, hydrated: productsReady } = useProducts();
  const { returns, hydrated: returnsReady } = useReturns();

  const rows = useMemo<VariantSales[]>(() => {
    const meta = productMeta(products);
    const map = new Map<string, VariantSales>();
    const get = (item: { variantId: string; productId: string; productName: string; color: string; size: string; sku: string }) => {
      let row = map.get(item.variantId);
      if (!row) {
        const m = meta.get(item.productId);
        row = { variantId: item.variantId, productId: item.productId, product: item.productName, variant: `${item.color} / ${item.size}`, sku: item.sku, category: m?.category ?? "—", brand: m?.brand ?? "—", qty: 0, revenue: 0, returned: 0 };
        map.set(item.variantId, row);
      }
      return row;
    };

    for (const o of filterOrders(orders, f, { statuses: ["delivered"] })) {
      for (const i of o.items) {
        if (!matchesProductFilters(i, f, meta)) continue;
        const row = get(i);
        row.qty += i.qty;
        row.revenue += i.price * i.qty - i.discount;
      }
    }

    // Customer returns that physically came back inside the same period.
    for (const r of returns) {
      if (r.type !== "customer" || !r.returnReceived || !inRange(r.returnReceivedAt ? new Date(r.returnReceivedAt) : null, f.from, f.to)) continue;
      for (const i of r.items) {
        if (!matchesProductFilters(i, f, meta)) continue;
        get(i).returned += i.qty;
      }
    }
    return [...map.values()].filter((r) => r.qty > 0 || r.returned > 0).sort((a, b) => b.qty - a.qty);
  }, [orders, products, returns, f]);

  const topProducts = useMemo(() => {
    const m = new Map<string, { label: string; value: number }>();
    for (const r of rows) m.set(r.productId, { label: r.product, value: (m.get(r.productId)?.value ?? 0) + r.revenue });
    return [...m.values()].sort((a, b) => b.value - a.value).slice(0, 6);
  }, [rows]);

  if (!hydrated || !productsReady || !returnsReady) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const qty = sum(rows, (r) => r.qty);
  const revenue = sum(rows, (r) => r.revenue);
  const returned = sum(rows, (r) => r.returned);

  const columns: Column<VariantSales>[] = [
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
      <FilterBar state={state} dateTypes={DATE_TYPES} product />
      <RuleNote>Only Delivered orders count as sold. Return Qty is customer returns received in the same period; Net Sold Qty = sold − returned.</RuleNote>

      <KpiGrid
        items={[
          { label: "Total qty sold", value: num(qty), tone: "brand" },
          { label: "Total revenue", value: taka(revenue), tone: "good" },
          { label: "Return qty", value: num(returned), tone: returned ? "warn" : "neutral" },
          { label: "Net sold qty", value: num(qty - returned) },
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
