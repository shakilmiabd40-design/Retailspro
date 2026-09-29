"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccess } from "@/lib/settings/access";
import { formatDateTime } from "@/lib/settings/runtime";
import { usePos } from "@/lib/pos/store";
import { PAYMENT_LABELS, invoiceMatches, paymentSummary, returnState } from "@/lib/pos/utils";
import type { PosInvoice } from "@/lib/pos/types";
import { inRange } from "@/lib/reports/dates";
import { useReportFilters } from "@/lib/reports/use-filters";
import { FilterBar } from "@/components/reports/filter-bar";
import { DataTable, type Column } from "@/components/reports/data-table";
import { ReportHeader } from "@/components/reports/kpi";
import { ReceiptDialog } from "@/components/pos/receipt";
import { InvoiceStatusTag, VoidInvoiceModal, useInvoiceStatus } from "@/components/pos/invoice-parts";
import { Loading, fieldInput, fieldStyle } from "@/components/pos/ui";

const sel = `${fieldInput} !py-1.5 text-[12.5px]`;

export default function PosSalesPage() {
  const { invoices, hydrated } = usePos();
  const { can } = useAccess();
  const statusOf = useInvoiceStatus();
  const filters = useReportFilters("pos_sale");
  const f = filters.applied;

  const [cashier, setCashier] = useState("all");
  const [method, setMethod] = useState("all");
  const [saleType, setSaleType] = useState("all");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [printing, setPrinting] = useState<PosInvoice | null>(null);
  const [voiding, setVoiding] = useState<PosInvoice | null>(null);

  const cashiers = useMemo(() => [...new Map(invoices.map((i) => [i.cashierId, i.cashierName])).entries()], [invoices]);

  const rows = useMemo(
    () =>
      invoices.filter(
        (i) =>
          inRange(new Date(i.createdAt), f.from, f.to) &&
          (cashier === "all" || i.cashierId === cashier) &&
          (saleType === "all" || i.saleType === saleType) &&
          (method === "all" || i.payments.some((p) => p.method === method)) &&
          (status === "all" || statusOf(i).key === status) &&
          invoiceMatches(i, q)
      ),
    [invoices, f.from, f.to, cashier, saleType, method, status, q, statusOf]
  );

  if (!hydrated) return <Loading />;

  const columns: Column<PosInvoice>[] = [
    {
      key: "no",
      header: "Invoice No",
      value: (i) => i.invoiceNumber,
      cell: (i) => (
        <Link href={`/pos/sales/${i.id}`} className="font-semibold hover:underline" style={{ color: "var(--brand-strong)" }}>
          {i.invoiceNumber}
        </Link>
      ),
    },
    { key: "date", header: "Date", value: (i) => formatDateTime(i.createdAt) },
    { key: "customer", header: "Customer", value: (i) => (i.customer.walkIn ? "Walk-in" : `${i.customer.name}${i.customer.phone ? ` · ${i.customer.phone}` : ""}`) },
    { key: "qty", header: "Items", value: (i) => i.items.reduce((s, x) => s + x.qty, 0), align: "right" },
    { key: "total", header: "Total", value: (i) => i.total, align: "right", total: (rs) => rs.filter((r) => r.status === "completed" && r.saleType === "walk_in").reduce((s, r) => s + r.total, 0).toLocaleString() },
    { key: "paid", header: "Paid", value: (i) => (i.saleType === "delivery" ? 0 : i.total), align: "right" },
    { key: "method", header: "Payment", value: (i) => paymentSummary(i) },
    { key: "type", header: "Type", value: (i) => (i.saleType === "delivery" ? "Delivery order" : "Walk-in") },
    { key: "cashier", header: "Cashier", value: (i) => i.cashierName, hidden: true },
    { key: "status", header: "Status", value: (i) => statusOf(i).label, cell: (i) => <InvoiceStatusTag inv={i} /> },
    {
      key: "actions",
      header: "Actions",
      noExport: true,
      value: () => "",
      cell: (i) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={`/pos/sales/${i.id}`} className="text-[12px] underline" style={{ color: "var(--brand-strong)" }}>
            View
          </Link>
          <button onClick={() => setPrinting(i)} className="text-[12px] underline" style={{ color: "var(--text-muted)" }}>
            Print
          </button>
          {can("pos", "delete") && i.status === "completed" && (
            <button onClick={() => setVoiding(i)} className="text-[12px] underline" style={{ color: "var(--red)" }}>
              Void
            </button>
          )}
          {can("pos", "approve") && i.status === "completed" && i.saleType === "walk_in" && returnState(i) !== "full" && (
            <Link href={`/pos/returns/new?invoice=${i.id}`} className="text-[12px] underline" style={{ color: "var(--text-muted)" }}>
              Return
            </Link>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <ReportHeader title="POS Sales" description="Every invoice rung up at the POS. A completed sale isn't edited — void it, or return / exchange items." />
      <FilterBar
        state={filters}
        dateTypes={["pos_sale"]}
        extra={
          <>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>Search</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice, name, phone, SKU" className={sel} style={fieldStyle} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>Cashier</span>
              <select value={cashier} onChange={(e) => setCashier(e.target.value)} className={sel} style={fieldStyle}>
                <option value="all">All cashiers</option>
                {cashiers.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>Payment method</span>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={sel} style={fieldStyle}>
                <option value="all">All methods</option>
                {(["cash", "card", "mobile_banking"] as const).map((m) => (
                  <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>Sale type</span>
              <select value={saleType} onChange={(e) => setSaleType(e.target.value)} className={sel} style={fieldStyle}>
                <option value="all">Walk-in & delivery</option>
                <option value="walk_in">Walk-in</option>
                <option value="delivery">Delivery order created</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel} style={fieldStyle}>
                <option value="all">Any status</option>
                <option value="completed">Completed</option>
                <option value="partial">Part returned</option>
                <option value="refunded">Refunded</option>
                <option value="void">Void</option>
                <option value="delivery">Delivery (open order)</option>
              </select>
            </label>
          </>
        }
      />
      <DataTable exportName="pos-sales" columns={columns} rows={rows} rowKey={(i) => i.id} canExport={can("pos", "export")} emptyText="No POS sales for these filters." />
      <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
        The Total footer counts walk-in sales that still stand (not void). Delivery sales are revenue only once Orders marks them delivered.
      </p>

      {printing && <ReceiptDialog invoice={printing} reprint onClose={() => setPrinting(null)} />}
      {voiding && <VoidInvoiceModal invoice={voiding} onClose={() => setVoiding(null)} />}
    </div>
  );
}
