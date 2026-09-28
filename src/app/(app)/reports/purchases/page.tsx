"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePurchaseOrders } from "@/lib/purchase-orders/store";
import { useProducts } from "@/lib/products/store";
import { useSuppliers } from "@/lib/suppliers/store";
import { PO_STATUS_LABELS } from "@/lib/purchase-orders/utils";
import { buildPurchases, poDateOf, type GrnLine, type PoSummary } from "@/lib/reports/purchases";
import { hasProductFilter, productMeta } from "@/lib/reports/orders";
import { formatDay, type DateTypeKey } from "@/lib/reports/dates";
import { trendBuckets } from "@/lib/reports/aggregate";
import { num, sum, taka, ymd } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { COLORS, TrendChart } from "@/components/reports/charts";

const DATE_TYPES: DateTypeKey[] = ["grn", "po_created"];

export default function PurchaseReportPage() {
  const state = useReportFilters("grn", "daily");
  const f = state.applied;
  const { purchaseOrders, hydrated } = usePurchaseOrders();
  const { products, hydrated: productsReady } = useProducts();
  const { suppliers } = useSuppliers();

  const supplierName = useMemo(() => new Map(suppliers.map((s) => [s.id, s.name])), [suppliers]);
  const filtered = hasProductFilter(f);
  const grnMode = f.dateType === "grn";

  const { summaries, grn } = useMemo(() => buildPurchases(purchaseOrders, f, f.dateType, productMeta(products), filtered), [purchaseOrders, products, f, filtered]);

  const trend = useMemo(
    () =>
      grnMode
        ? trendBuckets(grn, (l) => l.date, f, { value: (l) => l.value })
        : trendBuckets(summaries, (s) => poDateOf(s.po), f, { value: (s) => s.cost }),
    [grn, summaries, f, grnMode]
  );

  if (!hydrated || !productsReady) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const supplierOf = (s: PoSummary) => supplierName.get(s.po.supplierId) ?? "Unknown supplier";

  const poColumns: Column<PoSummary>[] = [
    {
      key: "po",
      header: "PO Number",
      value: (s) => s.po.poNumber,
      cell: (s) => (
        <Link href={`/purchase-orders/${s.po.id}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--brand)" }}>
          {s.po.poNumber}
        </Link>
      ),
      total: () => "Total",
    },
    { key: "supplier", header: "Supplier", value: supplierOf },
    { key: "date", header: "PO Date", value: (s) => ymd(poDateOf(s.po)), cell: (s) => formatDay(poDateOf(s.po)) },
    { key: "status", header: "Status", value: (s) => PO_STATUS_LABELS[s.po.status] },
    { key: "ordered", header: "Qty Ordered", align: "right", value: (s) => s.ordered, total: (r) => num(sum(r, (s) => s.ordered)) },
    { key: "received", header: "Qty Received", align: "right", value: (s) => s.received, total: (r) => num(sum(r, (s) => s.received)) },
    { key: "pending", header: "Pending Qty", align: "right", value: (s) => s.pending, total: (r) => num(sum(r, (s) => s.pending)) },
    { key: "cost", header: "Purchase Cost", align: "right", value: (s) => s.cost, cell: (s) => taka(s.cost), total: (r) => taka(sum(r, (s) => s.cost)) },
    { key: "pv", header: "Pending Value", align: "right", value: (s) => s.pendingValue, cell: (s) => taka(s.pendingValue), total: (r) => taka(sum(r, (s) => s.pendingValue)) },
  ];

  const grnColumns: Column<GrnLine>[] = [
    { key: "date", header: "Received Date", value: (l) => ymd(l.date), cell: (l) => formatDay(l.date), total: () => "Total" },
    {
      key: "po",
      header: "PO Number",
      value: (l) => l.po.poNumber,
      cell: (l) => (
        <Link href={`/purchase-orders/${l.po.id}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--brand)" }}>
          {l.po.poNumber}
        </Link>
      ),
    },
    { key: "supplier", header: "Supplier", value: (l) => supplierName.get(l.po.supplierId) ?? "Unknown supplier" },
    { key: "product", header: "Product", value: (l) => l.item.productName },
    { key: "variant", header: "Variant", value: (l) => `${l.item.color} / ${l.item.size}` },
    { key: "sku", header: "SKU", value: (l) => l.item.sku },
    { key: "qty", header: "Qty Received", align: "right", value: (l) => l.qty, total: (r) => num(sum(r, (l) => l.qty)) },
    { key: "unit", header: "Unit Cost", align: "right", value: (l) => l.unitCost, cell: (l) => taka(l.unitCost) },
    { key: "value", header: "Value", align: "right", value: (l) => l.value, cell: (l) => taka(l.value), total: (r) => taka(sum(r, (l) => l.value)) },
  ];

  const pendingValue = sum(summaries, (s) => s.pendingValue);

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Purchase Report" description="Purchase orders and what has actually arrived." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={DATE_TYPES} supplier product groupBy />
      <RuleNote>
        {grnMode ? "GRN date: purchase orders that received stock in this period; the receiving table only shows receipts in the period." : "PO created date: purchase orders created in this period, with every receipt against them."} Draft and cancelled purchase orders are left out.
        {filtered ? " Shipping and discount are left out while product filters are on." : ""}
      </RuleNote>

      <KpiGrid
        items={[
          { label: "Purchase orders", value: num(summaries.length) },
          { label: "Qty ordered", value: num(sum(summaries, (s) => s.ordered)) },
          { label: "Qty received", value: num(sum(summaries, (s) => s.received)), tone: "good", sub: grnMode ? `${num(sum(summaries, (s) => s.receivedInPeriodQty))} in this period` : undefined },
          { label: "Total purchase cost", value: taka(sum(summaries, (s) => s.cost)), tone: "brand" },
          { label: "Pending receiving qty", value: num(sum(summaries, (s) => s.pending)), tone: "warn" },
          { label: "Pending receiving value", value: taka(pendingValue), tone: "warn" },
        ]}
      />

      <Panel title={grnMode ? "Stock received" : "Purchase orders created"} subtitle="Value at cost">
        <TrendChart data={trend} series={[{ key: "value", label: grnMode ? "Received value" : "PO value", color: COLORS.brand }]} format={taka} />
      </Panel>

      <DataTable exportName="purchase-orders" title="Purchase order summary" columns={poColumns} rows={summaries} rowKey={(s) => s.po.id} />
      <DataTable exportName="purchase-receiving" title="Receiving (GRN)" columns={grnColumns} rows={grn} rowKey={(l) => `${l.po.id}-${l.key}`} emptyText="No stock receipts for these filters." />
    </div>
  );
}
