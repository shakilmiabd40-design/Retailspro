"use client";

import { useMemo } from "react";
import Link from "next/link";
import { PO_STATUS_LABELS } from "@/lib/purchase-orders/utils";
import { formatDay, parseDate } from "@/lib/reports/dates";
import { trendBuckets } from "@/lib/reports/aggregate";
import { num, sum, taka } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { usePurchaseReport } from "@/lib/reports/use-report";
import type { PurchaseGrnRow, PurchaseReportRow } from "@/lib/reports/types";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { COLORS, TrendChart } from "@/components/reports/charts";

const DATE_TYPES: ("grn" | "po_created")[] = ["grn", "po_created"];

export default function PurchaseReportPage() {
  const state = useReportFilters("grn", "daily");
  const f = state.applied;
  const { data, loading, error } = usePurchaseReport({
    from: f.from,
    to: f.to,
    dateType: f.dateType,
    supplierId: f.supplierId,
    category: f.category,
    brand: f.brand,
    productId: f.productId,
    sku: f.sku,
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const grn = useMemo(() => data?.grn ?? [], [data]);
  const kpis = data?.kpis;

  const grnMode = f.dateType === "grn";
  const trend = useMemo(
    () =>
      grnMode
        ? trendBuckets(grn, (row) => parseDate(row.reportDay), f, { value: (row) => row.value })
        : trendBuckets(rows, (row) => parseDate(row.reportDay), f, { value: (row) => row.cost }),
    [grn, rows, f, grnMode]
  );

  if (error) return <p className="rounded-xl border px-4 py-3 text-[13px]" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</p>;
  if (loading || !kpis) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const poColumns: Column<PurchaseReportRow>[] = [
    {
      key: "po",
      header: "PO Number",
      value: (row) => row.poNumber,
      cell: (row) => (
        <Link href={`/purchase-orders/${row.poId}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--brand)" }}>
          {row.poNumber}
        </Link>
      ),
      total: () => "Total",
    },
    { key: "supplier", header: "Supplier", value: (row) => row.supplierName },
    { key: "date", header: "PO Date", value: (row) => row.reportDay, cell: (row) => formatDay(parseDate(row.reportDay)) },
    { key: "status", header: "Status", value: (row) => PO_STATUS_LABELS[row.status as keyof typeof PO_STATUS_LABELS] ?? row.status },
    { key: "ordered", header: "Qty Ordered", align: "right", value: (row) => row.ordered, total: (r) => num(sum(r, (row) => row.ordered)) },
    { key: "received", header: "Qty Received", align: "right", value: (row) => row.received, total: (r) => num(sum(r, (row) => row.received)) },
    { key: "pending", header: "Pending Qty", align: "right", value: (row) => row.pending, total: (r) => num(sum(r, (row) => row.pending)) },
    { key: "cost", header: "Purchase Cost", align: "right", value: (row) => row.cost, cell: (row) => taka(row.cost), total: (r) => taka(sum(r, (row) => row.cost)) },
    { key: "pv", header: "Pending Value", align: "right", value: (row) => row.pendingValue, cell: (row) => taka(row.pendingValue), total: (r) => taka(sum(r, (row) => row.pendingValue)) },
  ];

  const grnColumns: Column<PurchaseGrnRow>[] = [
    { key: "date", header: "Received Date", value: (row) => row.reportDay, cell: (row) => formatDay(parseDate(row.reportDay)), total: () => "Total" },
    {
      key: "po",
      header: "PO Number",
      value: (row) => row.poNumber,
      cell: (row) => (
        <Link href={`/purchase-orders/${row.poId}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--brand)" }}>
          {row.poNumber}
        </Link>
      ),
    },
    { key: "supplier", header: "Supplier", value: (row) => row.supplierName },
    { key: "product", header: "Product", value: (row) => row.productName },
    { key: "variant", header: "Variant", value: (row) => `${row.color} / ${row.size}` },
    { key: "sku", header: "SKU", value: (row) => row.sku },
    { key: "qty", header: "Qty Received", align: "right", value: (row) => row.qty, total: (r) => num(sum(r, (row) => row.qty)) },
    { key: "unit", header: "Unit Cost", align: "right", value: (row) => row.unitCost, cell: (row) => taka(row.unitCost) },
    { key: "value", header: "Value", align: "right", value: (row) => row.value, cell: (row) => taka(row.value), total: (r) => taka(sum(r, (row) => row.value)) },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Purchase Report" description="Purchase orders and what has actually arrived." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={DATE_TYPES} supplier product groupBy />
      <RuleNote>
        {grnMode ? "GRN date: purchase orders that received stock in this period; the receiving table only shows receipts in the period." : "PO created date: purchase orders created in this period, with every receipt against them."} Draft and cancelled purchase orders are left out.
        {f.category !== "all" || f.brand !== "all" || f.productId !== "all" || f.sku.trim() ? " Shipping and discount are left out while product filters are on." : ""} Report days use the Asia/Dhaka business day.
      </RuleNote>

      <KpiGrid
        items={[
          { label: "Purchase orders", value: num(kpis.purchaseOrders) },
          { label: "Qty ordered", value: num(kpis.qtyOrdered) },
          { label: "Qty received", value: num(kpis.qtyReceived), tone: "good", sub: grnMode ? `${num(kpis.qtyReceivedInPeriod)} in this period` : undefined },
          { label: "Total purchase cost", value: taka(kpis.totalCost), tone: "brand" },
          { label: "Pending receiving qty", value: num(kpis.pendingQty), tone: "warn" },
          { label: "Pending receiving value", value: taka(kpis.pendingValue), tone: "warn" },
        ]}
      />

      <Panel title={grnMode ? "Stock received" : "Purchase orders created"} subtitle="Value at cost">
        <TrendChart data={trend} series={[{ key: "value", label: grnMode ? "Received value" : "PO value", color: COLORS.brand }]} format={taka} />
      </Panel>

      <DataTable exportName="purchase-orders" title="Purchase order summary" columns={poColumns} rows={rows} rowKey={(row) => row.poId} />
      <DataTable exportName="purchase-receiving" title="Receiving (GRN)" columns={grnColumns} rows={grn} rowKey={(row) => row.key} emptyText="No stock receipts for these filters." />
    </div>
  );
}
