"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useSettlements } from "@/lib/settlements/store";
import { useSettings } from "@/lib/settings/store";
import { useAccess } from "@/lib/settings/access";
import type { SettlementRow } from "@/lib/settlements/compute";
import type { CourierPayout } from "@/lib/settlements/types";
import { ORDER_STATUS_LABELS } from "@/lib/orders/utils";
import { finalStatusDate, orderDateFor } from "@/lib/reports/orders";
import { formatDay, inRange, parseDate, type DateTypeKey, type SettlementLabel } from "@/lib/reports/dates";
import { num, sum, taka, ymd } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { useOrders } from "@/lib/orders/store";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { KpiGrid, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { EditExpectedModal, RecordPayoutModal } from "@/components/reports/settlement-modals";

const DATE_TYPES: DateTypeKey[] = ["settlement_paid", "delivered", "final_status"];
type View = "orders" | "couriers" | "ledger";

const STATUS_COLOR: Record<SettlementLabel, { color: string; bg: string }> = {
  Unsettled: { color: "#b45309", bg: "rgba(180, 83, 9, 0.14)" },
  "Partially Settled": { color: "var(--blue)", bg: "var(--blue-soft)" },
  Settled: { color: "var(--green)", bg: "var(--green-soft)" },
};

function SettlementBadge({ status, legacy }: { status: SettlementLabel; legacy?: boolean }) {
  const s = STATUS_COLOR[status];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-medium" style={{ color: s.color, background: s.bg }} title={legacy ? "Marked settled on the order before payouts were tracked" : undefined}>
      {status}
      {legacy && <span aria-hidden>*</span>}
    </span>
  );
}

interface CourierSummary {
  courier: string;
  expected: number;
  received: number;
  pending: number;
  unsettled: number;
  partial: number;
  orders: number;
}

export default function SettlementReportPage() {
  const state = useReportFilters("settlement_paid");
  const f = state.applied;
  const { rows: allRows, payouts, deletePayout, hydrated } = useSettlements();
  const { hydrated: ordersReady } = useOrders();
  const showToast = useToast();
  const { settings } = useSettings();
  const { can } = useAccess();
  const settlementMode = settings.courier.settlementMode;

  const [view, setView] = useState<View>("orders");
  const [recording, setRecording] = useState(false);
  const [editing, setEditing] = useState<SettlementRow | null>(null);
  const [deleting, setDeleting] = useState<CourierPayout | null>(null);

  const paidMode = f.dateType === "settlement_paid";

  const rows = useMemo(
    () =>
      allRows
        .filter((r) => (f.courier === "all" ? true : r.order.courier.company === f.courier))
        .filter((r) => (f.settlementStatus === "all" ? true : r.status === f.settlementStatus))
        .filter((r) => (paidMode ? r.allocations.some((a) => inRange(parseDate(a.paidDate), f.from, f.to)) : inRange(orderDateFor(r.order, f.dateType), f.from, f.to)))
        .sort((a, b) => (finalStatusDate(b.order)?.getTime() ?? 0) - (finalStatusDate(a.order)?.getTime() ?? 0)),
    [allRows, f, paidMode]
  );

  const courierRows = useMemo(() => {
    const map = new Map<string, CourierSummary>();
    for (const r of rows) {
      const key = r.order.courier.company || "—";
      const cur = map.get(key) ?? { courier: key, expected: 0, received: 0, pending: 0, unsettled: 0, partial: 0, orders: 0 };
      cur.expected += r.expected;
      cur.received += r.received;
      cur.pending += r.pending;
      cur.orders += 1;
      if (r.status === "Unsettled") cur.unsettled += 1;
      if (r.status === "Partially Settled") cur.partial += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.pending - a.pending);
  }, [rows]);

  const ledgerRows = useMemo(
    () => payouts.filter((p) => (f.courier === "all" || p.courier === f.courier) && inRange(parseDate(p.paidDate), f.from, f.to)),
    [payouts, f]
  );

  if (!hydrated || !ordersReady) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const paidInPeriod = sum(rows, (r) => sum(r.allocations.filter((a) => inRange(parseDate(a.paidDate), f.from, f.to)), (a) => a.amount));

  const orderColumns: Column<SettlementRow>[] = [
    {
      key: "order",
      header: "Order ID",
      value: (r) => r.order.orderNumber,
      cell: (r) => (
        <Link href={`/orders/${r.order.id}`} className="focus-ring rounded font-medium hover:underline" style={{ color: "var(--brand)" }}>
          #{r.order.orderNumber}
        </Link>
      ),
      total: () => "Total",
    },
    { key: "date", header: "Final Status Date", value: (r) => ymd(finalStatusDate(r.order)), cell: (r) => formatDay(finalStatusDate(r.order)) },
    { key: "status", header: "Status", value: (r) => ORDER_STATUS_LABELS[r.order.status], cell: (r) => <OrderStatusBadge status={r.order.status} /> },
    {
      key: "expected",
      header: "Expected",
      align: "right",
      value: (r) => r.expected,
      cell: (r) => (
        <span title={r.overridden ? `Adjusted from ${taka(r.policyExpected)}` : undefined}>
          {taka(r.expected)}
          {r.overridden && <span style={{ color: "var(--brand)" }}> ✎</span>}
        </span>
      ),
      total: (rs) => taka(sum(rs, (r) => r.expected)),
    },
    { key: "received", header: "Received", align: "right", value: (r) => r.received, cell: (r) => taka(r.received), total: (rs) => taka(sum(rs, (r) => r.received)) },
    { key: "pending", header: "Pending", align: "right", value: (r) => r.pending, cell: (r) => <span style={{ color: r.pending > 0 ? "#b45309" : "var(--text-faint)" }}>{taka(r.pending)}</span>, total: (rs) => taka(sum(rs, (r) => r.pending)) },
    { key: "settlement", header: "Settlement Status", value: (r) => r.status, cell: (r) => <SettlementBadge status={r.status} legacy={r.legacy} /> },
    { key: "paid", header: "Last Paid Date", value: (r) => r.lastPaidAt ?? "", cell: (r) => (r.lastPaidAt ? formatDay(parseDate(r.lastPaidAt)) : "—") },
    { key: "courier", header: "Courier Company", value: (r) => r.order.courier.company || "—" },
    { key: "note", header: "Note", hidden: true, value: (r) => r.note ?? "" },
    {
      key: "edit",
      header: "",
      noExport: true,
      value: () => null,
      cell: (r) =>
        settlementMode === "auto" || !can("settlement", "edit") ? null : (
        <button onClick={() => setEditing(r)} className="no-print focus-ring rounded-md p-1.5" style={{ color: "var(--text-faint)" }} aria-label={`Adjust settlement for order ${r.order.orderNumber}`} title="Adjust expected amount / note">
          <Pencil size={14} />
        </button>
        ),
    },
  ];

  const courierColumns: Column<CourierSummary>[] = [
    { key: "courier", header: "Courier Company", value: (c) => c.courier, total: () => "Total" },
    { key: "orders", header: "Orders", align: "right", value: (c) => c.orders, total: (r) => num(sum(r, (c) => c.orders)) },
    { key: "expected", header: "Expected", align: "right", value: (c) => c.expected, cell: (c) => taka(c.expected), total: (r) => taka(sum(r, (c) => c.expected)) },
    { key: "received", header: "Received", align: "right", value: (c) => c.received, cell: (c) => taka(c.received), total: (r) => taka(sum(r, (c) => c.received)) },
    { key: "pending", header: "Pending", align: "right", value: (c) => c.pending, cell: (c) => taka(c.pending), total: (r) => taka(sum(r, (c) => c.pending)) },
    { key: "unsettled", header: "Unsettled Orders", align: "right", value: (c) => c.unsettled, total: (r) => num(sum(r, (c) => c.unsettled)) },
    { key: "partial", header: "Partially Settled", align: "right", value: (c) => c.partial, total: (r) => num(sum(r, (c) => c.partial)) },
  ];

  const orderNumberFor = (orderId: string) => allRows.find((r) => r.order.id === orderId)?.order.orderNumber;
  const ledgerColumns: Column<CourierPayout>[] = [
    { key: "id", header: "Payout ID", value: (p) => p.payoutNumber, total: () => "Total" },
    { key: "date", header: "Paid Date", value: (p) => p.paidDate, cell: (p) => formatDay(parseDate(p.paidDate)) },
    { key: "courier", header: "Courier Company", value: (p) => p.courier },
    { key: "amount", header: "Paid Amount", align: "right", value: (p) => p.amount, cell: (p) => taka(p.amount), total: (r) => taka(sum(r, (p) => p.amount)) },
    { key: "allocated", header: "Allocated", align: "right", value: (p) => sum(p.allocations, (a) => a.amount), cell: (p) => taka(sum(p.allocations, (a) => a.amount)), total: (r) => taka(sum(r, (p) => sum(p.allocations, (a) => a.amount))) },
    { key: "unallocated", header: "Unallocated", align: "right", value: (p) => p.amount - sum(p.allocations, (a) => a.amount), cell: (p) => taka(p.amount - sum(p.allocations, (a) => a.amount)) },
    { key: "orders", header: "Orders", value: (p) => p.allocations.map((a) => `#${orderNumberFor(a.orderId) ?? "deleted"} (${a.amount})`).join(", ") },
    { key: "ref", header: "Reference", value: (p) => p.reference ?? "" },
    {
      key: "del",
      header: "",
      noExport: true,
      value: () => null,
      cell: (p) =>
        !can("settlement", "delete") ? null : (
        <button onClick={() => setDeleting(p)} className="no-print focus-ring rounded-md p-1.5" style={{ color: "var(--text-faint)" }} aria-label={`Delete payout ${p.payoutNumber}`}>
          <Trash2 size={14} />
        </button>
        ),
    },
  ];

  const counts = { Unsettled: 0, "Partially Settled": 0, Settled: 0 } as Record<SettlementLabel, number>;
  for (const r of rows) counts[r.status] += 1;

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeader title="Settlement Report" description="Track what each courier owes you and what it has paid out." meta={`${f.from} to ${f.to}`} />
        {can("settlement", "create") && (
          <button onClick={() => setRecording(true)} className="no-print focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
            <Plus size={14} />
            Record payout
          </button>
        )}
      </div>

      <FilterBar state={state} dateTypes={DATE_TYPES} courier settlement />

      <RuleNote>
        Expected = collected − courier cost (Delivered) or customer paid − courier cost (Partial), never below 0. Refuse Return and Cancelled orders have no payout. You can adjust any order&apos;s expected amount with the pencil.{" "}
        {paidMode ? "With Settlement Paid Date, only orders that received a payout in this period appear; switch to Delivered Date to see unsettled orders." : "Amounts are totals to date for orders in this period."}
      </RuleNote>

      <KpiGrid
        columns={4}
        items={[
          { label: "Settlement expected", value: taka(sum(rows, (r) => r.expected)) },
          { label: "Settlement received", value: taka(sum(rows, (r) => r.received)), tone: "good" },
          { label: "Settlement pending", value: taka(sum(rows, (r) => r.pending)), tone: "warn", sub: "Expected − received" },
          ...(paidMode ? [{ label: "Paid in this period", value: taka(paidInPeriod), tone: "brand" as const }] : [{ label: "Orders tracked", value: num(rows.length) }]),
          { label: "Unsettled orders", value: num(counts.Unsettled) },
          { label: "Partially settled orders", value: num(counts["Partially Settled"]) },
          { label: "Settled orders", value: num(counts.Settled), tone: "good" },
        ]}
      />

      <div className="no-print flex gap-1 self-start rounded-lg p-1" style={{ background: "var(--surface-2)", width: "fit-content" }}>
        {(
          [
            ["orders", "Order-wise"],
            ["couriers", "Courier-wise summary"],
            ["ledger", `Payout ledger (${ledgerRows.length})`],
          ] as [View, string][]
        ).map(([key, label]) => (
          <button key={key} onClick={() => setView(key)} className="focus-ring rounded-md px-3 py-1.5 text-[12.5px] font-medium" style={{ background: view === key ? "var(--brand)" : "transparent", color: view === key ? "#fff" : "var(--text-muted)" }}>
            {label}
          </button>
        ))}
      </div>

      {view === "orders" && <DataTable key="orders" exportName="settlement-orders" title="Order-wise settlement" columns={orderColumns} rows={rows} rowKey={(r) => r.order.id} emptyText="No orders in settlement tracking for these filters." />}
      {view === "couriers" && <DataTable key="couriers" exportName="settlement-couriers" title="Courier-wise summary" columns={courierColumns} rows={courierRows} rowKey={(c) => c.courier} />}
      {view === "ledger" && <DataTable key="ledger" exportName="courier-payouts" title="Courier payouts" columns={ledgerColumns} rows={ledgerRows} rowKey={(p) => p.id} emptyText="No payouts recorded in this period." />}

      {rows.some((r) => r.legacy) && (
        <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
          * Marked settled on the order itself before payouts were tracked here. Record a payout to give it a paid date.
        </p>
      )}

      {recording && <RecordPayoutModal onClose={() => setRecording(false)} />}
      {editing && <EditExpectedModal key={editing.order.id} row={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title={deleting ? `Delete payout ${deleting.payoutNumber}` : "Delete payout"}
        message="The amounts allocated to orders are taken back, so those orders show as unsettled or partially settled again."
        confirmLabel="Delete payout"
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) {
            deletePayout(deleting.id);
            showToast(`Payout ${deleting.payoutNumber} deleted`);
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}
