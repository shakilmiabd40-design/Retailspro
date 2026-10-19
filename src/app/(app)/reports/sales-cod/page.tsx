"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/orders/store";
import { useSettlements } from "@/lib/settlements/store";
import { collectedAmount, expectedCod, actualCourierCost, grossRevenue, productSales, salesRevenue } from "@/lib/orders/utils";
import { filterOrders, orderDateFor } from "@/lib/reports/orders";
import { formatDay, type DateTypeKey } from "@/lib/reports/dates";
import { trendBuckets } from "@/lib/reports/aggregate";
import { num, sum, taka, ymd } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import type { Order } from "@/lib/orders/types";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { COLORS, TrendChart } from "@/components/reports/charts";

const DATE_TYPES: DateTypeKey[] = ["delivered", "order_created", "dispatch", "final_status"];

export default function SalesCodReportPage() {
  const state = useReportFilters("delivered", "daily");
  const f = state.applied;
  const { orders, hydrated } = useOrders();
  const { rows: settlementRows, hydrated: settlementsReady } = useSettlements();

  const settlementOf = useMemo(() => new Map(settlementRows.map((r) => [r.order.id, r.status])), [settlementRows]);

  const rows = useMemo(
    () =>
      filterOrders(orders, f, { statuses: ["delivered"] })
        .filter((o) => f.settlementStatus === "all" || settlementOf.get(o.id) === f.settlementStatus)
        .sort((a, b) => (orderDateFor(b, f.dateType)?.getTime() ?? 0) - (orderDateFor(a, f.dateType)?.getTime() ?? 0)),
    [orders, f, settlementOf]
  );

  const trend = useMemo(
    () =>
      trendBuckets(rows, (o) => orderDateFor(o, f.dateType), f, {
        revenue: (o) => salesRevenue(o),
        collected: (o) => collectedAmount(o),
      }),
    [rows, f]
  );

  if (!hydrated || !settlementsReady) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const expected = sum(rows, expectedCod);
  const collected = sum(rows, collectedAmount);

  const columns: Column<Order>[] = [
    {
      key: "order",
      header: "Order ID",
      value: (o) => o.orderNumber,
      cell: (o) => (
        <Link href={`/orders/${o.id}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--brand)" }}>
          #{o.orderNumber}
        </Link>
      ),
      total: () => "Total",
    },
    { key: "date", header: "Delivered Date", value: (o) => ymd(orderDateFor(o, "delivered")), cell: (o) => formatDay(orderDateFor(o, "delivered")) },
    { key: "customer", header: "Customer", value: (o) => o.customerName },
    { key: "expected", header: "Expected COD", align: "right", value: (o) => expectedCod(o), cell: (o) => taka(expectedCod(o)), total: (r) => taka(sum(r, expectedCod)) },
    { key: "collected", header: "Collected Amount", align: "right", value: (o) => collectedAmount(o), cell: (o) => taka(collectedAmount(o)), total: (r) => taka(sum(r, collectedAmount)) },
    { key: "courier", header: "Courier Company", value: (o) => o.courier.company || "—" },
    { key: "cost", header: "Courier Cost", align: "right", value: (o) => actualCourierCost(o), cell: (o) => taka(actualCourierCost(o)), total: (r) => taka(sum(r, actualCourierCost)) },
    { key: "settlement", header: "Settlement Status", value: (o) => settlementOf.get(o.id) ?? "—" },
    { key: "sales", header: "Product Sales", align: "right", value: (o) => productSales(o), cell: (o) => taka(productSales(o)), total: (r) => taka(sum(r, productSales)) },
    { key: "revenue", header: "Net Revenue", align: "right", value: (o) => salesRevenue(o), cell: (o) => taka(salesRevenue(o)), total: (r) => taka(sum(r, salesRevenue)) },
    { key: "charge", header: "Delivery Charge", align: "right", hidden: true, value: (o) => o.deliveryCharge, cell: (o) => taka(o.deliveryCharge), total: (r) => taka(sum(r, (o) => o.deliveryCharge)) },
    { key: "diff", header: "Difference", align: "right", hidden: true, value: (o) => expectedCod(o) - collectedAmount(o), cell: (o) => taka(expectedCod(o) - collectedAmount(o)), total: (r) => taka(sum(r, (o) => expectedCod(o) - collectedAmount(o))) },
    { key: "phone", header: "Phone", hidden: true, value: (o) => o.phone },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Sales & COD" description="Delivered orders only: net revenue, expected COD and what was actually collected." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={DATE_TYPES} courier settlement groupBy />
      <RuleNote>Only Delivered orders count as sales. Net revenue = product sales (after discounts) + delivery charge billed to the customer − courier cost (delivery + return + other). Cancelled, Refuse Return and Partial Delivered orders are left out.</RuleNote>

      <KpiGrid
        items={[
          { label: "Delivered orders", value: num(rows.length) },
          { label: "Product sales", value: taka(sum(rows, productSales)) },
          { label: "Gross revenue", value: taka(sum(rows, grossRevenue)), sub: "Everything the customer paid: sales + delivery charge" },
          { label: "Courier & other cost", value: taka(sum(rows, actualCourierCost)), sub: "Paid to the courier: delivery + return + other" },
          { label: "Net revenue", value: taka(sum(rows, salesRevenue)), tone: "brand", sub: "Gross revenue − courier & other cost" },
          { label: "Delivery charge collected", value: taka(sum(rows, (o) => o.deliveryCharge)) },
          { label: "Expected COD", value: taka(expected) },
          { label: "Collected amount", value: taka(collected), tone: "good" },
          { label: "Difference (expected − collected)", value: taka(expected - collected), tone: expected - collected > 0 ? "bad" : "neutral", sub: expected - collected > 0 ? "Collected less than expected" : undefined },
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

      <DataTable exportName="sales-cod" title="Delivered orders" columns={columns} rows={rows} rowKey={(o) => o.id} />
    </div>
  );
}
