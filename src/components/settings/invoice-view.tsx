"use client";

import type { Order } from "@/lib/orders/types";
import type { CompanySettings, InvoiceSettings } from "@/lib/settings/types";
import { collectedAmount, expectedCod, productSubtotal, totalDiscount } from "@/lib/orders/utils";
import { formatTaka } from "@/lib/products/utils";
import { formatDate } from "@/lib/settings/runtime";

/** Paper-style invoice — always light, so it prints the same whatever theme is on screen. */
export function InvoiceView({ order, company, invoice, paper }: { order: Order; company: CompanySettings; invoice: InvoiceSettings; paper?: "a4" | "pos" }) {
  const size = paper ?? invoice.print.paperSize;
  const pos = size === "pos";
  const t = invoice.template;
  const subtotal = productSubtotal(order);
  const discount = totalDiscount(order);
  const paid = collectedAmount(order);
  const muted = "#5b6270";
  const line = "#e3e5ea";

  return (
    <div
      className="invoice-paper mx-auto"
      style={{
        width: pos ? 302 : "100%",
        maxWidth: pos ? 302 : 794,
        background: "#ffffff",
        color: "#14161b",
        padding: pos ? 14 : 40,
        fontSize: pos ? 11.5 : 13,
        lineHeight: 1.45,
        boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
        borderRadius: pos ? 4 : 6,
      }}
    >
      <style>{`@media print { @page { size: ${pos ? "80mm auto" : "A4"}; margin: ${pos ? "4mm" : "12mm"}; } .invoice-paper { box-shadow: none !important; max-width: none !important; } }`}</style>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexDirection: pos ? "column" : "row", alignItems: pos ? "center" : "flex-start", textAlign: pos ? "center" : "left" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexDirection: pos ? "column" : "row" }}>
          {t.showLogo && company.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo} alt="" style={{ height: pos ? 44 : 56, width: pos ? 44 : 56, objectFit: "cover", borderRadius: 10 }} />
          )}
          <div>
            <p style={{ fontSize: pos ? 15 : 20, fontWeight: 700 }}>{company.shopName}</p>
            {t.showAddress && company.address && <p style={{ color: muted, whiteSpace: "pre-line" }}>{company.address}</p>}
            {(company.phone || company.email) && <p style={{ color: muted }}>{[company.phone, company.email].filter(Boolean).join(" · ")}</p>}
            {(company.tradeLicense || company.vatNumber) && (
              <p style={{ color: muted, fontSize: pos ? 10.5 : 11.5 }}>{[company.tradeLicense && `Trade Lic: ${company.tradeLicense}`, company.vatNumber && `VAT/BIN: ${company.vatNumber}`].filter(Boolean).join(" · ")}</p>
            )}
          </div>
        </div>
        <div style={{ textAlign: pos ? "center" : "right" }}>
          <p style={{ fontSize: pos ? 13 : 18, fontWeight: 700, letterSpacing: 0.5 }}>INVOICE</p>
          <p style={{ color: muted }}>#{order.orderNumber}</p>
          <p style={{ color: muted }}>{formatDate(order.createdAt)}</p>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${line}`, margin: pos ? "10px 0" : "20px 0", paddingTop: pos ? 8 : 14 }}>
        <p style={{ color: muted, fontSize: pos ? 10 : 11.5 }}>Bill to</p>
        <p style={{ fontWeight: 600 }}>{order.customerName}</p>
        {t.showCustomerPhone && <p>{order.phone}</p>}
        {t.showCustomerAddress && (
          <p style={{ color: muted }}>{[order.address, order.area, order.district].filter(Boolean).join(", ")}</p>
        )}
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${line}`, color: muted, textAlign: "left" }}>
            <th style={{ padding: "6px 0", fontWeight: 500 }}>Item</th>
            <th style={{ padding: "6px 4px", fontWeight: 500, textAlign: "right" }}>Qty</th>
            {!pos && <th style={{ padding: "6px 4px", fontWeight: 500, textAlign: "right" }}>Price</th>}
            <th style={{ padding: "6px 0", fontWeight: 500, textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.id} style={{ borderBottom: `1px solid ${line}` }}>
              <td style={{ padding: "7px 0" }}>
                {i.productName}
                <span style={{ color: muted }}> ({i.color}/{i.size})</span>
              </td>
              <td style={{ padding: "7px 4px", textAlign: "right" }}>{i.qty}</td>
              {!pos && <td style={{ padding: "7px 4px", textAlign: "right" }}>{formatTaka(i.price)}</td>}
              <td style={{ padding: "7px 0", textAlign: "right" }}>{formatTaka(i.price * i.qty - i.discount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginLeft: "auto", marginTop: 12, width: pos ? "100%" : 280 }}>
        {[
          ["Subtotal", formatTaka(subtotal), true],
          ["Discount", `- ${formatTaka(discount)}`, discount > 0],
          ["Delivery charge", `+ ${formatTaka(order.deliveryCharge)}`, t.showDeliveryCharge],
        ]
          .filter((r) => r[2])
          .map(([k, v]) => (
            <div key={String(k)} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", color: muted }}>
              <span>{k}</span>
              <span style={{ color: "#14161b" }}>{v}</span>
            </div>
          ))}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", marginTop: 4, borderTop: `1px solid ${line}`, fontWeight: 700, fontSize: pos ? 13 : 15 }}>
          <span>Total (COD)</span>
          <span>{formatTaka(expectedCod(order))}</span>
        </div>
        {t.showPaidAmount && paid > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", color: muted }}>
            <span>Paid / collected</span>
            <span style={{ color: "#14161b" }}>{formatTaka(paid)}</span>
          </div>
        )}
      </div>

      {t.terms.trim() && (
        <p style={{ marginTop: pos ? 12 : 26, paddingTop: 10, borderTop: `1px solid ${line}`, color: muted, fontSize: pos ? 10 : 11.5, whiteSpace: "pre-line" }}>{t.terms}</p>
      )}
      <p style={{ marginTop: 10, textAlign: "center", color: muted, fontSize: pos ? 10 : 11.5 }}>Thank you for shopping with {company.shopName}.</p>
    </div>
  );
}
