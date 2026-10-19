"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatDateTime } from "@/lib/settings/runtime";
import { usePos } from "@/lib/pos/store";
import { REFUND_LABELS } from "@/lib/pos/utils";
import { Loading, NotFound, money } from "@/components/pos/ui";
import { Tag } from "@/components/settings/ui";

export default function PosReturnPage() {
  const { id } = useParams<{ id: string }>();
  const { getReturn, hydrated } = usePos();
  if (!hydrated) return <Loading />;
  const r = getReturn(id);
  if (!r) return <NotFound what="Return" href="/pos/returns" label="Back to POS returns" />;

  return (
    <div className="space-y-4">
      <Link href="/pos/returns" className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> POS returns
      </Link>
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[19px] font-semibold" style={{ color: "var(--text)" }}>{r.returnNumber}</h1>
          <Tag tone={r.type === "exchange" ? "blue" : "brand"}>{r.type === "exchange" ? "Exchange" : "Return"}</Tag>
        </div>
        <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          {formatDateTime(r.createdAt)} · processed by {r.processedBy} · original sale{" "}
          <Link href={`/pos/sales/${r.invoiceId}`} className="underline">{r.invoiceNumber}</Link> · {r.customerName}
          {r.customerPhone ? ` · ${r.customerPhone}` : ""}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                <th className="px-4 py-2.5">Item</th>
                <th className="px-2 py-2.5 text-right">Qty</th>
                <th className="px-2 py-2.5">Reason</th>
                <th className="px-2 py-2.5">Condition</th>
                <th className="px-4 py-2.5 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((i) => (
                <tr key={i.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-4 py-2.5">
                    <p className="font-medium" style={{ color: "var(--text)" }}>{i.productName}</p>
                    <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{i.color} / {i.size} · {i.sku}</p>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{i.qty}</td>
                  <td className="px-2 py-2.5">{i.reason}</td>
                  <td className="px-2 py-2.5">
                    <Tag tone={i.condition === "resellable" ? "green" : "red"}>{i.condition === "resellable" ? "Resellable · back in stock" : "Damaged · not restocked"}</Tag>
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">{money(i.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card space-y-1.5 p-4 text-[13px]">
          <Row label="Value taken back" value={money(r.creditValue)} />
          {r.exchangeInvoiceId && (
            <>
              <Row label={`New items (${r.exchangeInvoiceNumber})`} value={money(r.exchangeTotal ?? 0)} />
              {(r.customerPaid ?? 0) > 0 && <Row label="Customer paid extra" value={money(r.customerPaid ?? 0)} />}
              <Link href={`/pos/sales/${r.exchangeInvoiceId}`} className="block pt-1 text-[12.5px] underline" style={{ color: "var(--brand-strong)" }}>View the exchange sale</Link>
            </>
          )}
          <div className="flex justify-between border-t pt-2 font-bold" style={{ borderColor: "var(--border-soft)", color: "var(--text)" }}>
            <span>Refunded{r.refundAmount > 0 ? ` · ${REFUND_LABELS[r.refundMethod]}` : ""}</span>
            <span className="tabular-nums">{money(r.refundAmount)}</span>
          </div>
          {r.notes && <p className="pt-1" style={{ color: "var(--text-muted)" }}>Note: {r.notes}</p>}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="tabular-nums" style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}
