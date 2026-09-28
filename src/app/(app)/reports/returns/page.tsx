"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useReturns } from "@/lib/returns/store";
import { RETURN_STATUS_LABELS } from "@/lib/returns/utils";
import type { ReturnType } from "@/lib/returns/types";
import { formatDay, inRange, type DateTypeKey } from "@/lib/reports/dates";
import { countBy } from "@/lib/reports/aggregate";
import { num, sum, ymd } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { RankBars } from "@/components/reports/charts";

const DATE_TYPES: DateTypeKey[] = ["return_received", "return_requested"];

interface ReturnLine {
  key: string;
  returnId: string;
  returnNumber: string;
  reference: string;
  party: string;
  sku: string;
  product: string;
  qty: number;
  reason: string;
  condition: string;
  status: string;
  receivedAt: Date | null;
}

const requestedAt = (createdAt: string) => new Date(createdAt);

export default function ReturnsReportPage() {
  const state = useReportFilters("return_received");
  const f = state.applied;
  const { returns, hydrated } = useReturns();
  const [tab, setTab] = useState<ReturnType>("customer");

  const ofTab = useMemo(() => returns.filter((r) => r.type === tab), [returns, tab]);

  const scoped = useMemo(
    () =>
      ofTab.filter((r) =>
        f.dateType === "return_received" ? inRange(r.returnReceivedAt ? new Date(r.returnReceivedAt) : null, f.from, f.to) : inRange(requestedAt(r.createdAt), f.from, f.to)
      ),
    [ofTab, f]
  );

  const lines = useMemo<ReturnLine[]>(
    () =>
      scoped
        .flatMap((r) =>
          r.items.map((i) => ({
            key: `${r.id}-${i.id}`,
            returnId: r.id,
            returnNumber: r.returnNumber,
            reference: r.referenceLabel,
            party: r.partyName,
            sku: i.sku,
            product: `${i.productName} (${i.color}/${i.size})`,
            qty: i.qty,
            reason: i.reason || "No reason given",
            condition: i.condition,
            status: RETURN_STATUS_LABELS[r.status],
            receivedAt: r.returnReceivedAt ? new Date(r.returnReceivedAt) : null,
          }))
        )
        .sort((a, b) => (b.receivedAt?.getTime() ?? 0) - (a.receivedAt?.getTime() ?? 0)),
    [scoped]
  );

  const reasons = useMemo(
    () => [...countBy(lines, (l) => l.reason, (l) => l.qty).entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value })),
    [lines]
  );

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const requested = ofTab.filter((r) => inRange(requestedAt(r.createdAt), f.from, f.to)).length;
  const received = ofTab.filter((r) => inRange(r.returnReceivedAt ? new Date(r.returnReceivedAt) : null, f.from, f.to)).length;

  const columns: Column<ReturnLine>[] = [
    {
      key: "id",
      header: "Return ID",
      value: (l) => l.returnNumber,
      cell: (l) => (
        <Link href={`/returns/${l.returnId}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--brand)" }}>
          {l.returnNumber}
        </Link>
      ),
      total: () => "Total",
    },
    { key: "ref", header: tab === "customer" ? "Reference (Order)" : "Reference (PO)", value: (l) => l.reference },
    { key: "sku", header: "SKU", value: (l) => l.sku },
    { key: "qty", header: "Qty", align: "right", value: (l) => l.qty, total: (r) => num(sum(r, (l) => l.qty)) },
    { key: "reason", header: "Reason", value: (l) => l.reason },
    { key: "status", header: "Status", value: (l) => l.status },
    { key: "received", header: "Received Date", value: (l) => ymd(l.receivedAt), cell: (l) => (l.receivedAt ? formatDay(l.receivedAt) : "Not received") },
    { key: "party", header: tab === "customer" ? "Customer" : "Supplier", hidden: true, value: (l) => l.party },
    { key: "product", header: "Product", hidden: true, value: (l) => l.product },
    { key: "condition", header: "Condition", hidden: true, value: (l) => l.condition },
  ];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Returns Report" description="Customer and supplier returns." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={DATE_TYPES} />

      <div className="no-print flex w-fit gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
        {(
          [
            ["customer", "Customer returns"],
            ["supplier", "Supplier returns"],
          ] as [ReturnType, string][]
        ).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className="focus-ring rounded-md px-3 py-1.5 text-[12.5px] font-medium" style={{ background: tab === key ? "var(--brand)" : "transparent", color: tab === key ? "#fff" : "var(--text-muted)" }}>
            {label}
          </button>
        ))}
      </div>

      <RuleNote>Requested counts returns raised in the period; Received counts parcels that came back in the period. The table follows the date type you picked.</RuleNote>

      <KpiGrid
        columns={4}
        items={[
          { label: "Returns requested", value: num(requested) },
          { label: "Returns received", value: num(received), tone: "good" },
          { label: "Units in table", value: num(sum(lines, (l) => l.qty)) },
          { label: "Top reason", value: reasons[0]?.label ?? "—", sub: reasons[0] ? `${reasons[0].value} units` : undefined },
        ]}
      />

      <Panel title="Top reasons" subtitle="By units returned">
        <RankBars rows={reasons} unit=" pcs" color="#f59e0b" />
      </Panel>

      <DataTable key={tab} exportName={`returns-${tab}`} title={tab === "customer" ? "Customer returns" : "Supplier returns"} columns={columns} rows={lines} rowKey={(l) => l.key} />
    </div>
  );
}
