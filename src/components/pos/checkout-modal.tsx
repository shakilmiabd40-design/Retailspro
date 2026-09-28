"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Banknote, CheckCircle2, CreditCard, Loader2, Plus, Smartphone, Store, Trash2, Truck } from "lucide-react";
import { useSettings } from "@/lib/settings/store";
import { usePos } from "@/lib/pos/store";
import { useSaleConfirmation } from "@/lib/pos/use-sale-confirmation";
import type { CartCustomer, CartLine, PosInvoice, PosPaymentMethodKey, SaleDraft, SaleType } from "@/lib/pos/types";
import { PAYMENT_LABELS, checkPayments, computeTotals, discountLimitError, roundMoney } from "@/lib/pos/utils";
import { Chip, GhostBtn, LabeledField, PosModal, PrimaryBtn, fieldInput, fieldStyle, money } from "./ui";
import { DiscountInput } from "./discount-input";
import { detectDistrictArea } from "@/lib/orders/geo";
import { ReceiptDialog } from "./receipt";

interface Row {
  id: string;
  method: PosPaymentMethodKey;
  amount: string;
  reference: string;
}

const METHOD_ICON = { cash: Banknote, card: CreditCard, mobile_banking: Smartphone } as const;
const METHODS: PosPaymentMethodKey[] = ["cash", "card", "mobile_banking"];

interface Props {
  draft: SaleDraft;
  /** The cart with current prices, as resolved by the store. */
  liveLines: CartLine[];
  onCustomer: (patch: Partial<CartCustomer>) => void;
  /** The sale is recorded — empty the cart. */
  onSaleSaved: () => void;
  /** The sale was refused by the server — put the cart back. */
  onRestore: (draft: SaleDraft) => void;
  onClose: () => void;
  /** Which sale type to open on — set by which button on the cart page was pressed. */
  initialSaleType?: SaleType;
}

/** Mounted only while open, so every field starts fresh. */
export function CheckoutModal({ draft, liveLines, onCustomer, onSaleSaved, onRestore, onClose, initialSaleType = "walk_in" }: Props) {
  const { settings } = useSettings();
  const { completeWalkInSale, createDeliverySale, discountPolicy, mySession } = usePos();
  const pos = settings.pos;
  const orders = settings.orders;

  const [saleType, setSaleType] = useState<SaleType>(initialSaleType);
  const walk = useMemo(() => computeTotals(liveLines, draft.cartDiscount, pos.vatPercent, 0), [liveLines, draft.cartDiscount, pos.vatPercent]);

  const [rows, setRows] = useState<Row[]>(() => [{ id: crypto.randomUUID(), method: pos.defaultPaymentMethod, amount: walk.total > 0 ? String(walk.total) : "", reference: "" }]);
  const [notes, setNotes] = useState("");
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [charge, setCharge] = useState<number>(orders.insideCityCharge);
  // Whenever the customer is charged ৳0 for delivery, the courier still bills the shop for it — this
  // records that real charge as a loss instead of silently assuming it was ৳0 too.
  const [courierEstimate, setCourierEstimate] = useState(0);
  const [district, setDistrict] = useState("");
  const [area, setArea] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<{ id: string; at: number } | null>(null);
  const [recorded, setRecorded] = useState<{ invoice: PosInvoice; orderId?: string } | null>(null);
  const [printAnyway, setPrintAnyway] = useState(false);
  const snapshot = useRef<SaleDraft>(draft);
  const state = useSaleConfirmation(pending);

  // The order discount typed at checkout joins the cart discount — same rule the store applies when saving —
  // so the live total, the discount-limit check and the final invoice always agree.
  const delivery = useMemo(() => computeTotals(liveLines, draft.cartDiscount, 0, charge), [liveLines, draft.cartDiscount, charge]);
  const deliveryWithDiscount = useMemo(
    () => (orderDiscount > 0 ? computeTotals(liveLines, { type: "fixed", value: delivery.cartDiscount + orderDiscount }, 0, charge) : delivery),
    [liveLines, delivery, orderDiscount, charge]
  );
  const totals = saleType === "walk_in" ? walk : deliveryWithDiscount;

  const payments = rows.map((r) => ({ method: r.method, amount: parseFloat(r.amount) || 0, reference: r.reference.trim() || undefined }));
  const check = checkPayments(payments, walk.total);
  const limitError = discountLimitError(totals, discountPolicy.cap);
  const c = draft.customer;

  useEffect(() => {
    const detected = detectDistrictArea(c.address);
    if (detected.district && !district) setDistrict(detected.district);
    if (detected.area && !area) setArea(detected.area);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.address]);

  const blocker: string | null = (() => {
    if (!mySession) return "Open a session first.";
    if (limitError) return limitError;
    if (saleType === "walk_in") {
      if (pos.requirePhoneForWarranty && !c.phone.trim()) return "Customer phone is required (warranty is linked to it).";
      if (walk.total > 0 && !check.ok) return check.error;
      return null;
    }
    if (!c.name.trim()) return "Customer name is required for a delivery order.";
    if (!c.phone.trim()) return "Customer phone is required for a delivery order.";
    if (!c.address.trim()) return "Delivery address is required.";
    return null;
  })();

  // The cart is emptied only once the server has confirmed the sale.
  useEffect(() => {
    if (state === "saved") onSaleSaved();
  }, [state, onSaleSaved]);

  const submit = () => {
    setError(null);
    snapshot.current = draft;
    if (saleType === "walk_in") {
      const res = completeWalkInSale(draft, walk.total > 0 ? payments : [], notes);
      if (!res.ok) return setError(res.error);
      setRecorded({ invoice: res.invoice });
      setPending({ id: res.invoice.id, at: Date.parse(res.invoice.createdAt) });
    } else {
      const res = createDeliverySale(draft, { deliveryCharge: charge, district, area, notes, orderDiscount, freeDeliveryCourierCost: charge === 0 ? courierEstimate : undefined });
      if (!res.ok) return setError(res.error);
      setRecorded({ invoice: res.invoice, orderId: res.order.id });
      setPending({ id: res.invoice.id, at: Date.parse(res.invoice.createdAt) });
    }
  };

  const setRow = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const single = rows.length === 1;
  const step = (n: number) => Math.ceil(walk.total / n) * n;
  const quick = [...new Set([step(50), step(100), step(500), step(1000)])].filter((n) => n > walk.total).slice(0, 3);

  // ---- after the sale is recorded --------------------------------------------------------
  if (pending && recorded) {
    const restore = () => {
      onRestore(snapshot.current);
      onClose();
    };
    if (state === "failed") {
      return (
        <PosModal open title="Sale not saved" onClose={restore} size="sm" footer={<PrimaryBtn onClick={restore}>Back to cart</PrimaryBtn>}>
          <div className="flex items-start gap-3 rounded-xl p-3 text-[13px]" style={{ background: "var(--red-soft, rgba(220,38,38,0.08))", color: "var(--red)" }}>
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p>
              Someone else changed the same stock at the same moment, so the server refused this sale and <b>nothing was recorded</b> — no stock taken, no money to count. Your cart is untouched: check it and complete the sale again.
            </p>
          </div>
        </PosModal>
      );
    }
    if (state === "saved" || printAnyway) {
      const inv = recorded.invoice;
      const isDelivery = inv.saleType === "delivery";
      return (
        <ReceiptDialog
          invoice={inv}
          onClose={onClose}
          banner={
            <>
              <div className="flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium" style={{ background: "var(--green-soft, rgba(22,163,74,0.1))", color: "var(--green)" }}>
                <CheckCircle2 size={16} />
                {isDelivery ? `Order ${inv.orderNumber} created · COD ${money(inv.total)}` : inv.change > 0 ? `Sale complete · give change ${money(inv.change)}` : "Sale complete"}
              </div>
              {state !== "saved" && (
                <p className="px-4 py-2 text-[12px]" style={{ background: "var(--amber-soft, rgba(217,119,6,0.1))", color: "var(--amber, #b45309)" }}>
                  Still waiting for the server to confirm this sale. If it is refused, you&apos;ll be told and the cart comes back.
                </p>
              )}
            </>
          }
          extra={
            <>
              {isDelivery && recorded.orderId && (
                <Link href={`/orders/${recorded.orderId}`} className="focus-ring flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                  View order
                </Link>
              )}
              <button onClick={onClose} className="focus-ring w-full rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
                New sale
              </button>
            </>
          }
        />
      );
    }
    return (
      <PosModal open locked title="Saving sale…" onClose={() => {}} size="sm">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <Loader2 size={28} className="animate-spin" style={{ color: "var(--brand)" }} />
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {state === "slow" ? "Still waiting for the server — are you offline? The sale is not confirmed yet." : "Recording the sale…"}
          </p>
          {state === "slow" && (
            <GhostBtn
              onClick={() => {
                onSaleSaved();
                setPrintAnyway(true);
              }}
            >
              Print anyway
            </GhostBtn>
          )}
        </div>
      </PosModal>
    );
  }

  // ---- the form -----------------------------------------------------------------------------
  const done = walk.total <= 0 || check.ok;
  return (
    <PosModal
      open
      size="lg"
      title="Checkout"
      onClose={onClose}
      footer={
        <>
          <GhostBtn onClick={onClose}>Back to cart</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={!!blocker} className="min-w-44" title={blocker ?? undefined}>
            {saleType === "walk_in" ? `Complete sale · ${money(totals.total)}` : `Create order · COD ${money(totals.total)}`}
          </PrimaryBtn>
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Sale type">
            {(
              [
                { v: "walk_in", label: "Walk-in sale", sub: "Paid now · stock deducted", icon: Store },
                { v: "delivery", label: "Delivery order", sub: "COD courier · goes to Orders", icon: Truck },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                role="radio"
                aria-checked={saleType === o.v}
                onClick={() => {
                  setSaleType(o.v);
                  setError(null);
                }}
                className="focus-ring flex items-center gap-3 rounded-xl border p-3 text-left"
                style={{ borderColor: saleType === o.v ? "var(--brand)" : "var(--border)", background: saleType === o.v ? "var(--brand-soft)" : "var(--surface)" }}
              >
                <o.icon size={20} style={{ color: saleType === o.v ? "var(--brand-strong)" : "var(--text-faint)" }} />
                <span>
                  <span className="block text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                    {o.label}
                  </span>
                  <span className="block text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                    {o.sub}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {saleType === "walk_in" ? (
            <div className="space-y-3">
              {walk.total <= 0 ? (
                <p className="rounded-xl p-3 text-[13px]" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                  Nothing to pay — the total is {money(0)}.
                </p>
              ) : (
                <>
                  {rows.map((r, idx) => (
                    <div key={r.id} className="space-y-2 rounded-xl border p-3" style={{ borderColor: "var(--border-soft)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-1.5">
                          {METHODS.map((m) => {
                            const Icon = METHOD_ICON[m];
                            return (
                              <Chip key={m} active={r.method === m} onClick={() => setRow(r.id, { method: m })}>
                                <span className="flex items-center gap-1.5">
                                  <Icon size={13} /> {PAYMENT_LABELS[m]}
                                </span>
                              </Chip>
                            );
                          })}
                        </div>
                        {!single && (
                          <button aria-label="Remove payment" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} style={{ color: "var(--text-faint)" }}>
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <LabeledField label={single ? "Paid amount" : `Payment ${idx + 1} amount`}>
                          <input
                            autoFocus={idx === 0}
                            value={r.amount}
                            inputMode="decimal"
                            onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setRow(r.id, { amount: e.target.value })}
                            onKeyDown={(e) => e.key === "Enter" && !blocker && submit()}
                            className={`${fieldInput} text-[15px] font-semibold tabular-nums`}
                            style={fieldStyle}
                          />
                        </LabeledField>
                        {r.method !== "cash" && (
                          <LabeledField label={r.method === "card" ? "Card last 4 / ref" : "Transaction ID"}>
                            <input value={r.reference} onChange={(e) => setRow(r.id, { reference: e.target.value })} className={fieldInput} style={fieldStyle} />
                          </LabeledField>
                        )}
                      </div>
                      {single && r.method === "cash" && (
                        <div className="flex flex-wrap gap-1.5">
                          <Chip onClick={() => setRow(r.id, { amount: String(walk.total) })}>Exact</Chip>
                          {quick.map((n) => (
                            <Chip key={n} onClick={() => setRow(r.id, { amount: String(n) })}>
                              {money(n)}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {pos.allowSplitPayment && (
                    <GhostBtn
                      onClick={() =>
                        setRows((rs) => [
                          ...rs,
                          { id: crypto.randomUUID(), method: rs.some((x) => x.method === "cash") ? "card" : "cash", amount: check.balance > 0 ? String(check.balance) : "", reference: "" },
                        ])
                      }
                    >
                      <Plus size={14} /> Split payment
                    </GhostBtn>
                  )}
                </>
              )}
              <LabeledField label="Notes (optional)">
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldInput} style={fieldStyle} />
              </LabeledField>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <LabeledField label="Customer name" required>
                  <input value={c.name} onChange={(e) => onCustomer({ name: e.target.value, walkIn: false })} className={fieldInput} style={fieldStyle} />
                </LabeledField>
                <LabeledField label="Phone" required>
                  <input value={c.phone} inputMode="tel" onChange={(e) => onCustomer({ phone: e.target.value, walkIn: false })} className={fieldInput} style={fieldStyle} />
                </LabeledField>
              </div>
              <LabeledField label="Delivery address" required>
                <textarea value={c.address} rows={2} onChange={(e) => onCustomer({ address: e.target.value, walkIn: false })} className={fieldInput} style={fieldStyle} />
              </LabeledField>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <LabeledField label="District">
                  <input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. Dhaka" className={fieldInput} style={fieldStyle} />
                </LabeledField>
                <LabeledField label="Area">
                  <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Mirpur" className={fieldInput} style={fieldStyle} />
                </LabeledField>
              </div>
              <LabeledField label="Customer delivery charge">
                <input
                  type="number"
                  min={0}
                  value={charge}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value) || 0);
                    setCharge(v);
                    if (v > 0) setCourierEstimate(0);
                  }}
                  className={fieldInput}
                  style={fieldStyle}
                />
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  <Chip
                    active={charge === orders.insideCityCharge}
                    onClick={() => {
                      setCharge(orders.insideCityCharge);
                      setCourierEstimate(0);
                    }}
                  >
                    Inside city {money(orders.insideCityCharge)}
                  </Chip>
                  <Chip
                    active={charge === orders.subCityCharge}
                    onClick={() => {
                      setCharge(orders.subCityCharge);
                      setCourierEstimate(0);
                    }}
                  >
                    Dhaka Sub {money(orders.subCityCharge)}
                  </Chip>
                  <Chip
                    active={charge === orders.outsideCityCharge}
                    onClick={() => {
                      setCharge(orders.outsideCityCharge);
                      setCourierEstimate(0);
                    }}
                  >
                    Outside city {money(orders.outsideCityCharge)}
                  </Chip>
                  {/* Eligibility is based on the delivery cart itself, not the walk-in cart. */}
                  {orders.freeDeliveryEnabled && delivery.subtotal - delivery.discountTotal >= orders.freeDeliveryMinSubtotal && (
                    <Chip
                      active={charge === 0}
                      onClick={() => {
                        setCharge(0);
                        setCourierEstimate((v) => v || orders.insideCityCharge);
                      }}
                    >
                      Free delivery
                    </Chip>
                  )}
                </span>
                {charge === 0 && (
                  <div className="mt-2 rounded-lg border p-2.5" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                    <label className="text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>
                      Courier still charges this much (৳) — counted as a loss, not charged to the customer
                    </label>
                    <input type="number" min={0} value={courierEstimate} onChange={(e) => setCourierEstimate(Math.max(0, Number(e.target.value) || 0))} className={`${fieldInput} mt-1`} style={fieldStyle} />
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      <Chip active={courierEstimate === orders.insideCityCharge} onClick={() => setCourierEstimate(orders.insideCityCharge)}>
                        Inside city {money(orders.insideCityCharge)}
                      </Chip>
                      <Chip active={courierEstimate === orders.subCityCharge} onClick={() => setCourierEstimate(orders.subCityCharge)}>
                        Dhaka Sub {money(orders.subCityCharge)}
                      </Chip>
                      <Chip active={courierEstimate === orders.outsideCityCharge} onClick={() => setCourierEstimate(orders.outsideCityCharge)}>
                        Outside city {money(orders.outsideCityCharge)}
                      </Chip>
                    </span>
                  </div>
                )}
              </LabeledField>
              <LabeledField label="Order discount">
                <DiscountInput
                  label="Order discount"
                  type="fixed"
                  value={orderDiscount}
                  onCommit={(t, v) => {
                    setOrderDiscount(v);
                    return { type: t, value: v };
                  }}
                  width="w-full"
                />
              </LabeledField>
              <LabeledField label="Notes (optional)" hint="Courier details are added later, when the order is processed.">
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className={fieldInput} style={fieldStyle} />
              </LabeledField>
              {pos.vatPercent > 0 && (
                <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                  VAT isn&apos;t added to delivery orders — the Orders module has no tax line.
                </p>
              )}
            </div>
          )}
        </div>

        <aside className="h-fit space-y-2 rounded-xl p-4 text-[13px]" style={{ background: "var(--surface-2)" }}>
          <Line label="Subtotal" value={money(totals.subtotal)} />
          {totals.discountTotal > 0 && (
            <Line
              label={saleType === "delivery" && orderDiscount > 0 ? `Discount (incl. ৳${orderDiscount.toLocaleString()} order discount)` : "Discount"}
              value={`− ${money(totals.discountTotal)}`}
              green
            />
          )}
          {totals.vat > 0 && <Line label={`VAT (${pos.vatPercent}%)`} value={money(totals.vat)} />}
          {saleType === "delivery" && <Line label="Delivery charge" value={money(charge)} />}
          {saleType === "delivery" && charge === 0 && courierEstimate > 0 && <Line label="Free delivery — courier cost (loss, not part of COD)" value={money(courierEstimate)} />}
          <div className="flex items-baseline justify-between border-t pt-2" style={{ borderColor: "var(--border)" }}>
            <span className="font-semibold" style={{ color: "var(--text)" }}>
              {saleType === "walk_in" ? "Total" : "Expected COD"}
            </span>
            <span className="text-[20px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
              {money(totals.total)}
            </span>
          </div>
          {saleType === "walk_in" && walk.total > 0 && (
            <>
              <Line label="Paid" value={money(check.tendered)} />
              {check.balance > 0 ? <Line label="Still due" value={money(check.balance)} red /> : <Line label="Change" value={money(roundMoney(check.change))} green={check.change > 0} />}
            </>
          )}
          {saleType === "delivery" && <p className="pt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>Stock is reserved now; the courier collects the COD.</p>}
        </aside>
      </div>

      {(error || (blocker && (limitError || saleType === "delivery" || (pos.requirePhoneForWarranty && !c.phone.trim())))) && (
        <p className="flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px]" style={{ background: "var(--red-soft, rgba(220,38,38,0.08))", color: "var(--red)" }} role="alert">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {error ?? blocker}
        </p>
      )}
      {!done && saleType === "walk_in" && check.error && !error && (
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {check.error}
        </p>
      )}
    </PosModal>
  );
}

function Line({ label, value, green, red }: { label: string; value: string; green?: boolean; red?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="tabular-nums" style={{ color: red ? "var(--red)" : green ? "var(--green)" : "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}
