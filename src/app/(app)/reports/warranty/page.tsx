"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useWarranty } from "@/lib/warranty/store";
import { daysLeft, effectiveStatus, WARRANTY_STATUS_LABELS } from "@/lib/warranty/utils";
import type { Warranty, WarrantyClaim } from "@/lib/warranty/types";
import { formatDay, inRange, parseDate, type DateTypeKey } from "@/lib/reports/dates";
import { num, ymd } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, ReportHeader, RuleNote } from "@/components/reports/kpi";

const DATE_TYPES: DateTypeKey[] = ["warranty_start", "claim_submitted"];
type Tab = "active" | "expired" | "claims";

interface ClaimRow {
  claim: WarrantyClaim;
  warranty: Warranty;
}

const APPROVED = ["approved", "in_service", "replaced", "refunded"];

export default function WarrantyReportPage() {
  const state = useReportFilters("warranty_start");
  const f = state.applied;
  const { warranties, hydrated } = useWarranty();
  const [tab, setTab] = useState<Tab>("active");

  const claimInRange = (c: WarrantyClaim) => inRange(new Date(c.submittedAt), f.from, f.to);

  // Warranties in scope: started in the period, or (claim date mode) with a claim submitted in the period.
  const scope = useMemo(
    () => warranties.filter((w) => (f.dateType === "claim_submitted" ? w.claims.some(claimInRange) : inRange(parseDate(w.startDate), f.from, f.to))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [warranties, f]
  );

  const claimRows = useMemo<ClaimRow[]>(
    () =>
      scope
        .flatMap((w) => w.claims.filter((c) => f.dateType !== "claim_submitted" || claimInRange(c)).map((c) => ({ claim: c, warranty: w })))
        .sort((a, b) => b.claim.submittedAt.localeCompare(a.claim.submittedAt)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, f]
  );

  const active = useMemo(() => scope.filter((w) => ["active", "claimed"].includes(effectiveStatus(w))), [scope]);
  const expired = useMemo(() => scope.filter((w) => effectiveStatus(w) === "expired"), [scope]);

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const expiringSoon = active.filter((w) => {
    const d = daysLeft(w);
    return d >= 0 && d <= 30;
  }).length;

  const warrantyColumns: Column<Warranty>[] = [
    {
      key: "id",
      header: "Warranty ID",
      value: (w) => w.warrantyNumber,
      cell: (w) => (
        <Link href={`/warranty/${w.id}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--brand)" }}>
          {w.warrantyNumber}
        </Link>
      ),
    },
    {
      key: "order",
      header: "Order ID",
      value: (w) => w.orderNumber,
      cell: (w) => (
        <Link href={w.source === "pos" ? `/pos/sales/${w.orderId}` : `/orders/${w.orderId}`} className="focus-ring rounded hover:underline" style={{ color: "var(--text)" }}>
          #{w.orderNumber}
        </Link>
      ),
    },
    { key: "sku", header: "SKU", value: (w) => w.sku },
    { key: "start", header: "Start Date", value: (w) => ymd(parseDate(w.startDate)), cell: (w) => formatDay(parseDate(w.startDate)) },
    { key: "end", header: "End Date", value: (w) => ymd(parseDate(w.endDate)), cell: (w) => formatDay(parseDate(w.endDate)) },
    { key: "status", header: "Status", value: (w) => WARRANTY_STATUS_LABELS[effectiveStatus(w)] },
    { key: "left", header: "Days Left", align: "right", value: (w) => Math.max(0, daysLeft(w)) },
    { key: "customer", header: "Customer", hidden: true, value: (w) => w.customerName },
    { key: "product", header: "Product", hidden: true, value: (w) => `${w.productName} (${w.color}/${w.size})` },
  ];

  const claimColumns: Column<ClaimRow>[] = [
    { key: "id", header: "Claim ID", value: (r) => r.claim.id.slice(0, 8).toUpperCase() },
    {
      key: "warranty",
      header: "Warranty ID",
      value: (r) => r.warranty.warrantyNumber,
      cell: (r) => (
        <Link href={`/warranty/${r.warranty.id}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--brand)" }}>
          {r.warranty.warrantyNumber}
        </Link>
      ),
    },
    { key: "issue", header: "Issue", value: (r) => r.claim.issueType },
    { key: "status", header: "Status", value: (r) => r.claim.status.replace(/_/g, " ") },
    { key: "submitted", header: "Submitted Date", value: (r) => ymd(new Date(r.claim.submittedAt)), cell: (r) => formatDay(new Date(r.claim.submittedAt)) },
    { key: "closed", header: "Closed Date", value: (r) => (r.claim.closedAt ? ymd(new Date(r.claim.closedAt)) : ""), cell: (r) => (r.claim.closedAt ? formatDay(new Date(r.claim.closedAt)) : "—") },
    { key: "sku", header: "SKU", hidden: true, value: (r) => r.warranty.sku },
    { key: "customer", header: "Customer", hidden: true, value: (r) => r.warranty.customerName },
    { key: "notes", header: "Resolution Notes", hidden: true, value: (r) => r.claim.resolutionNotes ?? "" },
  ];

  const setTabAndDate = (t: Tab) => {
    setTab(t);
    // Claims are dated by submission; the other tabs by warranty start.
    state.applyPatch({ dateType: t === "claims" ? "claim_submitted" : "warranty_start" });
  };

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Warranty Report" description="Warranties issued from delivered orders, and the claims against them." meta={`${f.from} to ${f.to}`} />
      <FilterBar state={state} dateTypes={DATE_TYPES} />

      <div className="no-print flex w-fit gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
        {(
          [
            ["active", `Active warranties (${active.length})`],
            ["expired", `Expired warranties (${expired.length})`],
            ["claims", `Claims (${claimRows.length})`],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button key={key} onClick={() => setTabAndDate(key)} className="focus-ring rounded-md px-3 py-1.5 text-[12.5px] font-medium" style={{ background: tab === key ? "var(--brand)" : "transparent", color: tab === key ? "#fff" : "var(--text-muted)" }}>
            {label}
          </button>
        ))}
      </div>

      <RuleNote>
        Warranties are counted by start date (the delivery date); on the Claims tab, by the date the claim was submitted. Active includes warranties with an open claim. Void warranties are left out. Approved claims include those in service, replaced or refunded.
      </RuleNote>

      <KpiGrid
        columns={6}
        items={[
          { label: "Warranties created", value: num(scope.length) },
          { label: "Active", value: num(active.length), tone: "good" },
          { label: "Expiring in 30 days", value: num(expiringSoon), tone: expiringSoon ? "warn" : "neutral" },
          { label: "Claims submitted", value: num(claimRows.length) },
          { label: "Claims approved", value: num(claimRows.filter((r) => APPROVED.includes(r.claim.status)).length), tone: "good" },
          { label: "Claims rejected", value: num(claimRows.filter((r) => r.claim.status === "rejected").length), tone: "bad" },
        ]}
      />

      {tab === "active" && <DataTable key="active" exportName="warranty-active" title="Active warranties" columns={warrantyColumns} rows={active} rowKey={(w) => w.id} />}
      {tab === "expired" && <DataTable key="expired" exportName="warranty-expired" title="Expired warranties" columns={warrantyColumns} rows={expired} rowKey={(w) => w.id} />}
      {tab === "claims" && <DataTable key="claims" exportName="warranty-claims" title="Warranty claims" columns={claimColumns} rows={claimRows} rowKey={(r) => r.claim.id} emptyText="No claims for these filters." />}
    </div>
  );
}
