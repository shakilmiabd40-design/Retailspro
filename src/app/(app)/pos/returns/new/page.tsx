"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Printer, Search } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { useSettings } from "@/lib/settings/store";
import { useAccess } from "@/lib/settings/access";
import { formatDateTime } from "@/lib/settings/runtime";
import { useToast } from "@/components/toast";
import { usePos } from "@/lib/pos/store";
import { useCart } from "@/lib/pos/use-cart";
import type { PosInvoice, PosPaymentMethodKey, PosReturn, RefundMethod, ReturnCondition } from "@/lib/pos/types";
import { PAYMENT_LABELS, REFUND_LABELS, RETURN_REASONS, checkPayments, computeTotals, discountLimitError, invoiceMatches, isWithinReturnWindow, refundValueFor, remainingQty, returnState, roundMoney } from "@/lib/pos/utils";
import { ProductBrowser, type BrowserView } from "@/components/pos/product-browser";
import { CartPanel, cartRows } from "@/components/pos/cart-panel";
import { ReceiptDialog } from "@/components/pos/receipt";
import { Chip, GhostBtn, LabeledField, Loading, PrimaryBtn, fieldInput, fieldStyle, money } from "@/components/pos/ui";

interface LineState {
  qty: string;
  reason: string;
  condition: ReturnCondition;
}

function ReturnFlow() {
  const params = useSearchParams();
  const { products } = useProducts();
  const { settings } = useSettings();
  const { currentUser } = useAccess();
  const toast = useToast();
  const pos = usePos();
  const { invoices, mySession, hydrated, discountPolicy } = pos;

  const [invoiceId, setInvoiceId] = useState(params.get("invoice") ?? "");
  const [q, setQ] = useState("");
  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [exchange, setExchange] = useState(false);
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("cash");
  const [payMethod, setPayMethod] = useState<PosPaymentMethodKey>(settings.pos.defaultPaymentMethod);
  const [payText, setPayText] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ ret: PosReturn; exchangeInvoice?: PosInvoice } | null>(null);
  const [receipt, setReceipt] = useState(false);
  const [view, setView] = useState<BrowserView>("list");
  const searchRef = useRef<HTMLInputElement>(null);

  const cart = useCart({ userId: currentUser.id, userName: currentUser.name, policy: discountPolicy, persist: false });
  const inv = invoices.find((i) => i.id === invoiceId);

  const candidates = useMemo(() => {
    const s = q.trim().toLowerCase();
    const eligible = invoices.filter((i) => i.status === "completed" && i.saleType === "walk_in" && returnState(i) !== "full");
    if (!s) return eligible.slice(0, 6);
    const skus = new Set<string>();
    for (const p of products) for (const v of p.variants) if (v.barcode?.toLowerCase() === s || v.sku.toLowerCase() === s) skus.add(v.sku.toLowerCase());
    return eligible.filter((i) => invoiceMatches(i, s) || i.items.some((it) => skus.has(it.sku.toLowerCase()))).slice(0, 10);
  }, [invoices, products, q]);

  if (!hydrated) return <Loading />;

  // ---- finished ------------------------------------------------------------------------------
  if (done) {
    const { ret, exchangeInvoice } = done;
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <div className="card flex flex-col items-center gap-3 p-8 text-center">
          <CheckCircle2 size={34} style={{ color: "var(--green)" }} />
          <p className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
            {ret.type === "exchange" ? "Exchange" : "Return"} {ret.returnNumber} recorded
          </p>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {ret.items.reduce((s, i) => s + i.qty, 0)} item(s) taken back · {money(ret.creditValue)}
            {exchangeInvoice && ` · exchanged for ${exchangeInvoice.invoiceNumber} (${money(exchangeInvoice.total)})`}
          </p>
          {ret.refundAmount > 0 ? (
            <p className="text-[15px] font-bold" style={{ color: "var(--text)" }}>
              Refund {money(ret.refundAmount)} · {REFUND_LABELS[ret.refundMethod]}
            </p>
          ) : exchangeInvoice && (ret.customerPaid ?? 0) > 0 ? (
            <p className="text-[15px] font-bold" style={{ color: "var(--text)" }}>Customer paid {money(ret.customerPaid ?? 0)} extra</p>
          ) : null}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {exchangeInvoice && (
              <GhostBtn onClick={() => setReceipt(true)}>
                <Printer size={15} /> Print exchange receipt
              </GhostBtn>
            )}
            <Link href={`/pos/returns/${ret.id}`} className="focus-ring flex items-center rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              View record
            </Link>
            <Link href="/pos/returns" className="focus-ring flex items-center rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
              Done
            </Link>
          </div>
        </div>
        {receipt && exchangeInvoice && <ReceiptDialog invoice={exchangeInvoice} onClose={() => setReceipt(false)} />}
      </div>
    );
  }

  // ---- numbers -----------------------------------------------------------------------------------
  const items = inv?.items.filter((i) => remainingQty(i) > 0) ?? [];
  const picked = items
    .map((i) => ({ item: i, st: lines[i.id], qty: Math.min(remainingQty(i), Math.max(0, parseInt(lines[i.id]?.qty ?? "0", 10) || 0)) }))
    .filter((x) => x.qty > 0);
  const credit = roundMoney(picked.reduce((s, x) => s + refundValueFor(x.item, x.qty), 0));

  const resolved = pos.resolveDraft(cart.draft.lines);
  const newTotals = computeTotals(resolved.lines, cart.draft.cartDiscount, settings.pos.vatPercent, 0);
  const rows = cartRows(cart.draft.lines, resolved.lines, products);
  const limitError = discountLimitError(newTotals, discountPolicy.cap);
  const newProblems = [...(limitError ? [limitError] : []), ...resolved.problems];

  const diff = exchange ? roundMoney(newTotals.total - credit) : -credit;
  const owed = Math.max(0, diff);
  const refund = Math.max(0, -diff);
  const payAmount = payText.trim() === "" ? owed : parseFloat(payText) || 0;
  const payCheck = checkPayments([{ method: "exchange_credit", amount: Math.min(credit, newTotals.total) }, ...(owed > 0 ? [{ method: payMethod, amount: payAmount }] : [])], newTotals.total);

  const windowOk = !inv || isWithinReturnWindow(inv, settings.pos.returnWindowDays);
  const missingReason = picked.find((x) => !x.st?.reason);

  const blocker = (() => {
    if (!mySession) return "Open a session first — a return moves money, so it must be recorded in a drawer.";
    if (!inv) return "Find the sale first.";
    if (!windowOk && !discountPolicy.canOverride) return `This sale is outside the ${settings.pos.returnWindowDays}-day return window.`;
    if (picked.length === 0) return "Choose the items coming back.";
    if (missingReason) return `Pick a reason for ${missingReason.item.productName}.`;
    if (exchange) {
      if (cart.draft.lines.length === 0) return "Add the new item(s) the customer is taking.";
      if (newProblems.length) return newProblems[0];
      if (owed > 0 && !payCheck.ok) return payCheck.error;
    }
    return null;
  })();

  const setLine = (id: string, patch: Partial<LineState>) =>
    setLines((l) => ({ ...l, [id]: { qty: l[id]?.qty ?? "", reason: l[id]?.reason ?? "", condition: l[id]?.condition ?? "resellable", ...patch } }));

  const submit = () => {
    if (!inv) return;
    setError(null);
    const res = pos.processReturn({
      invoiceId: inv.id,
      lines: picked.map((x) => ({ invoiceItemId: x.item.id, qty: x.qty, reason: x.st?.reason ?? "", condition: x.st?.condition ?? "resellable" })),
      refundMethod,
      notes,
      exchange: exchange ? { draft: cart.draft, payments: owed > 0 ? [{ method: payMethod, amount: payAmount }] : [] } : undefined,
    });
    if (!res.ok) return setError(res.error);
    toast(`${res.ret.returnNumber} recorded`);
    setDone({ ret: res.ret, exchangeInvoice: res.exchangeInvoice });
  };

  return (
    <div className="space-y-4">
      <Link href="/pos/returns" className="inline-flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} /> POS returns
      </Link>
      <h1 className="text-[19px] font-semibold" style={{ color: "var(--text)" }}>New return / exchange</h1>

      {!mySession && (
        <div className="flex items-start gap-2 rounded-xl p-4 text-[13px]" style={{ background: "var(--amber-soft, rgba(217,119,6,0.1))", color: "var(--text)" }}>
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            You have no open session. <Link href="/pos" className="underline">Open one on the New Sale screen</Link> first — a refund or exchange payment must land in a drawer.
          </span>
        </div>
      )}

      {/* 1 · find the sale */}
      <section className="card space-y-3 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>1 · Find the sale</p>
        {inv ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl p-3 text-[13px]" style={{ background: "var(--surface-2)" }}>
            <span>
              <Link href={`/pos/sales/${inv.id}`} className="font-semibold underline" style={{ color: "var(--brand-strong)" }}>{inv.invoiceNumber}</Link>
              <span style={{ color: "var(--text-muted)" }}> · {formatDateTime(inv.createdAt)} · {inv.customer.walkIn ? "Walk-in" : `${inv.customer.name}${inv.customer.phone ? ` · ${inv.customer.phone}` : ""}`} · {money(inv.total)}</span>
            </span>
            <button onClick={() => { setInvoiceId(""); setLines({}); }} className="text-[12.5px] underline" style={{ color: "var(--text-muted)" }}>Change</button>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-faint)" }} />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice no, customer phone, or scan an item barcode" className={`${fieldInput} pl-9`} style={fieldStyle} aria-label="Find the sale" />
            </div>
            <ul className="divide-y rounded-xl border" style={{ borderColor: "var(--border-soft)" }}>
              {candidates.length === 0 && <li className="p-4 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>No returnable walk-in sale matches.</li>}
              {candidates.map((i) => (
                <li key={i.id} style={{ borderColor: "var(--border-soft)" }}>
                  <button onClick={() => setInvoiceId(i.id)} className="focus-ring flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13px]">
                    <span>
                      <b style={{ color: "var(--text)" }}>{i.invoiceNumber}</b>
                      <span style={{ color: "var(--text-muted)" }}> · {i.customer.walkIn ? "Walk-in" : i.customer.name}{i.customer.phone ? ` · ${i.customer.phone}` : ""} · {formatDateTime(i.createdAt)}</span>
                    </span>
                    <span className="tabular-nums" style={{ color: "var(--text)" }}>{money(i.total)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>Only completed walk-in sales can be returned here. Delivery sales are returned through Orders / Returns.</p>
          </>
        )}
        {inv && !windowOk && (
          <p className="text-[12.5px]" style={{ color: discountPolicy.canOverride ? "var(--text-muted)" : "var(--red)" }}>
            This sale is outside the {settings.pos.returnWindowDays}-day return window.{discountPolicy.canOverride ? " You can override it." : " Only someone with “Override limits” can take it back."}
          </p>
        )}
      </section>

      {inv && (
        <>
          {/* 2 · items */}
          <section className="card overflow-x-auto p-5">
            <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>2 · Items coming back</p>
            {items.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Everything on this sale has already been returned.</p>
            ) : (
              <table className="w-full min-w-[640px] text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                    <th className="pb-2">Item</th>
                    <th className="pb-2 text-right">Sold</th>
                    <th className="pb-2 pl-3">Return qty</th>
                    <th className="pb-2 pl-3">Reason</th>
                    <th className="pb-2 pl-3">Condition</th>
                    <th className="pb-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => {
                    const st = lines[i.id];
                    const left = remainingQty(i);
                    const qty = Math.min(left, Math.max(0, parseInt(st?.qty ?? "0", 10) || 0));
                    return (
                      <tr key={i.id} className="border-t align-middle" style={{ borderColor: "var(--border-soft)" }}>
                        <td className="py-2.5 pr-2">
                          <p className="font-medium" style={{ color: "var(--text)" }}>{i.productName}</p>
                          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>{i.color} / {i.size}</p>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{left}{i.returnedQty > 0 && <span className="text-[11px]" style={{ color: "var(--text-faint)" }}> of {i.qty}</span>}</td>
                        <td className="py-2.5 pl-3">
                          <input aria-label={`Return quantity for ${i.productName}`} inputMode="numeric" value={st?.qty ?? ""} placeholder="0" onChange={(e) => setLine(i.id, { qty: e.target.value.replace(/\D/g, "").slice(0, 4) })} onBlur={() => qty !== (parseInt(st?.qty ?? "0", 10) || 0) && setLine(i.id, { qty: String(qty) })} className={`${fieldInput} !w-16 text-center`} style={fieldStyle} />
                        </td>
                        <td className="py-2.5 pl-3">
                          <select aria-label={`Reason for ${i.productName}`} value={st?.reason ?? ""} onChange={(e) => setLine(i.id, { reason: e.target.value })} className={`${fieldInput} !py-1.5`} style={fieldStyle}>
                            <option value="">Reason…</option>
                            {RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}
                          </select>
                        </td>
                        <td className="py-2.5 pl-3">
                          <select aria-label={`Condition of ${i.productName}`} value={st?.condition ?? "resellable"} onChange={(e) => setLine(i.id, { condition: e.target.value as ReturnCondition })} className={`${fieldInput} !py-1.5`} style={fieldStyle}>
                            <option value="resellable">Resellable</option>
                            <option value="damaged">Damaged</option>
                          </select>
                        </td>
                        <td className="py-2.5 text-right tabular-nums" style={{ color: "var(--text)" }}>{qty > 0 ? money(refundValueFor(i, qty)) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              Resellable items go back into stock; damaged ones don&apos;t. Credit is what the customer actually paid for them (after discounts, with VAT).
            </p>
          </section>

          {/* 3 · exchange */}
          <section className="card space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>3 · Exchange for other items <span className="font-normal" style={{ color: "var(--text-faint)" }}>(optional)</span></p>
              <div className="flex gap-1.5">
                <Chip active={!exchange} onClick={() => setExchange(false)}>Refund only</Chip>
                <Chip active={exchange} onClick={() => setExchange(true)}>Exchange</Chip>
              </div>
            </div>
            {exchange && (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="flex h-[440px] min-w-0 flex-col">
                  <ProductBrowser products={products} draft={cart.draft} scanEnabled={settings.pos.enableBarcodeScan} beepOnScan={false} captureKeys={false} view={view} onViewChange={setView} searchRef={searchRef} onAdd={cart.addVariant} />
                </div>
                <div className="card flex min-h-[440px] min-w-0 flex-col overflow-hidden">
                  <p className="border-b px-4 py-2.5 text-[13px] font-semibold" style={{ borderColor: "var(--border-soft)", color: "var(--text)" }}>New items</p>
                  <CartPanel
                    rows={rows}
                    totals={newTotals}
                    cartDiscount={cart.draft.cartDiscount}
                    vatPercent={settings.pos.vatPercent}
                    disabled={false}
                    problems={newProblems}
                    onQty={cart.setQty}
                    onRemove={cart.remove}
                    onLineDiscount={(id, t, v, base) => cart.commitDiscount({ kind: "line", variantId: id }, t, v, base)}
                    onCartDiscount={(t, v, base) => cart.commitDiscount({ kind: "cart" }, t, v, base)}
                  />
                </div>
              </div>
            )}
          </section>

          {/* 4 · money */}
          <section className="card space-y-4 p-5">
            <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>4 · Money</p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5 rounded-xl p-4 text-[13px]" style={{ background: "var(--surface-2)" }}>
                <Line label="Value of items coming back" value={money(credit)} />
                {exchange && <Line label="New items" value={`− ${money(newTotals.total)}`} />}
                <div className="flex justify-between border-t pt-2 text-[15px] font-bold" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                  <span>{owed > 0 ? "Customer pays" : refund > 0 ? "Refund to customer" : "Even swap"}</span>
                  <span className="tabular-nums">{money(owed > 0 ? owed : refund)}</span>
                </div>
              </div>

              <div className="space-y-3">
                {owed > 0 ? (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {(["cash", "card", "mobile_banking"] as const).map((m) => (
                        <Chip key={m} active={payMethod === m} onClick={() => setPayMethod(m)}>{PAYMENT_LABELS[m]}</Chip>
                      ))}
                    </div>
                    <LabeledField label="Amount received" hint={payCheck.change > 0 ? `Give change ${money(payCheck.change)}` : undefined}>
                      <input value={payText} placeholder={String(owed)} inputMode="decimal" onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setPayText(e.target.value)} className={`${fieldInput} tabular-nums`} style={fieldStyle} />
                    </LabeledField>
                  </>
                ) : refund > 0 ? (
                  <LabeledField label="Refund method">
                    <select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value as RefundMethod)} className={fieldInput} style={fieldStyle}>
                      {(Object.keys(REFUND_LABELS) as RefundMethod[]).map((m) => <option key={m} value={m}>{REFUND_LABELS[m]}</option>)}
                    </select>
                  </LabeledField>
                ) : (
                  <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No money changes hands.</p>
                )}
                <LabeledField label="Notes (optional)">
                  <input value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldInput} style={fieldStyle} />
                </LabeledField>
              </div>
            </div>

            {(error || blocker) && (
              <p className="flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "var(--red-soft, rgba(220,38,38,0.08))", color: "var(--red)" }} role="alert">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error ?? blocker}
              </p>
            )}
            <div className="flex justify-end">
              <PrimaryBtn disabled={!!blocker} onClick={submit} className="min-w-52">
                {exchange ? "Complete exchange" : `Complete return${refund > 0 ? ` · refund ${money(refund)}` : ""}`}
              </PrimaryBtn>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="tabular-nums" style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}

export default function NewPosReturnPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ReturnFlow />
    </Suspense>
  );
}
