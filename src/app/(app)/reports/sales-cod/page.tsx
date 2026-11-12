"use client";

import { useMemo } from "react";
import Link from "next/link";
import { formatDay, parseDate } from "@/lib/reports/dates";
import { SALES_COD_DATE_TYPES } from "@/lib/reports/orders";
import { trendBuckets } from "@/lib/reports/aggregate";
import { num, sum, taka } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { useSalesCodReport } from "@/lib/reports/use-report";
import type { SalesCodReportRow } from "@/lib/reports/types";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { COLORS, TrendChart } from "@/components/reports/charts";

export default function SalesCodReportPage() {
  const state = useReportFilters("delivered", "daily");
  const f = state.applied;
  const { data, loading, error } = useSalesCodReport({
    from: f.from,
    to: f.to,
    dateType: f.dateType,
    courier: f.courier,
    settlementStatus: f.settlementStatus,
    status: f.status,
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const kpis = data?.kpis;

  const trend = useMemo(
    () =>
      trendBuckets(rows, (row) => parseDate(row.reportDay), f, {
        revenue: (row) => row.revenue,
        collected: (row) => row.collected,
      }),
    [rows, f]
  );

  if (error) return <p className="rounded-xl border px-4 py-3 text-[13px]" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</p>;
  if (loading || !kpis) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const columns: Column<SalesCodReportRow>[] = [
    {
      key: "order",
      header: "Order ID",
      value: (row) => row.orderNumber,
      cell: (row) => (
        <Link href={`/orders/${row.orderId}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--brand)" }}>
          #{row.orderNumber}
        </Link>
      ),
      total: () => "Total",
    },
    {
      key: "date",
      header: "Delivered Date",
      value: (row) => row.deliveredDay,
      cell: (row) => formatDay(row.deliveredDay ? parseDate(row.deliveredDay) : null),
    },
    { key: "customer", header: "Customer", value: (row) => row.customerName },
    { key: "expected", header: "Expected COD", align: "right", value: (row) => row.expectedCod, cell: (row) => taka(row.expectedCod), total: (r) => taka(sum(r, (row) => row.expectedCod)) },
    { key: "collected", header: "Collected Amount", align: "right", value: (row) => row.collected, cell: (row) => taka(row.collected), total: (r) => taka(sum(r, (row) => row.collected)) },
    { key: "courier", header: "Courier Company", value: (row) => row.courier || "—" },
    { key: "cost", header: "Courier Cost", align: "right", value: (row) => row.courierCost, cell: (row) => taka(row.courierCost), total: (r) => taka(sum(r, (row) => row.courierCost)) },
    { key: "settlement", header: "Settlement Status", value: (row) => row.settlementStatus || "—" },
    { key: "sales", header: "Product Sales", align: "right", value: (row) => row.productSales, cell: (row) => taka(row.productSales), total: (r) => taka(sum(r, (row) => row.productSales)) },
    { key: "revenue", header: "Net Revenue", align: "right", value: (row) => row.revenue, cell: (row) => taka(row.revenue), total: (r) => taka(sum(r, (row) => row.revenue)) },
    { key: "charge", header: "Delivery Charge", align: "right", hidden: true, value: (row) => row.deliveryCharge, cell: (row) => taka(row.deliveryCharge), total: (r) => taka(sum(r, (row) => row.deliveryCharge)) },
    { key: "diff", header: "Difference", align: "right", hidden: true, value: (row) => row.difference, cell: (row) => taka(row.difference), total: (r) => taka(sum(r, (row) => row.difference)) },
    { key: "phone", header: "Phone", hidden: true, value: (row) => row.phone },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Sales & COD" description="Delivered orders only: net revenue, expected COD and what was actually collected." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={SALES_COD_DATE_TYPES} courier settlement groupBy />
      <RuleNote>Only Delivered orders count as sales. Net revenue = product sales (after discounts) + delivery charge billed to the customer − courier cost (delivery + return + other). Cancelled, Refuse Return and Partial Delivered orders are left out. Report days use the Asia/Dhaka business day.</RuleNote>

      <KpiGrid
        items={[
          { label: "Delivered orders", value: num(kpis.deliveredOrders) },
          { label: "Product sales", value: taka(kpis.productSales) },
          { label: "Gross revenue", value: taka(kpis.grossRevenue), sub: "Everything the customer paid: sales + delivery charge" },
          { label: "Courier & other cost", value: taka(kpis.courierCost), sub: "Paid to the courier: delivery + return + other" },
          { label: "Net revenue", value: taka(kpis.netRevenue), tone: "brand", sub: "Gross revenue − courier & other cost" },
          { label: "Delivery charge collected", value: taka(kpis.deliveryCharge) },
          { label: "Expected COD", value: taka(kpis.expectedCod) },
          { label: "Collected amount", value: taka(kpis.collected), tone: "good" },
          {
            label: "Difference (expected − collected)",
            value: taka(kpis.difference),
            tone: kpis.difference > 0 ? "bad" : "neutral",
            sub: kpis.difference > 0 ? "Collected less than expected" : undefined,
          },
        ]}
      />

      <Panel title="Revenue trend" subtitle={`Delivered orders by ${f.groupBy === "daily" ? "day" : f.groupBy === "weekly" ? "week" : "month"}`}>
        <TrendChart
          data={trend}
          series={[
            { key: "revenue", label: "Net revenue", color: COLORS.brand },
            { key: "collected", label: "Collected", color: COLORS.green },
          ]}
          format={taka}
        />
      </Panel>

      <DataTable exportName="sales-cod" title="Delivered orders" columns={columns} rows={rows} rowKey={(row) => row.orderId} />
    </div>
  );
}
