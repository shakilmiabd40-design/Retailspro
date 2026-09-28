"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowLeftRight, Ban, Download, Printer, ShieldCheck, Truck } from "lucide-react";
import { useAccess } from "@/lib/settings/access";
import { useWarranty } from "@/lib/warranty/store";
import { WARRANTY_STATUS_LABELS, effectiveStatus } from "@/lib/warranty/utils";
import { formatDate, formatDateTime } from "@/lib/settings/runtime";
import { usePos } from "@/lib/pos/store";
import { PAYMENT_LABELS, REFUND_LABELS, returnState } from "@/lib/pos/utils";
import { ReceiptDialog } from "@/components/pos/receipt";
import { InvoiceStatusTag, VoidInvoiceModal } from "@/components/pos/invoice-parts";
import { GhostBtn, Loading, NotFound, money } from "@/components/pos/ui";

export default function PosInvoicePage() {
  const { id } = useParams<{ id: string }>();
  const { getInvoice, getSession, returns, hydrated } = usePos();
  const { warranties } = useWarranty();
  const { can } = useAccess();
  const [receipt, setReceipt] = useState(false);
  const [voiding, setVoiding] = useState(false);

  if (!hydrated) return <Loading />;
  const inv = getInvoice(id);
  if (!inv) return <NotFound what="Invoice" href="/pos/sales" label="Back to POS sales" />;

  const session = getSession(inv.sessionId);
  const myReturns = returns.filter((r) => r.invoiceId === inv.id);
  const myWarranties = warranties.filter((w) => w.orderId === inv.id);
  const canReturn = can("pos", "approve") && inv.status === "completed" && inv.saleType === "walk_in" && returnState(inv) !== "full";
  const discount = inv.itemDiscount + inv.cartDiscount;

  return (
    <div className="space-y-4">
      <Link href="/pos/sales" className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> POS sales
      </Link>

      <div className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[19px] font-semibold" style={{ color: "var(--text)" }}>
              {inv.invoiceNumber}
            </h1>
            <InvoiceStatusTag inv={inv} />
            {inv.saleType === "delivery" && <span className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>Delivery order</span>}
          </div>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {formatDateTime(inv.createdAt)} · Cashier {inv.cashierName}
            {session && (can("pos", "financial") || session.cashierId === inv.cashierId) && (
              <>
                {" "}
                · <Link href={`/pos/sessions/${session.id}`} className="underline">{session.sessionNumber}</Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <GhostBtn onClick={() => setReceipt(true)}>
            <Printer size={15} /> Print / Reprint
          </GhostBtn>
          <GhostBtn onClick={() => setReceipt(true)} title="Opens the receipt — choose “Save as PDF” in the print dialog">
            <Download size={15} /> Download PDF
          </GhostBtn>
          {inv.orderId && can("orders", "view") && (
            <Link href={`/orders/${inv.orderId}`} className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              <Truck size={15} /> View order {inv.orderNumber}
            </Link>
          )}
          {canReturn && (
            <Link href={`/pos/returns/new?invoice=${inv.id}`} className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              <ArrowLeftRight size={15} /> Return / Exchange
            </Link>
          )}
          {can("pos", "delete") && inv.status === "completed" && (
            <GhostBtn danger onClick={() => setVoiding(true)}>
              <Ban size={15} /> Void
            </GhostBtn>
          )}
        </div>
      </div>

      {inv.status === "void" && (
        <div className="rounded-xl p-4 text-[13px]" style={{ background: "var(--red-soft, rgba(220,38,38,0.08))", color: "var(--red)" }}>
          Voided {inv.voidedAt ? formatDateTime(inv.voidedAt) : ""} by {inv.voidedBy}. Reason: {inv.voidReason}
        </div>
      )}
      {inv.saleType === "delivery" && (
        <div className="rounded-xl p-4 text-[13px]" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
          Delivery sale — stock is reserved, the courier collects <b style={{ color: "var(--text)" }}>{money(inv.total)}</b> on delivery, and the warranty is issued when Orders marks it delivered. Returns for it go through Orders / Returns.
        </div>
      )}
      {inv.exchangeOfReturnNumber && (
        <div className="rounded-xl p-4 text-[13px]" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
          This sale is the new-item side of exchange <b style={{ color: "var(--text)" }}>{inv.exchangeOfReturnNumber}</b>.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="card overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-2 py-2.5 text-right">Qty</th>
                  <th className="px-2 py-2.5 text-right">Price</th>
                  <th className="px-2 py-2.5 text-right">Discount</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {inv.items.map((i) => (
                  <tr key={i.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-4 py-2.5">
                      <p className="font-medium" style={{ color: "var(--text)" }}>{i.productName}</p>
                      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                        {i.color} / {i.size} · {i.sku}
                        {i.returnedQty > 0 && <span style={{ color: "var(--brand-strong)" }}> · {i.returnedQty} returned</span>}
                      </p>
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{i.qty}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{money(i.price)}</td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{i.discount + i.cartDiscount > 0 ? `− ${money(i.discount + i.cartDiscount)}` : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">{money(i.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {inv.discountLog.length > 0 && (
            <div className="card p-4">
              <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text)" }}>Discount changes</p>
              <ul className="space-y-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                {inv.discountLog.map((d) => (
                  <li key={d.id}>
                    {formatDateTime(d.at)} · {d.by} · {d.target}: {d.from.value > 0 ? (d.from.type === "percent" ? `${d.from.value}%` : money(d.from.value)) : "none"} → {d.to.value > 0 ? (d.to.type === "percent" ? `${d.to.value}%` : money(d.to.value)) : "none"}
                    {d.override && <b style={{ color: "var(--red)" }}> · manager override</b>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {myReturns.length > 0 && (
            <div className="card p-4">
              <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text)" }}>Returns &amp; exchanges</p>
              <ul className="space-y-1.5 text-[13px]">
                {myReturns.map((r) => (
                  <li key={r.id}>
                    <Link href={`/pos/returns/${r.id}`} className="font-semibold underline" style={{ color: "var(--brand-strong)" }}>{r.returnNumber}</Link>{" "}
                    <span style={{ color: "var(--text-muted)" }}>
                      · {r.type === "exchange" ? "Exchange" : "Return"} · {money(r.creditValue)} · {formatDateTime(r.createdAt)}
                      {r.refundAmount > 0 && ` · refunded ${money(r.refundAmount)} (${REFUND_LABELS[r.refundMethod]})`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {inv.saleType === "walk_in" && (
            <div className="card p-4">
              <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                <ShieldCheck size={15} /> Warranty
              </p>
              {myWarranties.length === 0 ? (
                <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>No warranty records for this sale.</p>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
                  {myWarranties.map((w) => (
                    <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]" style={{ borderColor: "var(--border-soft)" }}>
                      <span>
                        <Link href={`/warranty/${w.id}`} className="font-semibold underline" style={{ color: "var(--brand-strong)" }}>{w.warrantyNumber}</Link>{" "}
                        <span style={{ color: "var(--text-muted)" }}>· {w.productName} ({w.color}/{w.size}) · until {formatDate(w.endDate)} · {WARRANTY_STATUS_LABELS[effectiveStatus(w)]}</span>
                      </span>
                      {can("warranty", "create") && effectiveStatus(w) === "active" && (
                        <Link href={`/warranty/${w.id}`} className="text-[12px] underline" style={{ color: "var(--text-muted)" }}>Create claim</Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="card space-y-1.5 p-4 text-[13px]">
            <Row label="Subtotal" value={money(inv.subtotal)} />
            {discount > 0 && <Row label="Discount" value={`− ${money(discount)}`} green />}
            {inv.vat > 0 && <Row label={`VAT (${inv.vatPercent}%)`} value={money(inv.vat)} />}
            {inv.deliveryCharge > 0 && <Row label="Delivery charge" value={money(inv.deliveryCharge)} />}
            <div className="flex justify-between border-t pt-2 text-[15px] font-bold" style={{ borderColor: "var(--border-soft)", color: "var(--text)" }}>
              <span>{inv.saleType === "delivery" ? "Expected COD" : "Total"}</span>
              <span className="tabular-nums">{money(inv.total)}</span>
            </div>
          </div>

          {inv.saleType === "walk_in" && (
            <div className="card space-y-1.5 p-4 text-[13px]">
              <p className="mb-1 text-[13px] font-semibold" style={{ color: "var(--text)" }}>Payment</p>
              {inv.payments.map((p) => (
                <Row key={p.id} label={`${PAYMENT_LABELS[p.method]}${p.reference ? ` · ${p.reference}` : ""}`} value={money(p.amount)} />
              ))}
              <Row label="Paid" value={money(inv.tendered)} />
              <Row label="Change" value={money(inv.change)} />
            </div>
          )}

          <div className="card space-y-1 p-4 text-[13px]">
            <p className="mb-1 text-[13px] font-semibold" style={{ color: "var(--text)" }}>Customer</p>
            <p style={{ color: "var(--text)" }}>{inv.customer.walkIn ? "Walk-in customer" : inv.customer.name}</p>
            {inv.customer.phone && <p style={{ color: "var(--text-muted)" }}>{inv.customer.phone}</p>}
            {inv.customer.address && <p style={{ color: "var(--text-muted)" }}>{inv.customer.address}</p>}
            {inv.customer.note && <p style={{ color: "var(--text-muted)" }}>Note: {inv.customer.note}</p>}
            {inv.notes && <p style={{ color: "var(--text-muted)" }}>Sale note: {inv.notes}</p>}
          </div>
        </div>
      </div>

      {receipt && <ReceiptDialog invoice={inv} reprint onClose={() => setReceipt(false)} />}
      {voiding && <VoidInvoiceModal invoice={inv} onClose={() => setVoiding(false)} />}
    </div>
  );
}

function Row({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="tabular-nums" style={{ color: green ? "var(--green)" : "var(--text)" }}>{value}</span>
    </div>
  );
}
