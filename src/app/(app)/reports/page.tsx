"use client";

import { useMemo } from "react";
import { useOrders } from "@/lib/orders/store";
import { useSettlements } from "@/lib/settlements/store";
import { actualCourierCost, courierLoss, courierProfit, salesRevenue } from "@/lib/orders/utils";
import { COURIER_RESULT_STATUSES, filterOrders, orderDateFor } from "@/lib/reports/orders";
import { inRange, type DateTypeKey } from "@/lib/reports/dates";
import { trendBuckets } from "@/lib/reports/aggregate";
import { num, pct, sum, taka } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import type { Order } from "@/lib/orders/types";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { COLORS, STATUS_CHART_COLORS, TrendChart } from "@/components/reports/charts";

const DATE_TYPES: DateTypeKey[] = ["final_status", "delivered", "order_created", "dispatch"];

interface ProductRow {
  name: string;
  qty: number;
  revenue: number;
}

interface CourierRow {
  courier: string;
  total: number;
  delivered: number;
  partial: number;
  refused: number;
}

/** What comes back against the courier bill: the delivery charge on Delivered, the paid amount on Partial. */
const recovery = (o: Order) => (o.status === "delivered" ? o.deliveryCharge : o.status === "partial_delivered" ? o.delivery.customerPaid : 0);
const courierBill = (o: Order) => (o.status === "cancelled" ? 0 : actualCourierCost(o));

export default function ReportsDashboardPage() {
  const state = useReportFilters("final_status", "daily");
  const f = state.applied;
  const { orders, hydrated } = useOrders();
  const { rows: settlementRows, hydrated: settlementsReady } = useSettlements();

  const settlementOf = useMemo(() => new Map(settlementRows.map((r) => [r.order.id, r])), [settlementRows]);

  // The cohort follows the chosen date type; "Total orders created" always counts by creation date.
  const cohort = useMemo(() => filterOrders(orders, { ...f, status: "all" }), [orders, f]);
  const createdCount = useMemo(
    () => orders.filter((o) => (f.courier === "all" || o.courier.company === f.courier) && inRange(new Date(o.createdAt), f.from, f.to)).length,
    [orders, f]
  );

  const trendOrders = useMemo(
    () =>
      trendBuckets(cohort, (o) => orderDateFor(o, f.dateType), f, {
        delivered: (o) => (o.status === "delivered" ? 1 : 0),
        cancelled: (o) => (o.status === "cancelled" ? 1 : 0),
        refuse: (o) => (o.status === "refuse_return" ? 1 : 0),
        partial: (o) => (o.status === "partial_delivered" ? 1 : 0),
      }),
    [cohort, f]
  );

  const trendCost = useMemo(
    () => trendBuckets(cohort, (o) => orderDateFor(o, f.dateType), f, { cost: courierBill, recovery }),
    [cohort, f]
  );

  const trendPending = useMemo(
    () => trendBuckets(cohort, (o) => orderDateFor(o, f.dateType), f, { pending: (o) => settlementOf.get(o.id)?.pending ?? 0 }),
    [cohort, f, settlementOf]
  );

  const topSelling = useMemo<ProductRow[]>(() => {
    const m = new Map<string, ProductRow>();
    for (const o of cohort) {
      if (o.status !== "delivered") continue;
      for (const i of o.items) {
        const cur = m.get(i.productId) ?? { name: i.productName, qty: 0, revenue: 0 };
        cur.qty += i.qty;
        cur.revenue += i.price * i.qty - i.discount;
        m.set(i.productId, cur);
      }
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);
  }, [cohort]);

  const mostReturned = useMemo<ProductRow[]>(() => {
    const m = new Map<string, ProductRow>();
    for (const o of cohort) {
      if (o.status !== "partial_delivered" && o.status !== "refuse_return") continue;
      for (const i of o.items) {
        const cur = m.get(i.productId) ?? { name: i.productName, qty: 0, revenue: 0 };
        cur.qty += i.qty;
        m.set(i.productId, cur);
      }
    }
    return [...m.values()].sort((a, b) => b.qty - a.qty).slice(0, 8);
  }, [cohort]);

  const couriers = useMemo<CourierRow[]>(() => {
    const m = new Map<string, CourierRow>();
    for (const o of cohort) {
      if (!COURIER_RESULT_STATUSES.includes(o.status)) continue;
      const key = o.courier.company || "—";
      const cur = m.get(key) ?? { courier: key, total: 0, delivered: 0, partial: 0, refused: 0 };
      cur.total += 1;
      if (o.status === "delivered") cur.delivered += 1;
      if (o.status === "partial_delivered") cur.partial += 1;
      if (o.status === "refuse_return") cur.refused += 1;
      m.set(key, cur);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [cohort]);

  if (!hydrated || !settlementsReady) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const count = (s: Order["status"]) => cohort.filter((o) => o.status === s).length;
  const cohortSettlements = cohort.map((o) => settlementOf.get(o.id)).filter((r): r is NonNullable<typeof r> => !!r);
  const profit = sum(cohort, courierProfit);
  const loss = sum(cohort, courierLoss);
  const expected = sum(cohortSettlements, (r) => r.expected);
  const received = sum(cohortSettlements, (r) => r.received);

  const productColumns = (showRevenue: boolean): Column<ProductRow>[] => [
    { key: "name", header: "Product", value: (r) => r.name },
    { key: "qty", header: "Qty", align: "right", value: (r) => r.qty },
    ...(showRevenue ? [{ key: "revenue", header: "Revenue", align: "right" as const, value: (r: ProductRow) => r.revenue, cell: (r: ProductRow) => taka(r.revenue) }] : []),
  ];

  const courierColumns: Column<CourierRow>[] = [
    { key: "courier", header: "Courier Company", value: (r) => r.courier },
    { key: "total", header: "Orders", align: "right", value: (r) => r.total },
    { key: "delivered", header: "Delivered", align: "right", value: (r) => r.delivered },
    { key: "partial", header: "Partial", align: "right", value: (r) => r.partial },
    { key: "refused", header: "Refused", align: "right", value: (r) => r.refused },
    { key: "drate", header: "Delivered Rate", align: "right", value: (r) => (r.total ? Math.round((r.delivered / r.total) * 1000) / 10 : 0), cell: (r) => pct(r.delivered, r.total) },
    { key: "rrate", header: "Refuse Rate", align: "right", value: (r) => (r.total ? Math.round((r.refused / r.total) * 1000) / 10 : 0), cell: (r) => pct(r.refused, r.total) },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Reports Summary" description="A quick read on orders, courier results and settlements." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={DATE_TYPES} courier groupBy />
      <RuleNote>
        Order counts, revenue, courier and settlement figures cover orders whose selected date falls in the period. Total orders created always counts by creation date. Net revenue is Delivered orders only: product sales plus the delivery charge billed to the customer, minus the courier cost (delivery, return, other).
      </RuleNote>

      <KpiGrid
        columns={4}
        items={[
          { label: "Total orders created", value: num(createdCount) },
          { label: "Delivered", value: num(count("delivered")), tone: "good" },
          { label: "Cancelled", value: num(count("cancelled")), tone: count("cancelled") ? "bad" : "neutral" },
          { label: "Partial delivered", value: num(count("partial_delivered")), tone: "warn" },
          { label: "Refuse return", value: num(count("refuse_return")), tone: count("refuse_return") ? "bad" : "neutral" },
          { label: "Delivered net revenue", value: taka(sum(cohort, salesRevenue)), tone: "brand", sub: "Sales + delivery billed − courier cost" },
          { label: "Total courier cost", value: taka(sum(cohort, courierBill)) },
          { label: "Courier loss (Partial + Refuse)", value: taka(loss), tone: loss ? "bad" : "neutral" },
          { label: "Courier profit (Partial)", value: taka(profit), tone: "good" },
          { label: "Settlement expected", value: taka(expected) },
          { label: "Settlement received", value: taka(received), tone: "good" },
          { label: "Settlement pending", value: taka(Math.max(0, expected - received)), tone: "warn", sub: "Expected − received" },
        ]}
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel title="Orders trend" subtitle="Delivered vs cancelled vs refused vs partial">
          <TrendChart
            data={trendOrders}
            series={[
              { key: "delivered", label: "Delivered", color: STATUS_CHART_COLORS.delivered },
              { key: "partial", label: "Partial", color: STATUS_CHART_COLORS.partial_delivered },
              { key: "refuse", label: "Refuse", color: STATUS_CHART_COLORS.refuse_return },
              { key: "cancelled", label: "Cancelled", color: STATUS_CHART_COLORS.cancelled },
            ]}
            stacked
          />
        </Panel>
        <Panel title="Courier cost vs recovery" subtitle="Recovery = delivery charge on Delivered + amount paid on Partial">
          <TrendChart
            data={trendCost}
            series={[
              { key: "cost", label: "Courier cost", color: COLORS.red },
              { key: "recovery", label: "Recovery", color: COLORS.green },
            ]}
            format={taka}
          />
        </Panel>
      </div>

      <Panel title="Settlement pending trend" subtitle="Still owed by couriers, by the orders' selected date">
        <TrendChart data={trendPending} kind="line" series={[{ key: "pending", label: "Pending", color: COLORS.amber }]} format={taka} height={220} />
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <DataTable exportName="top-selling-products" title="Top selling products" columns={productColumns(true)} rows={topSelling} rowKey={(r) => r.name} pageSize={8} emptyText="No delivered orders in this period." />
        <DataTable exportName="most-refused-partial-products" title="Most refused / partial products" columns={productColumns(false)} rows={mostReturned} rowKey={(r) => r.name} pageSize={8} emptyText="No partial or refused orders in this period." />
      </div>

      <DataTable exportName="courier-performance" title="Courier company performance" columns={courierColumns} rows={couriers} rowKey={(r) => r.courier} emptyText="No courier results in this period." />
    </div>
  );
}
