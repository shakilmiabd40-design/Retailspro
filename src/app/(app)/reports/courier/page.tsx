"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ORDER_STATUS_LABELS } from "@/lib/orders/utils";
import { COURIER_REPORT_DATE_TYPES, COURIER_RESULT_STATUSES } from "@/lib/reports/orders";
import { formatDay, parseDate } from "@/lib/reports/dates";
import { trendBuckets } from "@/lib/reports/aggregate";
import { num, sum, taka } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { useCourierReport } from "@/lib/reports/use-report";
import type { CourierReportRow } from "@/lib/reports/types";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { COLORS, TrendChart } from "@/components/reports/charts";
import { OrderStatusBadge } from "@/components/orders/status-badge";

export default function CourierReportPage() {
  const state = useReportFilters("final_status", "daily");
  const f = state.applied;
  const { data, loading, error } = useCourierReport({
    from: f.from,
    to: f.to,
    dateType: f.dateType,
    courier: f.courier,
    status: f.status,
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const kpis = data?.kpis;

  const trend = useMemo(
    () =>
      trendBuckets(rows, (row) => parseDate(row.reportDay), f, {
        profit: (row) => row.profit,
        loss: (row) => row.loss,
      }),
    [rows, f]
  );

  if (error) return <p className="rounded-xl border px-4 py-3 text-[13px]" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</p>;
  if (loading || !kpis) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const columns: Column<CourierReportRow>[] = [
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
      header: "Date",
      value: (row) => row.reportDay,
      cell: (row) => formatDay(parseDate(row.reportDay)),
    },
    { key: "status", header: "Status", value: (row) => ORDER_STATUS_LABELS[row.status], cell: (row) => <OrderStatusBadge status={row.status} /> },
    {
      key: "courier",
      header: "Courier + Tracking",
      value: (row) => `${row.courier || "—"}${row.trackingId ? ` (${row.trackingId})` : ""}`,
      cell: (row) => (
        <>
          {row.courier || "—"}
          {row.trackingId && <span className="block text-[11.5px]" style={{ color: "var(--text-faint)" }}>{row.trackingId}</span>}
        </>
      ),
    },
    { key: "fwd", header: "Forward Cost", align: "right", value: (row) => row.forwardCost, cell: (row) => taka(row.forwardCost), total: (r) => taka(sum(r, (row) => row.forwardCost)) },
    { key: "ret", header: "Return Cost", align: "right", value: (row) => row.returnCost, cell: (row) => taka(row.returnCost), total: (r) => taka(sum(r, (row) => row.returnCost)) },
    { key: "other", header: "Other Cost", align: "right", value: (row) => row.otherCost, cell: (row) => taka(row.otherCost), total: (r) => taka(sum(r, (row) => row.otherCost)) },
    { key: "actual", header: "Actual Courier Cost", align: "right", value: (row) => row.actualCost, cell: (row) => taka(row.actualCost), total: (r) => taka(sum(r, (row) => row.actualCost)) },
    {
      key: "paid",
      header: "Customer Paid",
      align: "right",
      value: (row) => row.customerPaid,
      cell: (row) => (row.customerPaid === null ? "—" : taka(row.customerPaid)),
      total: (r) => taka(sum(r, (row) => row.customerPaid ?? 0)),
    },
    {
      key: "net",
      header: "Courier Net",
      align: "right",
      value: (row) => row.courierNet,
      cell: (row) => (row.courierNet === null ? "—" : taka(row.courierNet)),
    },
    {
      key: "profit",
      header: "Profit",
      align: "right",
      value: (row) => row.profit,
      cell: (row) => <span style={{ color: row.profit > 0 ? "var(--green)" : "var(--text-faint)" }}>{taka(row.profit)}</span>,
      total: () => taka(kpis.profit),
    },
    {
      key: "loss",
      header: "Loss",
      align: "right",
      value: (row) => row.loss,
      cell: (row) => <span style={{ color: row.loss > 0 ? "var(--red)" : "var(--text-faint)" }}>{taka(row.loss)}</span>,
      total: () => taka(kpis.loss),
    },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Courier Cost & Profit/Loss" description="What couriers cost, and what Partial and Refuse orders gained or lost." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={COURIER_REPORT_DATE_TYPES} statusOptions={COURIER_RESULT_STATUSES} courier groupBy />
      <RuleNote>
        Partial Delivered: profit or loss = customer paid − courier cost. Refuse Return: customer paid is 0, so the full courier cost is a loss. Delivered orders only add to cost. Cancelled orders are excluded (courier cost 0). Report days use the Asia/Dhaka business day.
      </RuleNote>

      <KpiGrid
        items={[
          { label: "Total forward cost", value: taka(kpis.forwardCost) },
          { label: "Total return cost", value: taka(kpis.returnCost) },
          { label: "Other cost", value: taka(kpis.otherCost) },
          { label: "Actual courier cost", value: taka(kpis.actualCourierCost), tone: "brand", sub: `${num(rows.length)} orders` },
          { label: "Customer paid (Partial)", value: taka(kpis.customerPaidPartial) },
          { label: "Courier profit", value: taka(kpis.profit), tone: "good" },
          { label: "Courier loss", value: taka(kpis.loss), tone: kpis.loss > 0 ? "bad" : "neutral" },
          { label: "Net courier result", value: taka(kpis.netResult), tone: kpis.netResult < 0 ? "bad" : "good", sub: "Profit − loss" },
        ]}
      />

      <Panel title="Courier profit vs loss" subtitle="Partial and Refuse orders by the selected date">
        <TrendChart
          data={trend}
          series={[
            { key: "profit", label: "Profit", color: COLORS.green },
            { key: "loss", label: "Loss", color: COLORS.red },
          ]}
          format={taka}
        />
      </Panel>

      <DataTable exportName="courier-cost-profit-loss" title="Orders" columns={columns} rows={rows} rowKey={(row) => row.orderId} />
    </div>
  );
}
