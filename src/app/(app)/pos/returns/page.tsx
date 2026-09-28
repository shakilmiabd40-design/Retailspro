"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeftRight, Plus } from "lucide-react";
import { useAccess } from "@/lib/settings/access";
import { formatDateTime } from "@/lib/settings/runtime";
import { usePos } from "@/lib/pos/store";
import { REFUND_LABELS } from "@/lib/pos/utils";
import type { PosReturn } from "@/lib/pos/types";
import { inRange } from "@/lib/reports/dates";
import { useReportFilters } from "@/lib/reports/use-filters";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, ReportHeader } from "@/components/reports/kpi";
import { Tag } from "@/components/settings/ui";
import { Loading, money } from "@/components/pos/ui";

export default function PosReturnsPage() {
  const { returns, hydrated } = usePos();
  const { can } = useAccess();
  const filters = useReportFilters("pos_sale");
  const f = filters.applied;
  const rows = useMemo(() => returns.filter((r) => inRange(new Date(r.createdAt), f.from, f.to)), [returns, f.from, f.to]);
  if (!hydrated) return <Loading />;

  const columns: Column<PosReturn>[] = [
    { key: "no", header: "Return No", value: (r) => r.returnNumber, cell: (r) => <Link href={`/pos/returns/${r.id}`} className="font-semibold hover:underline" style={{ color: "var(--brand-strong)" }}>{r.returnNumber}</Link> },
    { key: "date", header: "Date", value: (r) => formatDateTime(r.createdAt) },
    { key: "type", header: "Type", value: (r) => (r.type === "exchange" ? "Exchange" : "Return"), cell: (r) => <Tag tone={r.type === "exchange" ? "blue" : "brand"}>{r.type === "exchange" ? "Exchange" : "Return"}</Tag> },
    { key: "inv", header: "Invoice", value: (r) => r.invoiceNumber, cell: (r) => <Link href={`/pos/sales/${r.invoiceId}`} className="hover:underline">{r.invoiceNumber}</Link> },
    { key: "cust", header: "Customer", value: (r) => r.customerName },
    { key: "qty", header: "Items", value: (r) => r.items.reduce((s, i) => s + i.qty, 0), align: "right" },
    { key: "credit", header: "Value returned", value: (r) => r.creditValue, align: "right", total: (rs) => rs.reduce((s, r) => s + r.creditValue, 0).toLocaleString() },
    { key: "refund", header: "Refunded", value: (r) => r.refundAmount, align: "right", total: (rs) => rs.reduce((s, r) => s + r.refundAmount, 0).toLocaleString() },
    { key: "method", header: "Refund method", value: (r) => (r.refundAmount > 0 ? REFUND_LABELS[r.refundMethod] : "—") },
    { key: "by", header: "Processed by", value: (r) => r.processedBy },
  ];

  const value = rows.reduce((s, r) => s + r.creditValue, 0);
  const refunded = rows.reduce((s, r) => s + r.refundAmount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeader title="POS Returns & Exchanges" description="Items taken back over the counter. Resellable items go back into stock; damaged ones don't." />
        {can("pos", "approve") && (
          <Link href="/pos/returns/new" className="focus-ring flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
            <Plus size={15} /> New return / exchange
          </Link>
        )}
      </div>
      <FilterBar state={filters} dateTypes={["pos_sale"]} />
      <KpiGrid
        columns={3}
        items={[
          { label: "Returns & exchanges", value: rows.length },
          { label: "Value taken back", value: money(value) },
          { label: "Money refunded", value: money(refunded), sub: "the rest was used as exchange credit" },
        ]}
      />
      <DataTable exportName="pos-returns" columns={columns} rows={rows} rowKey={(r) => r.id} canExport={can("pos", "export")} emptyText="No POS returns for these dates." />
      {!can("pos", "approve") && (
        <p className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-faint)" }}>
          <ArrowLeftRight size={13} /> Processing returns needs a manager (POS → Approve).
        </p>
      )}
    </div>
  );
}
