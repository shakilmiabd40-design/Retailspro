"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/orders/store";
import { actualCourierCost, courierLoss, courierNet, courierProfit, ORDER_STATUS_LABELS } from "@/lib/orders/utils";
import { COURIER_RESULT_STATUSES, filterOrders, orderDateFor } from "@/lib/reports/orders";
import { formatDay, type DateTypeKey } from "@/lib/reports/dates";
import { trendBuckets } from "@/lib/reports/aggregate";
import { num, sum, taka, ymd } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import type { Order } from "@/lib/orders/types";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { COLORS, TrendChart } from "@/components/reports/charts";
import { OrderStatusBadge } from "@/components/orders/status-badge";

const DATE_TYPES: DateTypeKey[] = ["final_status", "delivered", "dispatch", "order_created"];

/** Customer-paid figure that matters for courier P/L: Partial only; Refuse is always 0; Delivered isn't part of P/L. */
const paidForPl = (o: Order): number | null => (o.status === "partial_delivered" ? o.delivery.customerPaid : o.status === "refuse_return" ? 0 : null);
const netForPl = (o: Order): number | null => (o.status === "partial_delivered" ? courierNet(o) : o.status === "refuse_return" ? -actualCourierCost(o) : null);

export default function CourierReportPage() {
  const state = useReportFilters("final_status", "daily");
  const f = state.applied;
  const { orders, hydrated } = useOrders();

  const rows = useMemo(
    () => filterOrders(orders, f, { statuses: COURIER_RESULT_STATUSES }).sort((a, b) => (orderDateFor(b, f.dateType)?.getTime() ?? 0) - (orderDateFor(a, f.dateType)?.getTime() ?? 0)),
    [orders, f]
  );

  const trend = useMemo(
    () => trendBuckets(rows, (o) => orderDateFor(o, f.dateType), f, { profit: courierProfit, loss: courierLoss }),
    [rows, f]
  );

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const profit = sum(rows, courierProfit);
  const loss = sum(rows, courierLoss);

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
    { key: "date", header: "Date", value: (o) => ymd(orderDateFor(o, f.dateType)), cell: (o) => formatDay(orderDateFor(o, f.dateType)) },
    { key: "status", header: "Status", value: (o) => ORDER_STATUS_LABELS[o.status], cell: (o) => <OrderStatusBadge status={o.status} /> },
    {
      key: "courier",
      header: "Courier + Tracking",
      value: (o) => `${o.courier.company || "—"}${o.courier.trackingId ? ` (${o.courier.trackingId})` : ""}`,
      cell: (o) => (
        <>
          {o.courier.company || "—"}
          {o.courier.trackingId && <span className="block text-[11.5px]" style={{ color: "var(--text-faint)" }}>{o.courier.trackingId}</span>}
        </>
      ),
    },
    { key: "fwd", header: "Forward Cost", align: "right", value: (o) => o.courier.forwardCost, cell: (o) => taka(o.courier.forwardCost), total: (r) => taka(sum(r, (o) => o.courier.forwardCost)) },
    { key: "ret", header: "Return Cost", align: "right", value: (o) => o.courier.returnCost, cell: (o) => taka(o.courier.returnCost), total: (r) => taka(sum(r, (o) => o.courier.returnCost)) },
    { key: "other", header: "Other Cost", align: "right", value: (o) => o.courier.otherCost, cell: (o) => taka(o.courier.otherCost), total: (r) => taka(sum(r, (o) => o.courier.otherCost)) },
    { key: "actual", header: "Actual Courier Cost", align: "right", value: (o) => actualCourierCost(o), cell: (o) => taka(actualCourierCost(o)), total: (r) => taka(sum(r, actualCourierCost)) },
    { key: "paid", header: "Customer Paid", align: "right", value: (o) => paidForPl(o), cell: (o) => (paidForPl(o) === null ? "—" : taka(paidForPl(o)!)), total: (r) => taka(sum(r, (o) => paidForPl(o) ?? 0)) },
    { key: "net", header: "Courier Net", align: "right", value: (o) => netForPl(o), cell: (o) => (netForPl(o) === null ? "—" : taka(netForPl(o)!)) },
    { key: "profit", header: "Profit", align: "right", value: courierProfit, cell: (o) => <span style={{ color: courierProfit(o) > 0 ? "var(--green)" : "var(--text-faint)" }}>{taka(courierProfit(o))}</span>, total: () => taka(profit) },
    { key: "loss", header: "Loss", align: "right", value: courierLoss, cell: (o) => <span style={{ color: courierLoss(o) > 0 ? "var(--red)" : "var(--text-faint)" }}>{taka(courierLoss(o))}</span>, total: () => taka(loss) },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Courier Cost & Profit/Loss" description="What couriers cost, and what Partial and Refuse orders gained or lost." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={DATE_TYPES} statusOptions={COURIER_RESULT_STATUSES} courier groupBy />
      <RuleNote>
        Partial Delivered: profit or loss = customer paid − courier cost. Refuse Return: customer paid is 0, so the full courier cost is a loss. Delivered orders only add to cost. Cancelled orders are excluded (courier cost 0).
      </RuleNote>

      <KpiGrid
        items={[
          { label: "Total forward cost", value: taka(sum(rows, (o) => o.courier.forwardCost)) },
          { label: "Total return cost", value: taka(sum(rows, (o) => o.courier.returnCost)) },
          { label: "Other cost", value: taka(sum(rows, (o) => o.courier.otherCost)) },
          { label: "Actual courier cost", value: taka(sum(rows, actualCourierCost)), tone: "brand", sub: `${num(rows.length)} orders` },
          { label: "Customer paid (Partial)", value: taka(sum(rows, (o) => (o.status === "partial_delivered" ? o.delivery.customerPaid : 0))) },
          { label: "Courier profit", value: taka(profit), tone: "good" },
          { label: "Courier loss", value: taka(loss), tone: loss > 0 ? "bad" : "neutral" },
          { label: "Net courier result", value: taka(profit - loss), tone: profit - loss < 0 ? "bad" : "good", sub: "Profit − loss" },
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

      <DataTable exportName="courier-cost-profit-loss" title="Orders" columns={columns} rows={rows} rowKey={(o) => o.id} />
    </div>
  );
}
