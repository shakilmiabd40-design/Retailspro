"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Download, Printer, X } from "lucide-react";
import { useSettings } from "@/lib/settings/store";
import { formatDate, formatDateTime } from "@/lib/settings/runtime";
import type { PosInvoice } from "@/lib/pos/types";
import { PAYMENT_LABELS } from "@/lib/pos/utils";
import { money } from "./ui";

/** 80 mm thermal-style receipt. Pure markup, so it prints the same on the sale screen, the invoice page and the print page. */
export function PosReceipt({ invoice, reprint }: { invoice: PosInvoice; reprint?: boolean }) {
  const { settings } = useSettings();
  const c = settings.company;
  const p = settings.pos;
  const rule = { borderTop: "1px dashed #999", margin: "6px 0" } as const;
  const row = { display: "flex", justifyContent: "space-between", gap: 8 } as const;
  const isDelivery = invoice.saleType === "delivery";

  return (
    <div
      className="pos-receipt"
      style={{ width: 302, margin: "0 auto", background: "#fff", color: "#000", padding: "12px 10px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, lineHeight: 1.45 }}
    >
      <style>{`@media print { @page { size: 80mm auto; margin: 3mm; } .pos-receipt { width: 100% !important; padding: 0 !important; } }`}</style>
      <div style={{ textAlign: "center" }}>
        {c.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.logo} alt="" style={{ maxHeight: 44, margin: "0 auto 4px" }} />
        )}
        <div style={{ fontSize: 15, fontWeight: 700 }}>{c.shopName}</div>
        {c.address && <div>{c.address}</div>}
        {c.phone && <div>Tel: {c.phone}</div>}
        {c.vatNumber && p.vatPercent > 0 && <div>VAT reg: {c.vatNumber}</div>}
        {p.receiptHeader && <div style={{ marginTop: 4, whiteSpace: "pre-line" }}>{p.receiptHeader}</div>}
      </div>

      <div style={rule} />
      {reprint && <div style={{ textAlign: "center", fontWeight: 700 }}>*** REPRINT ***</div>}
      {invoice.status === "void" && <div style={{ textAlign: "center", fontWeight: 700 }}>*** VOID ***</div>}
      <div style={row}>
        <span>{isDelivery ? "Delivery order" : "Invoice"}</span>
        <b>{invoice.invoiceNumber}</b>
      </div>
      <div style={row}>
        <span>Date</span>
        <span>{formatDateTime(invoice.createdAt)}</span>
      </div>
      <div style={row}>
        <span>Cashier</span>
        <span>{invoice.cashierName}</span>
      </div>
      {!invoice.customer.walkIn && (
        <div style={row}>
          <span>Customer</span>
          <span>{invoice.customer.name}{invoice.customer.phone ? ` · ${invoice.customer.phone}` : ""}</span>
        </div>
      )}
      {isDelivery && invoice.customer.address && (
        <div>
          <span>Deliver to: </span>
          {invoice.customer.address}
        </div>
      )}
      {isDelivery && invoice.orderNumber && (
        <div style={row}>
          <span>Order</span>
          <span>{invoice.orderNumber}</span>
        </div>
      )}

      <div style={rule} />
      {invoice.items.map((i) => (
        <div key={i.id} style={{ marginBottom: 4 }}>
          <div style={{ fontWeight: 600 }}>{i.productName}</div>
          <div style={row}>
            <span>
              {i.color}/{i.size} · {i.qty} × {money(i.price)}
            </span>
            <span>{money(i.price * i.qty)}</span>
          </div>
          {i.discount + i.cartDiscount > 0 && (
            <div style={{ ...row, color: "#444" }}>
              <span>&nbsp;&nbsp;Discount</span>
              <span>−{money(i.discount + i.cartDiscount)}</span>
            </div>
          )}
        </div>
      ))}

      <div style={rule} />
      <div style={row}>
        <span>Subtotal</span>
        <span>{money(invoice.subtotal)}</span>
      </div>
      {invoice.itemDiscount + invoice.cartDiscount > 0 && (
        <div style={row}>
          <span>Discount</span>
          <span>−{money(invoice.itemDiscount + invoice.cartDiscount)}</span>
        </div>
      )}
      {invoice.vat > 0 && (
        <div style={row}>
          <span>VAT ({invoice.vatPercent}%)</span>
          <span>{money(invoice.vat)}</span>
        </div>
      )}
      {invoice.deliveryCharge > 0 && (
        <div style={row}>
          <span>Delivery charge</span>
          <span>{money(invoice.deliveryCharge)}</span>
        </div>
      )}
      <div style={{ ...row, fontSize: 14, fontWeight: 700, marginTop: 2 }}>
        <span>{isDelivery ? "COD to collect" : "TOTAL"}</span>
        <span>{money(invoice.total)}</span>
      </div>

      {!isDelivery && (
        <>
          <div style={rule} />
          {invoice.payments.map((pay) => (
            <div key={pay.id} style={row}>
              <span>
                {PAYMENT_LABELS[pay.method]}
                {pay.reference ? ` (${pay.reference})` : ""}
              </span>
              <span>{money(pay.amount)}</span>
            </div>
          ))}
          <div style={row}>
            <span>Paid</span>
            <span>{money(invoice.tendered)}</span>
          </div>
          <div style={row}>
            <span>Change</span>
            <span>{money(invoice.change)}</span>
          </div>
        </>
      )}

      {!isDelivery && p.showWarrantyOnReceipt && invoice.warrantyEndsAt && (
        <>
          <div style={rule} />
          <div style={{ textAlign: "center" }}>Warranty valid until {formatDate(invoice.warrantyEndsAt)}</div>
        </>
      )}

      <div style={rule} />
      <div style={{ textAlign: "center", fontSize: 11 }}>
        {p.returnPolicyText && <div style={{ whiteSpace: "pre-line", marginBottom: 4 }}>{p.returnPolicyText}</div>}
        {p.receiptFooter && <div style={{ whiteSpace: "pre-line", fontWeight: 600 }}>{p.receiptFooter}</div>}
      </div>
    </div>
  );
}

/** Prints only the receipt (the rest of the page is hidden by CSS while `printing-receipt` is on <html>). */
export function printReceipt(title?: string) {
  const html = document.documentElement;
  const oldTitle = document.title;
  if (title) document.title = title;
  html.classList.add("printing-receipt");
  const done = () => {
    html.classList.remove("printing-receipt");
    document.title = oldTitle;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

/** Receipt in a dialog with Print / Save as PDF. Rendered into <body> so printing can isolate it. */
export function ReceiptDialog({ invoice, reprint, onClose, extra, banner }: { invoice: PosInvoice; reprint?: boolean; onClose: () => void; extra?: React.ReactNode; banner?: React.ReactNode }) {
  // false on the server, true in the browser — the portal needs document.body.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className="receipt-portal fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label={`Receipt ${invoice.invoiceNumber}`} style={{ background: "rgba(0,0,0,0.55)" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="card my-4 w-full max-w-[380px]">
        <div className="no-print flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border-soft)" }}>
          <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            Receipt {invoice.invoiceNumber}
          </p>
          <button onClick={onClose} aria-label="Close" className="focus-ring rounded-md p-1" style={{ color: "var(--text-faint)" }}>
            <X size={17} />
          </button>
        </div>
        {banner && <div className="no-print">{banner}</div>}
        <div className="p-3" style={{ background: "var(--surface-2)" }}>
          <div className="shadow-sm">
            <PosReceipt invoice={invoice} reprint={reprint} />
          </div>
        </div>
        <div className="no-print flex flex-wrap gap-2 border-t px-4 py-3" style={{ borderColor: "var(--border-soft)" }}>
          <button onClick={() => printReceipt(invoice.invoiceNumber)} className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
            <Printer size={15} /> Print
          </button>
          <button
            onClick={() => printReceipt(invoice.invoiceNumber)}
            title="Opens the print dialog — choose “Save as PDF” as the destination"
            className="focus-ring flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)", background: "var(--surface)" }}
          >
            <Download size={15} /> Save as PDF
          </button>
          {extra}
        </div>
      </div>
    </div>,
    document.body
  );
}
