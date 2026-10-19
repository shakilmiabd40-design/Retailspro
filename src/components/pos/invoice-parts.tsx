"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Tag } from "@/components/settings/ui";
import { useToast } from "@/components/toast";
import { useOrders } from "@/lib/orders/store";
import { usePos } from "@/lib/pos/store";
import type { PosInvoice } from "@/lib/pos/types";
import { deliveryStatusLabel, invoiceCashNet, returnState } from "@/lib/pos/utils";
import { GhostBtn, LabeledField, PosModal, PrimaryBtn, fieldInput, fieldStyle, money } from "./ui";

export type InvoiceStatusKey = "completed" | "void" | "refunded" | "partial" | "delivery";

/** What to show for an invoice: void, fully / partly returned, or — for delivery sales — where the order is up to. */
export function useInvoiceStatus() {
  const { getOrder } = useOrders();
  return (inv: PosInvoice): { key: InvoiceStatusKey; label: string; tone: "green" | "red" | "blue" | "brand" | "muted" } => {
    if (inv.status === "void") return { key: "void", label: "Void", tone: "red" };
    if (inv.saleType === "delivery") return { key: "delivery", label: `Order · ${deliveryStatusLabel(inv.orderId ? getOrder(inv.orderId) : undefined)}`, tone: "blue" };
    const r = returnState(inv);
    if (r === "full") return { key: "refunded", label: "Refunded", tone: "muted" };
    if (r === "partial") return { key: "partial", label: "Part returned", tone: "brand" };
    return { key: "completed", label: "Completed", tone: "green" };
  };
}

export function InvoiceStatusTag({ inv }: { inv: PosInvoice }) {
  const s = useInvoiceStatus()(inv);
  return <Tag tone={s.tone}>{s.label}</Tag>;
}

const VOID_REASONS = ["Wrong item rung up", "Customer cancelled", "Price / discount error", "Duplicate sale", "Other"] as const;

export function VoidInvoiceModal({ invoice, onClose, onVoided }: { invoice: PosInvoice; onClose: () => void; onVoided?: () => void }) {
  const { voidInvoice, mySession } = usePos();
  const toast = useToast();
  const [reason, setReason] = useState<string>("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cash = invoice.saleType === "walk_in" ? invoiceCashNet(invoice) : 0;

  const submit = () => {
    const res = voidInvoice(invoice.id, reason, note);
    if (!res.ok) return setError(res.error);
    toast(`${invoice.invoiceNumber} voided`);
    onVoided?.();
    onClose();
  };

  return (
    <PosModal
      open
      size="sm"
      title={`Void ${invoice.invoiceNumber}`}
      onClose={onClose}
      footer={
        <>
          <GhostBtn onClick={onClose}>Keep sale</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={!reason} style={{ background: "var(--red)" }}>
            Void sale
          </PrimaryBtn>
        </>
      }
    >
      <div className="flex items-start gap-2 rounded-xl p-3 text-[12.5px]" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
        <AlertTriangle size={15} className="mt-0.5 shrink-0" style={{ color: "var(--red)" }} />
        <p>
          {invoice.saleType === "delivery"
            ? "This cancels the linked order and releases its reserved stock. It only works while the order is still Pending or Processing."
            : `Stock goes back on the shelf, the ${money(invoice.total)} of revenue is reversed and this sale's warranties are voided.`}{" "}
          A void can&apos;t be undone and is recorded in the audit log.
        </p>
      </div>
      {cash > 0 && (
        <p className="text-[12.5px]" style={{ color: mySession ? "var(--text-muted)" : "var(--red)" }}>
          {mySession ? `${money(cash)} was paid in cash — it will be recorded as a cash refund in your session ${mySession.sessionNumber}. Hand the customer their money.` : `${money(cash)} was paid in cash. Open a session first so the refund is recorded in a drawer.`}
        </p>
      )}
      <LabeledField label="Reason" required>
        <select value={reason} onChange={(e) => setReason(e.target.value)} className={fieldInput} style={fieldStyle}>
          <option value="">Choose a reason…</option>
          {VOID_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </LabeledField>
      <LabeledField label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={fieldInput} style={fieldStyle} />
      </LabeledField>
      {error && (
        <p className="text-[12.5px]" style={{ color: "var(--red)" }} role="alert">
          {error}
        </p>
      )}
    </PosModal>
  );
}
