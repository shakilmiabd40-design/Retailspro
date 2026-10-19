"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock, Wallet } from "lucide-react";
import { useAccess } from "@/lib/settings/access";
import { formatDateTime } from "@/lib/settings/runtime";
import { usePos } from "@/lib/pos/store";
import { paymentSummary } from "@/lib/pos/utils";
import { Tag } from "@/components/settings/ui";
import { CashMovementModal, CloseSessionModal } from "@/components/pos/session-modals";
import { InvoiceStatusTag } from "@/components/pos/invoice-parts";
import { GhostBtn, Loading, NotFound, PrimaryBtn, money } from "@/components/pos/ui";

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  const { getSession, invoices, returns, summaryFor, hydrated } = usePos();
  const { can, currentUser } = useAccess();
  const [modal, setModal] = useState<null | "cash" | "close">(null);

  if (!hydrated) return <Loading />;
  const s = getSession(id);
  const allowed = s && (s.cashierId === currentUser.id || can("pos", "financial"));
  if (!s || !allowed) return <NotFound what="Session" href="/pos/sessions" label="Back to the cash register" />;

  const sum = summaryFor(s);
  const inv = invoices.filter((i) => i.sessionId === s.id);
  const rets = returns.filter((r) => r.sessionId === s.id);
  const mine = s.cashierId === currentUser.id;
  const closed = s.status === "closed";
  const expected = closed ? (s.expectedCash ?? sum.expectedCash) : sum.expectedCash;

  return (
    <div className="space-y-4">
      <Link href="/pos/sessions" className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> Cash register
      </Link>
      <div className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[19px] font-semibold" style={{ color: "var(--text)" }}>{s.sessionNumber}</h1>
            <Tag tone={closed ? "muted" : "green"}>{closed ? "Closed" : "Open"}</Tag>
          </div>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {s.cashierName} · opened {formatDateTime(s.openedAt)}
            {s.closedAt && ` · closed ${formatDateTime(s.closedAt)}`}
          </p>
        </div>
        {!closed && (
          <div className="flex gap-2">
            {mine && <GhostBtn onClick={() => setModal("cash")}><Wallet size={15} /> Cash in / out</GhostBtn>}
            <PrimaryBtn onClick={() => setModal("close")}><Lock size={15} /> Close session</PrimaryBtn>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="card space-y-1.5 p-4 text-[13px]">
          <p className="mb-1 font-semibold" style={{ color: "var(--text)" }}>Drawer</p>
          <Row label="Opening cash" value={money(sum.openingCash)} />
          <Row label="Cash sales (after change)" value={`+ ${money(sum.cashSales)}`} />
          <Row label="Cash in" value={`+ ${money(sum.cashIn)}`} />
          <Row label="Cash out" value={`− ${money(sum.cashOut - sum.refundsOut)}`} />
          <Row label="Refunds paid in cash" value={`− ${money(sum.refundsOut)}`} />
          <div className="flex justify-between border-t pt-2 font-bold" style={{ borderColor: "var(--border-soft)", color: "var(--text)" }}>
            <span>Expected cash</span>
            <span className="tabular-nums">{money(expected)}</span>
          </div>
          {closed && (
            <>
              <Row label="Counted" value={money(s.countedCash ?? 0)} />
              <div className="flex justify-between font-bold" style={{ color: (s.difference ?? 0) === 0 ? "var(--green)" : "var(--red)" }}>
                <span>{(s.difference ?? 0) === 0 ? "Balanced" : (s.difference ?? 0) < 0 ? "Short" : "Over"}</span>
                <span className="tabular-nums">{money(Math.abs(s.difference ?? 0))}</span>
              </div>
              {s.closingNote && <p style={{ color: "var(--text-muted)" }}>Note: {s.closingNote}</p>}
            </>
          )}
          <div className="border-t pt-2" style={{ borderColor: "var(--border-soft)" }}>
            <Row label="Walk-in sales" value={money(sum.salesTotal)} />
            <Row label="Card" value={money(sum.cardSales)} />
            <Row label="Mobile banking" value={money(sum.mobileSales)} />
            <Row label="Items sold" value={String(sum.itemsSold)} />
            <Row label="Delivery orders created" value={String(sum.deliveryOrders)} />
            <Row label="Voided sales" value={String(sum.voided)} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-4">
            <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text)" }}>Cash movements</p>
            {s.movements.length === 0 ? (
              <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>None.</p>
            ) : (
              <ul className="divide-y text-[13px]" style={{ borderColor: "var(--border-soft)" }}>
                {s.movements.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-2" style={{ borderColor: "var(--border-soft)" }}>
                    <span>
                      <b style={{ color: "var(--text)" }}>{m.reason}</b>
                      <span style={{ color: "var(--text-muted)" }}> · {formatDateTime(m.at)} · {m.by}{m.approvedBy ? ` · approved by ${m.approvedBy}` : ""}{m.note ? ` · ${m.note}` : ""}</span>
                    </span>
                    <span className="tabular-nums font-semibold" style={{ color: m.type === "in" ? "var(--green)" : "var(--red)" }}>{m.type === "in" ? "+" : "−"} {money(m.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card overflow-x-auto">
            <p className="px-4 pt-4 text-[13px] font-semibold" style={{ color: "var(--text)" }}>Sales in this session ({inv.length})</p>
            <table className="mt-2 w-full text-[13px]">
              <tbody>
                {inv.length === 0 && <tr><td className="px-4 pb-4 text-[12.5px]" style={{ color: "var(--text-muted)" }}>No sales yet.</td></tr>}
                {inv.map((i) => (
                  <tr key={i.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-4 py-2"><Link href={`/pos/sales/${i.id}`} className="font-semibold hover:underline" style={{ color: "var(--brand-strong)" }}>{i.invoiceNumber}</Link></td>
                    <td className="px-2 py-2" style={{ color: "var(--text-muted)" }}>{formatDateTime(i.createdAt)}</td>
                    <td className="px-2 py-2" style={{ color: "var(--text-muted)" }}>{paymentSummary(i)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{money(i.total)}</td>
                    <td className="px-4 py-2 text-right"><InvoiceStatusTag inv={i} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {rets.length > 0 && (
            <div className="card p-4">
              <p className="mb-2 text-[13px] font-semibold" style={{ color: "var(--text)" }}>Returns & exchanges processed ({rets.length})</p>
              <ul className="space-y-1 text-[13px]">
                {rets.map((r) => (
                  <li key={r.id}>
                    <Link href={`/pos/returns/${r.id}`} className="font-semibold underline" style={{ color: "var(--brand-strong)" }}>{r.returnNumber}</Link>
                    <span style={{ color: "var(--text-muted)" }}> · {money(r.creditValue)} · refunded {money(r.refundAmount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {modal === "cash" && mine && !closed && <CashMovementModal session={s} onClose={() => setModal(null)} />}
      {modal === "close" && !closed && <CloseSessionModal session={s} onClose={() => setModal(null)} />}
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
