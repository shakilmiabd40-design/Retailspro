"use client";

import { useMemo } from "react";
import Link from "next/link";
import { formatDay, parseDate } from "@/lib/reports/dates";
import { num, sum, taka } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { useSupplierReport } from "@/lib/reports/use-report";
import type { SupplierReportRow } from "@/lib/reports/types";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { RankBars } from "@/components/reports/charts";

const DATE_TYPES: ("grn" | "po_created")[] = ["grn", "po_created"];

export default function SupplierReportPage() {
  const state = useReportFilters("grn");
  const f = state.applied;
  const { data, loading, error } = useSupplierReport({
    from: f.from,
    to: f.to,
    dateType: f.dateType,
    supplierId: f.supplierId,
  });

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const kpis = data?.kpis;

  if (error) return <p className="rounded-xl border px-4 py-3 text-[13px]" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</p>;
  if (loading || !kpis) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const columns: Column<SupplierReportRow>[] = [
    {
      key: "supplier",
      header: "Supplier",
      value: (row) => row.name,
      cell: (row) => (
        <Link href={`/suppliers/${row.id}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--brand)" }}>
          {row.name}
        </Link>
      ),
      total: () => "Total",
    },
    { key: "po", header: "PO Count", align: "right", value: (row) => row.poCount, total: (rs) => num(sum(rs, (row) => row.poCount)) },
    { key: "purchase", header: "Total Purchase", align: "right", value: (row) => row.purchase, cell: (row) => taka(row.purchase), total: (rs) => taka(sum(rs, (row) => row.purchase)) },
    { key: "received", header: "Received Qty", align: "right", value: (row) => row.receivedQty, total: (rs) => num(sum(rs, (row) => row.receivedQty)) },
    { key: "retq", header: "Return Qty", align: "right", value: (row) => row.returnQty, total: (rs) => num(sum(rs, (row) => row.returnQty)) },
    { key: "retv", header: "Total Returns", align: "right", value: (row) => row.returnValue, cell: (row) => taka(row.returnValue), total: (rs) => taka(sum(rs, (row) => row.returnValue)) },
    { key: "last", header: "Last Purchase Date", value: (row) => row.lastPurchaseDay ?? "", cell: (row) => (row.lastPurchaseDay ? formatDay(parseDate(row.lastPurchaseDay)) : "—") },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Supplier Report" description="How much you bought from each supplier, and what went back." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={DATE_TYPES} supplier />
      <RuleNote>
        {f.dateType === "grn" ? "GRN date: purchase value is the cost of stock received in the period." : "PO created date: purchase value is the total of purchase orders created in the period."} Returns are supplier returns received (or raised) in the period, valued at product cost. Draft and cancelled orders are left out. Report days use the Asia/Dhaka business day.
      </RuleNote>

      <KpiGrid
        columns={4}
        items={[
          { label: "Total purchase", value: taka(kpis.totalPurchase), tone: "brand" },
          { label: "Received qty", value: num(kpis.receivedQty), tone: "good" },
          { label: "Supplier return qty", value: num(kpis.returnQty), tone: kpis.returnQty ? "warn" : "neutral" },
          { label: "Supplier return value", value: taka(kpis.returnValue) },
        ]}
      />

      <Panel title="Purchase amount by supplier">
        <RankBars rows={rows.filter((row) => row.purchase > 0).slice(0, 8).map((row) => ({ label: row.name, value: Math.round(row.purchase) }))} />
      </Panel>

      <DataTable exportName="supplier-report" title="Suppliers" columns={columns} rows={rows} rowKey={(row) => row.id} />
    </div>
  );
}
