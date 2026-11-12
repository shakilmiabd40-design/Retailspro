"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ORDER_STATUS_LABELS } from "@/lib/orders/utils";
import { ALL_ORDER_STATUSES, ORDER_STATUS_DATE_TYPES } from "@/lib/reports/orders";
import { formatDay, parseDate } from "@/lib/reports/dates";
import { trendBuckets } from "@/lib/reports/aggregate";
import { num } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import type { OrderStatus } from "@/lib/orders/types";
import { useOrderStatusReport } from "@/lib/reports/use-report";
import type { OrderStatusReportRow } from "@/lib/reports/types";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { DonutChart, STATUS_CHART_COLORS, TrendChart } from "@/components/reports/charts";
import { OrderStatusBadge } from "@/components/orders/status-badge";

export default function OrderStatusReportPage() {
  const state = useReportFilters("order_created", "daily");
  const f = state.applied;
  const { data, loading, error } = useOrderStatusReport({
    from: f.from,
    to: f.to,
    dateType: f.dateType,
    courier: f.courier,
  });

  // The status filter only applies to the table; counts and charts keep showing the whole mix.
  const base = useMemo(() => data?.rows ?? [], [data]);
  const rows = useMemo(() => base.filter((row) => f.status === "all" || row.status === f.status), [base, f.status]);

  const counts = useMemo(() => {
    const c = {} as Record<OrderStatus, number>;
    for (const s of ALL_ORDER_STATUSES) c[s] = 0;
    for (const row of base) c[row.status] += 1;
    return c;
  }, [base]);

  const trend = useMemo(() => {
    const measures = Object.fromEntries(ALL_ORDER_STATUSES.map((s) => [s, (row: OrderStatusReportRow) => (row.status === s ? 1 : 0)]));
    return trendBuckets(base, (row) => parseDate(row.reportDay), f, measures);
  }, [base, f]);

  if (error) return <p className="rounded-xl border px-4 py-3 text-[13px]" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</p>;
  if (loading || !data) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const columns: Column<OrderStatusReportRow>[] = [
    {
      key: "order",
      header: "Order ID",
      value: (row) => row.orderNumber,
      cell: (row) => (
        <Link href={`/orders/${row.orderId}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--brand)" }}>
          #{row.orderNumber}
        </Link>
      ),
    },
    { key: "created", header: "Created Date", value: (row) => row.createdDay, cell: (row) => formatDay(parseDate(row.createdDay)) },
    { key: "status", header: "Current Status", value: (row) => ORDER_STATUS_LABELS[row.status], cell: (row) => <OrderStatusBadge status={row.status} /> },
    { key: "updated", header: "Last Updated", value: (row) => row.updatedDay, cell: (row) => formatDay(parseDate(row.updatedDay)) },
    { key: "courier", header: "Courier Company", value: (row) => row.courier || "—" },
    { key: "tracking", header: "Tracking", value: (row) => row.trackingId || "—" },
    { key: "customer", header: "Customer", hidden: true, value: (row) => row.customerName },
    { key: "phone", header: "Phone", hidden: true, value: (row) => row.phone },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Order Status Report" description="Where every order stands right now." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={ORDER_STATUS_DATE_TYPES} statusOptions={ALL_ORDER_STATUSES} courier groupBy />
      <RuleNote>The status filter applies to the table only, so the distribution and the trend keep showing every order. Report days use the Asia/Dhaka business day.</RuleNote>

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

      <DataTable exportName="order-status" title="Orders" columns={columns} rows={rows} rowKey={(row) => row.orderId} />
    </div>
  );
}
