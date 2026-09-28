"use client";

import { useMemo, useState } from "react";
import { useAccess } from "@/lib/settings/access";
import { usePos } from "@/lib/pos/store";
import { grossProfit, invoiceByMethod, roundMoney } from "@/lib/pos/utils";
import { bucketOf, bucketsBetween, inRange } from "@/lib/reports/dates";
import { useReportFilters } from "@/lib/reports/use-filters";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { COLORS, TrendChart } from "@/components/reports/charts";
import { Chip, Loading, money } from "@/components/pos/ui";

interface DayRow {
  key: string;
  label: string;
  invoices: number;
  items: number;
  gross: number;
  discount: number;
  vat: number;
  returns: number;
  net: number;
  cash: number;
  card: number;
  mobile: number;
}

interface CashierRow {
  id: string;
  name: string;
  sessions: number;
  invoices: number;
  items: number;
  gross: number;
  discount: number;
  avg: number;
  returnsProcessed: number;
  returnsValue: number;
  shortOver: number;
}

const blankDay = (key: string, label: string): DayRow => ({ key, label, invoices: 0, items: 0, gross: 0, discount: 0, vat: 0, returns: 0, net: 0, cash: 0, card: 0, mobile: 0 });

export default function PosReportsPage() {
  const { invoices, returns, sessions, hydrated } = usePos();
  const { can, currentUser } = useAccess();
  const seeAll = can("pos", "financial");
  const canExport = can("pos", "export");
  const filters = useReportFilters("pos_sale", "daily");
  const f = filters.applied;
  const [tab, setTab] = useState<"daily" | "cashier">("daily");

  const data = useMemo(() => {
    const mineOnly = <T,>(id: string, list: T[], get: (t: T) => string) => (seeAll ? list : list.filter((x) => get(x) === id));
    const inv = mineOnly(currentUser.id, invoices, (i) => i.cashierId).filter((i) => inRange(new Date(i.createdAt), f.from, f.to));
    const sales = inv.filter((i) => i.saleType === "walk_in" && i.status === "completed");
    const rets = mineOnly(currentUser.id, returns, (r) => r.processedById).filter((r) => inRange(new Date(r.createdAt), f.from, f.to));
    const sess = mineOnly(currentUser.id, sessions, (s) => s.cashierId).filter((s) => inRange(new Date(s.openedAt), f.from, f.to));

    const buckets = new Map(bucketsBetween(f.from, f.to, f.groupBy).map((b) => [b.key, blankDay(b.key, b.label)]));
    for (const i of sales) {
      const b = bucketOf(new Date(i.createdAt), f.groupBy);
      const row = buckets.get(b.key) ?? blankDay(b.key, b.label);
      const m = invoiceByMethod(i);
      row.invoices += 1;
      row.items += i.items.reduce((s, x) => s + x.qty, 0);
      row.gross += i.total;
      row.discount += i.itemDiscount + i.cartDiscount;
      row.vat += i.vat;
      row.cash += m.cash;
      row.card += m.card;
      row.mobile += m.mobile_banking;
      buckets.set(b.key, row);
    }
    for (const r of rets) {
      const b = bucketOf(new Date(r.createdAt), f.groupBy);
      const row = buckets.get(b.key) ?? blankDay(b.key, b.label);
      row.returns += r.creditValue;
      buckets.set(b.key, row);
    }
    const days = [...buckets.values()].map((d) => ({ ...d, net: roundMoney(d.gross - d.returns) }));

    const cashiers = new Map<string, CashierRow>();
    const row = (id: string, name: string) => cashiers.get(id) ?? { id, name, sessions: 0, invoices: 0, items: 0, gross: 0, discount: 0, avg: 0, returnsProcessed: 0, returnsValue: 0, shortOver: 0 };
    for (const i of sales) {
      const c = row(i.cashierId, i.cashierName);
      c.invoices += 1;
      c.items += i.items.reduce((s, x) => s + x.qty, 0);
      c.gross += i.total;
      c.discount += i.itemDiscount + i.cartDiscount;
      cashiers.set(c.id, c);
    }
    for (const r of rets) {
      const c = row(r.processedById, r.processedBy);
      c.returnsProcessed += 1;
      c.returnsValue += r.creditValue;
      cashiers.set(c.id, c);
    }
    for (const s of sess) {
      const c = row(s.cashierId, s.cashierName);
      c.sessions += 1;
      if (s.status === "closed") c.shortOver += s.difference ?? 0;
      cashiers.set(c.id, c);
    }
    const cashierRows = [...cashiers.values()].map((c) => ({ ...c, avg: c.invoices ? roundMoney(c.gross / c.invoices) : 0 })).sort((a, b) => b.gross - a.gross);

    const gross = sales.reduce((s, i) => s + i.total, 0);
    const returned = rets.reduce((s, r) => s + r.creditValue, 0);
    const delivery = inv.filter((i) => i.saleType === "delivery" && i.status === "completed");
    return {
      days,
      cashierRows,
      invoices: sales.length,
      items: sales.reduce((s, i) => s + i.items.reduce((n, x) => n + x.qty, 0), 0),
      gross,
      discount: sales.reduce((s, i) => s + i.itemDiscount + i.cartDiscount, 0),
      returned,
      net: gross - returned,
      profit: sales.reduce((s, i) => s + grossProfit(i), 0),
      voids: inv.filter((i) => i.status === "void" && i.saleType === "walk_in").length,
      deliveryCount: delivery.length,
      deliveryValue: delivery.reduce((s, i) => s + i.total, 0),
    };
  }, [invoices, returns, sessions, f.from, f.to, f.groupBy, seeAll, currentUser.id]);

  if (!hydrated) return <Loading />;

  const dayCols: Column<DayRow>[] = [
    { key: "label", header: f.groupBy === "daily" ? "Date" : f.groupBy === "weekly" ? "Week" : "Month", value: (d) => d.label },
    { key: "invoices", header: "Invoices", value: (d) => d.invoices, align: "right", total: (r) => r.reduce((s, d) => s + d.invoices, 0) },
    { key: "items", header: "Items", value: (d) => d.items, align: "right", total: (r) => r.reduce((s, d) => s + d.items, 0) },
    { key: "gross", header: "Gross sales", value: (d) => roundMoney(d.gross), align: "right", total: (r) => money(r.reduce((s, d) => s + d.gross, 0)) },
    { key: "discount", header: "Discounts", value: (d) => roundMoney(d.discount), align: "right", total: (r) => money(r.reduce((s, d) => s + d.discount, 0)) },
    { key: "vat", header: "VAT", value: (d) => roundMoney(d.vat), align: "right", hidden: true },
    { key: "returns", header: "Returns", value: (d) => roundMoney(d.returns), align: "right", total: (r) => money(r.reduce((s, d) => s + d.returns, 0)) },
    { key: "net", header: "Net sales", value: (d) => d.net, align: "right", total: (r) => money(r.reduce((s, d) => s + d.net, 0)) },
    { key: "cash", header: "Cash", value: (d) => roundMoney(d.cash), align: "right" },
    { key: "card", header: "Card", value: (d) => roundMoney(d.card), align: "right" },
    { key: "mobile", header: "Mobile banking", value: (d) => roundMoney(d.mobile), align: "right" },
  ];

  const cashierCols: Column<CashierRow>[] = [
    { key: "name", header: "Cashier", value: (c) => c.name },
    { key: "sessions", header: "Sessions", value: (c) => c.sessions, align: "right" },
    { key: "invoices", header: "Invoices", value: (c) => c.invoices, align: "right", total: (r) => r.reduce((s, c) => s + c.invoices, 0) },
    { key: "items", header: "Items", value: (c) => c.items, align: "right" },
    { key: "gross", header: "Gross sales", value: (c) => roundMoney(c.gross), align: "right", total: (r) => money(r.reduce((s, c) => s + c.gross, 0)) },
    { key: "discount", header: "Discounts given", value: (c) => roundMoney(c.discount), align: "right" },
    { key: "avg", header: "Avg invoice", value: (c) => c.avg, align: "right" },
    { key: "rp", header: "Returns processed", value: (c) => c.returnsProcessed, align: "right" },
    { key: "rv", header: "Returned value", value: (c) => roundMoney(c.returnsValue), align: "right" },
    {
      key: "so",
      header: "Cash short / over",
      value: (c) => roundMoney(c.shortOver),
      align: "right",
      cell: (c) => <span style={{ color: c.shortOver === 0 ? "var(--text-muted)" : "var(--red)", fontWeight: c.shortOver === 0 ? 400 : 600 }}>{c.shortOver === 0 ? "0" : money(c.shortOver)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <ReportHeader title="POS Reports" description={seeAll ? "Daily sales and cashier-wise performance for walk-in sales." : "Your walk-in sales."} />
      <FilterBar state={filters} dateTypes={["pos_sale"]} groupBy />

      <KpiGrid
        columns={6}
        items={[
          { label: "Invoices", value: data.invoices, sub: data.voids ? `${data.voids} voided (not counted)` : undefined },
          { label: "Items sold", value: data.items },
          { label: "Gross sales", value: money(data.gross) },
          { label: "Discounts given", value: money(data.discount), tone: "warn" },
          { label: "Returns", value: money(data.returned), tone: data.returned ? "bad" : "neutral" },
          { label: "Net sales", value: money(data.net), tone: "brand" },
        ]}
      />
      {seeAll && (
        <KpiGrid
          columns={3}
          items={[
            { label: "Gross profit (before returns)", value: money(data.profit), sub: "revenue after discounts, minus cost of goods", tone: "good" },
            { label: "Average invoice", value: money(data.invoices ? roundMoney(data.gross / data.invoices) : 0) },
            { label: "Delivery orders created", value: data.deliveryCount, sub: `${money(data.deliveryValue)} expected COD — counted in Orders once delivered` },
          ]}
        />
      )}

      <Panel title="Sales trend" subtitle="Gross sales and returns">
        <TrendChart data={data.days.map((d) => ({ label: d.label, gross: d.gross, returns: d.returns }))} series={[{ key: "gross", label: "Gross sales", color: COLORS.brand }, { key: "returns", label: "Returns", color: COLORS.red }]} format={(v) => money(v)} />
      </Panel>

      <div className="flex gap-2">
        <Chip active={tab === "daily"} onClick={() => setTab("daily")}>{f.groupBy === "daily" ? "Daily sales" : f.groupBy === "weekly" ? "Weekly sales" : "Monthly sales"}</Chip>
        <Chip active={tab === "cashier"} onClick={() => setTab("cashier")}>Cashier-wise</Chip>
      </div>

      {tab === "daily" ? (
        <DataTable exportName="pos-daily-sales" columns={dayCols} rows={data.days} rowKey={(d) => d.key} canExport={canExport} pageSize={31} />
      ) : (
        <DataTable exportName="pos-cashier-wise" columns={cashierCols} rows={data.cashierRows} rowKey={(c) => c.id} canExport={canExport} emptyText="No POS activity for these dates." />
      )}

      <RuleNote>
        Counted: completed walk-in sales, on the day they were rung up. Voided sales are left out. Returns and exchanges are taken off on the day they were processed. Delivery orders created at the POS are tracked in Orders and counted in Reports → Sales &amp; COD once they&apos;re delivered.
        {!seeAll && " You only see your own figures; POS → Financial shows everyone's and profit."}
      </RuleNote>
    </div>
  );
}
