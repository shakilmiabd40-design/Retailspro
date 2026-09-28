"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/orders/store";
import { ORDER_STATUS_LABELS } from "@/lib/orders/utils";
import { ALL_ORDER_STATUSES, filterOrders, orderDateFor } from "@/lib/reports/orders";
import { formatDay, type DateTypeKey } from "@/lib/reports/dates";
import { trendBuckets } from "@/lib/reports/aggregate";
import { num, ymd } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import type { Order, OrderStatus } from "@/lib/orders/types";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader } from "@/components/reports/kpi";
import { DonutChart, STATUS_CHART_COLORS, TrendChart } from "@/components/reports/charts";
import { OrderStatusBadge } from "@/components/orders/status-badge";

const DATE_TYPES: DateTypeKey[] = ["order_created", "dispatch", "final_status"];

export default function OrderStatusReportPage() {
  const state = useReportFilters("order_created", "daily");
  const f = state.applied;
  const { orders, hydrated } = useOrders();

  // Counts and charts ignore the status filter so the whole distribution stays visible; the table honours it.
  const base = useMemo(() => filterOrders(orders, { ...f, status: "all" }), [orders, f]);
  const rows = useMemo(
    () => base.filter((o) => f.status === "all" || o.status === f.status).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [base, f.status]
  );

  const counts = useMemo(() => {
    const c = {} as Record<OrderStatus, number>;
    for (const s of ALL_ORDER_STATUSES) c[s] = 0;
    for (const o of base) c[o.status] += 1;
    return c;
  }, [base]);

  const trend = useMemo(() => {
    const measures = Object.fromEntries(ALL_ORDER_STATUSES.map((s) => [s, (o: Order) => (o.status === s ? 1 : 0)]));
    return trendBuckets(base, (o) => orderDateFor(o, f.dateType), f, measures);
  }, [base, f]);

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

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
    },
    { key: "created", header: "Created Date", value: (o) => ymd(new Date(o.createdAt)), cell: (o) => formatDay(new Date(o.createdAt)) },
    { key: "status", header: "Current Status", value: (o) => ORDER_STATUS_LABELS[o.status], cell: (o) => <OrderStatusBadge status={o.status} /> },
    { key: "updated", header: "Last Updated", value: (o) => ymd(new Date(o.updatedAt)), cell: (o) => formatDay(new Date(o.updatedAt)) },
    { key: "courier", header: "Courier Company", value: (o) => o.courier.company || "—" },
    { key: "tracking", header: "Tracking", value: (o) => o.courier.trackingId || "—" },
    { key: "customer", header: "Customer", hidden: true, value: (o) => o.customerName },
    { key: "phone", header: "Phone", hidden: true, value: (o) => o.phone },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Order Status Report" description="Where every order stands right now." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={DATE_TYPES} statusOptions={ALL_ORDER_STATUSES} courier groupBy />

      <KpiGrid
        columns={4}
        items={ALL_ORDER_STATUSES.map((s) => ({
          label: ORDER_STATUS_LABELS[s],
          value: num(counts[s]),
          tone: s === "delivered" ? "good" : s === "refuse_return" || s === "cancelled" ? (counts[s] ? "bad" : "neutral") : s === "partial_delivered" ? "warn" : "neutral",
        }))}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,420px)_1fr]">
        <Panel title="Status distribution" subtitle={`${num(base.length)} orders`}>
          <DonutChart data={ALL_ORDER_STATUSES.map((s) => ({ name: ORDER_STATUS_LABELS[s], value: counts[s], color: STATUS_CHART_COLORS[s] }))} />
        </Panel>
        <Panel title="Status trend" subtitle="Orders by status over time">
          <TrendChart data={trend} stacked series={ALL_ORDER_STATUSES.map((s) => ({ key: s, label: ORDER_STATUS_LABELS[s], color: STATUS_CHART_COLORS[s] }))} />
        </Panel>
      </div>

      <DataTable exportName="order-status" title="Orders" columns={columns} rows={rows} rowKey={(o) => o.id} />
    </div>
  );
}
