import type {
  CartCustomer,
  CartDiscount,
  CartLine,
  DiscountType,
  PaymentMethod,
  PosInvoice,
  PosInvoiceItem,
  PosPayment,
  PosReturn,
  PosSession,
  RefundMethod,
  SaleDraft,
} from "./types";
import type { Order } from "@/lib/orders/types";
import { runtime } from "@/lib/settings/runtime";

// ---- labels -----------------------------------------------------------------

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  card: "Card",
  mobile_banking: "Mobile banking",
  exchange_credit: "Exchange credit",
};

export const REFUND_LABELS: Record<RefundMethod, string> = {
  cash: "Cash",
  card: "Card",
  mobile_banking: "Mobile banking",
  adjustment: "Adjustment (no cash out)",
};

export const RETURN_REASONS = ["Size issue", "Defect", "Changed mind", "Other"] as const;

export const EMPTY_CUSTOMER: CartCustomer = { walkIn: true, name: "", phone: "", address: "", note: "" };
export const NO_DISCOUNT: CartDiscount = { type: "fixed", value: 0 };
export const WALK_IN_NAME = "Walk-in customer";

export function emptyDraft(): SaleDraft {
  return { lines: [], cartDiscount: { ...NO_DISCOUNT }, customer: { ...EMPTY_CUSTOMER }, discountLog: [] };
}

// ---- money --------------------------------------------------------------------

/** Rounds to the number of decimals chosen in Settings → Company, so what is stored is what is shown. */
export function roundMoney(n: number, decimals: number = runtime.decimals): number {
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Currency value of a discount typed as ৳ or %, never below 0 and never above `base`. */
export function discountAmount(type: DiscountType, value: number, base: number, decimals?: number): number {
  if (!(value > 0) || !(base > 0)) return 0;
  const raw = type === "percent" ? (base * Math.min(value, 100)) / 100 : value;
  return Math.min(base, Math.max(0, roundMoney(raw, decimals)));
}

// ---- sale totals ---------------------------------------------------------------

export interface LineCalc {
  line: CartLine;
  gross: number;
  discount: number;
  cartDiscount: number;
  net: number;
  vat: number;
}

export interface SaleTotals {
  lines: LineCalc[];
  itemCount: number;
  subtotal: number;
  itemDiscount: number;
  cartDiscount: number;
  discountTotal: number;
  /** Total discount as a % of the subtotal. */
  discountPct: number;
  vat: number;
  deliveryCharge: number;
  total: number;
}

/**
 * The one place a sale's numbers are worked out — used by the cart, the checkout, the store and the receipt,
 * so they can never disagree. The cart-level discount is spread over the lines (so returns can be refunded per
 * line), VAT is charged on what is left after discounts, and delivery is never taxed or discounted.
 */
export function computeTotals(lines: CartLine[], cartDiscount: CartDiscount, vatPercent: number, deliveryCharge = 0, decimals?: number): SaleTotals {
  const base: LineCalc[] = lines.map((line) => {
    const gross = line.price * line.qty;
    const discount = discountAmount(line.discountType, line.discountValue, gross, decimals);
    return { line, gross, discount, cartDiscount: 0, net: gross - discount, vat: 0 };
  });

  const afterLines = base.reduce((s, l) => s + l.net, 0);
  const cartAmount = discountAmount(cartDiscount.type, cartDiscount.value, afterLines, decimals);

  if (cartAmount > 0 && afterLines > 0) {
    let allocated = 0;
    let lastIdx = -1;
    base.forEach((l, i) => {
      if (l.net <= 0) return;
      lastIdx = i;
      l.cartDiscount = roundMoney((cartAmount * l.net) / afterLines, decimals);
      allocated += l.cartDiscount;
    });
    // Rounding can leave a few cents over or under: the last line absorbs it so the shares add up exactly.
    if (lastIdx >= 0) base[lastIdx].cartDiscount = roundMoney(base[lastIdx].cartDiscount + (cartAmount - allocated), decimals);
  }

  for (const l of base) {
    l.net = roundMoney(l.gross - l.discount - l.cartDiscount, decimals);
    l.vat = vatPercent > 0 ? roundMoney((l.net * vatPercent) / 100, decimals) : 0;
  }

  const subtotal = base.reduce((s, l) => s + l.gross, 0);
  const itemDiscount = base.reduce((s, l) => s + l.discount, 0);
  const cartDisc = base.reduce((s, l) => s + l.cartDiscount, 0);
  const vat = base.reduce((s, l) => s + l.vat, 0);
  const net = base.reduce((s, l) => s + l.net, 0);
  const discountTotal = itemDiscount + cartDisc;

  return {
    lines: base,
    itemCount: lines.reduce((s, l) => s + l.qty, 0),
    subtotal: roundMoney(subtotal, decimals),
    itemDiscount: roundMoney(itemDiscount, decimals),
    cartDiscount: roundMoney(cartDisc, decimals),
    discountTotal: roundMoney(discountTotal, decimals),
    discountPct: subtotal > 0 ? (discountTotal / subtotal) * 100 : 0,
    vat: roundMoney(vat, decimals),
    deliveryCharge,
    total: roundMoney(net + vat + deliveryCharge, decimals),
  };
}

export function toInvoiceItems(calc: LineCalc[]): PosInvoiceItem[] {
  return calc.map(({ line, discount, cartDiscount, net, vat }) => ({
    id: crypto.randomUUID(),
    productId: line.productId,
    productName: line.productName,
    variantId: line.variantId,
    color: line.color,
    size: line.size,
    sku: line.sku,
    price: line.price,
    cost: line.cost,
    qty: line.qty,
    discount,
    cartDiscount,
    net,
    vat,
    returnedQty: 0,
    returnedValue: 0,
  }));
}

/** What the customer paid for a line: the line total after discounts, plus its VAT. */
export const lineValue = (i: Pick<PosInvoiceItem, "net" | "vat">) => i.net + i.vat;

// ---- discount limits ----------------------------------------------------------------

/** The most a role may discount a sale (% of subtotal). `null` = no limit (Super Admin or "Override limits"). */
export function discountCapFor(opts: { roleId: string; canOverride: boolean; byRole: Record<string, number>; fallback: number }): number | null {
  if (opts.canOverride) return null;
  const v = opts.byRole[opts.roleId];
  return Number.isFinite(v) ? v : opts.fallback;
}

const pctText = (n: number) => `${Math.round(n * 100) / 100}%`;

/** A readable message when the sale is discounted beyond `cap`, otherwise null. Checks each line and the sale as a whole. */
export function discountLimitError(totals: SaleTotals, cap: number | null): string | null {
  if (cap === null) return null;
  const eps = 0.0001;
  for (const l of totals.lines) {
    if (l.gross > 0 && (l.discount / l.gross) * 100 > cap + eps) {
      return `${l.line.productName} (${l.line.color}/${l.line.size}) is discounted ${pctText((l.discount / l.gross) * 100)} — your limit is ${pctText(cap)}. Ask a manager to override.`;
    }
  }
  if (totals.discountPct > cap + eps) {
    return `The sale is discounted ${pctText(totals.discountPct)} in total — your limit is ${pctText(cap)}. Ask a manager to override.`;
  }
  return null;
}

/** True when any discount in the sale is above `cap` — i.e. the person is relying on "Override limits". */
export function isOverride(totals: SaleTotals, cap: number | null): boolean {
  return discountLimitError(totals, cap) !== null;
}

export function describeDiscount(type: DiscountType, value: number): string {
  return value > 0 ? (type === "percent" ? `${value}%` : `৳${value}`) : "none";
}

// ---- payments -------------------------------------------------------------------------

export interface PaymentCheck {
  tendered: number;
  cash: number;
  balance: number;
  change: number;
  ok: boolean;
  error: string | null;
}

/** Are the payments enough for `due`, and can any excess be handed back as cash change? */
export function checkPayments(payments: Pick<PosPayment, "method" | "amount">[], due: number): PaymentCheck {
  const real = payments.filter((p) => p.method !== "exchange_credit");
  const tendered = payments.reduce((s, p) => s + p.amount, 0);
  const cash = real.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0);
  const balance = roundMoney(Math.max(0, due - tendered));
  const change = roundMoney(Math.max(0, tendered - due));
  let error: string | null = null;
  if (payments.some((p) => !(p.amount > 0))) error = "Every payment needs an amount above zero.";
  else if (balance > 0) error = `৳${balance} is still due.`;
  else if (change > cash) error = "Card and mobile payments can't be more than what is owed — only cash can give change.";
  return { tendered: roundMoney(tendered), cash, balance, change, ok: error === null, error };
}

/** Cash that actually stayed in the drawer for an invoice (cash handed over minus change given back). */
export function invoiceCashNet(inv: Pick<PosInvoice, "payments" | "change">): number {
  const cash = inv.payments.filter((p) => p.method === "cash").reduce((s, p) => s + p.amount, 0);
  return cash > 0 ? roundMoney(cash - inv.change) : 0;
}

/** Real money received by method, with change taken off the cash. Exchange credit is excluded. */
export function invoiceByMethod(inv: Pick<PosInvoice, "payments" | "change">): Record<"cash" | "card" | "mobile_banking", number> {
  const out = { cash: 0, card: 0, mobile_banking: 0 };
  for (const p of inv.payments) if (p.method !== "exchange_credit") out[p.method] += p.amount;
  out.cash = roundMoney(Math.max(0, out.cash - inv.change));
  return out;
}

export function paymentSummary(inv: Pick<PosInvoice, "payments" | "saleType">): string {
  if (inv.saleType === "delivery") return "Cash on delivery";
  const methods = [...new Set(inv.payments.map((p) => p.method))];
  if (!methods.length) return "—";
  return methods.map((m) => PAYMENT_LABELS[m]).join(" + ");
}

// ---- invoices ---------------------------------------------------------------------------

export type ReturnState = "none" | "partial" | "full";

export function returnState(inv: Pick<PosInvoice, "items">): ReturnState {
  const sold = inv.items.reduce((s, i) => s + i.qty, 0);
  const back = inv.items.reduce((s, i) => s + i.returnedQty, 0);
  if (back <= 0) return "none";
  return back >= sold ? "full" : "partial";
}

export const remainingQty = (i: Pick<PosInvoiceItem, "qty" | "returnedQty">) => Math.max(0, i.qty - i.returnedQty);

/** Money credited for taking back `qty` units of a line. The last units get whatever is left, so rounding never leaves a remainder. */
export function refundValueFor(item: PosInvoiceItem, qty: number): number {
  const remaining = remainingQty(item);
  if (qty <= 0 || remaining <= 0) return 0;
  const left = Math.max(0, roundMoney(lineValue(item) - item.returnedValue));
  if (qty >= remaining) return left;
  return Math.min(left, roundMoney((lineValue(item) * qty) / item.qty));
}

export function isWithinReturnWindow(inv: Pick<PosInvoice, "createdAt">, days: number, now: number = Date.now()): boolean {
  if (!(days > 0)) return true;
  return now - new Date(inv.createdAt).getTime() <= days * 24 * 60 * 60 * 1000;
}

export function invoiceMatches(inv: PosInvoice, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    inv.invoiceNumber.toLowerCase().includes(s) ||
    (inv.customer.phone ?? "").toLowerCase().includes(s) ||
    inv.customer.name.toLowerCase().includes(s) ||
    inv.items.some((i) => i.sku.toLowerCase().includes(s))
  );
}

/** Order status shown against a delivery sale in POS lists. */
export function deliveryStatusLabel(order: Order | undefined): string {
  if (!order) return "Order removed";
  return order.status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---- sessions ---------------------------------------------------------------------------

export interface SessionSummary {
  invoices: number;
  voided: number;
  itemsSold: number;
  /** Walk-in sales that still stand (not voided). */
  salesTotal: number;
  cashSales: number;
  cardSales: number;
  mobileSales: number;
  deliveryOrders: number;
  cashIn: number;
  cashOut: number;
  refundsOut: number;
  openingCash: number;
  expectedCash: number;
}

/**
 * Expected cash in the drawer = opening cash + cash kept from every sale rung up in the session (voided ones too —
 * the money did come in; the refund shows up as a cash-out) + cash in − cash out (which includes refunds).
 */
export function sessionSummary(session: PosSession, invoices: PosInvoice[]): SessionSummary {
  const mine = invoices.filter((i) => i.sessionId === session.id);
  let cashSales = 0;
  let cardSales = 0;
  let mobileSales = 0;
  for (const inv of mine) {
    const m = invoiceByMethod(inv);
    cashSales += m.cash;
    cardSales += m.card;
    mobileSales += m.mobile_banking;
  }
  const walkIn = mine.filter((i) => i.saleType === "walk_in" && i.status === "completed");
  const cashIn = session.movements.filter((m) => m.type === "in").reduce((s, m) => s + m.amount, 0);
  const out = session.movements.filter((m) => m.type === "out");
  const cashOut = out.reduce((s, m) => s + m.amount, 0);
  const refundsOut = out.filter((m) => m.kind === "refund").reduce((s, m) => s + m.amount, 0);
  return {
    invoices: mine.length,
    voided: mine.filter((i) => i.status === "void").length,
    itemsSold: walkIn.reduce((s, i) => s + i.items.reduce((n, it) => n + it.qty, 0), 0),
    salesTotal: roundMoney(walkIn.reduce((s, i) => s + i.total, 0)),
    cashSales: roundMoney(cashSales),
    cardSales: roundMoney(cardSales),
    mobileSales: roundMoney(mobileSales),
    deliveryOrders: mine.filter((i) => i.saleType === "delivery" && i.status === "completed").length,
    cashIn: roundMoney(cashIn),
    cashOut: roundMoney(cashOut),
    refundsOut: roundMoney(refundsOut),
    openingCash: session.openingCash,
    expectedCash: roundMoney(session.openingCash + cashSales + cashIn - cashOut),
  };
}

// ---- reports ---------------------------------------------------------------------------

export function grossProfit(inv: PosInvoice): number {
  const revenue = inv.items.reduce((s, i) => s + i.net, 0);
  const cost = inv.items.reduce((s, i) => s + i.cost * i.qty, 0);
  return roundMoney(revenue - cost);
}

/** Cost of the goods a return took back, when they went back on the shelf or not — used to net profit. */
export function returnedCost(ret: PosReturn, invoice: PosInvoice | undefined): number {
  if (!invoice) return 0;
  return ret.items.reduce((s, ri) => {
    const it = invoice.items.find((i) => i.id === ri.invoiceItemId);
    return s + (it ? it.cost * ri.qty : 0);
  }, 0);
}

// ---- customers ----------------------------------------------------------------------------

export interface KnownCustomer {
  phone: string;
  name: string;
  address: string;
  purchases: number;
  lastAt: string;
}

/** Everyone we've sold to (POS and Orders), keyed by phone number — so a phone number is one customer. */
export function customerDirectory(invoices: PosInvoice[], orders: Order[]): KnownCustomer[] {
  const map = new Map<string, KnownCustomer>();
  const norm = (p: string) => p.replace(/[^\d+]/g, "");
  const add = (phone: string | undefined, name: string, address: string | undefined, at: string) => {
    if (!phone) return;
    const key = norm(phone);
    if (key.length < 5) return;
    const cur = map.get(key);
    if (!cur) map.set(key, { phone, name, address: address ?? "", purchases: 1, lastAt: at });
    else {
      cur.purchases += 1;
      if (at > cur.lastAt) {
        cur.lastAt = at;
        cur.name = name || cur.name;
        cur.address = address || cur.address;
      }
    }
  };
  for (const i of invoices) if (i.status === "completed") add(i.customer.phone, i.customer.walkIn ? "" : i.customer.name, i.customer.address, i.createdAt);
  for (const o of orders) if (o.status !== "cancelled") add(o.phone, o.customerName, o.address, o.createdAt);
  return [...map.values()].sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
}

export const samePhone = (a: string, b: string) => a.replace(/[^\d+]/g, "") === b.replace(/[^\d+]/g, "") && a.replace(/\D/g, "").length >= 5;

// ---- misc ---------------------------------------------------------------------------------

/** "Customer A", "Customer B"… — the first one not already used by a held sale. */
export function nextHeldName(existing: string[]): string {
  const used = new Set(existing.map((n) => n.toLowerCase()));
  for (let i = 0; i < 26; i++) {
    const name = `Customer ${String.fromCharCode(65 + i)}`;
    if (!used.has(name.toLowerCase())) return name;
  }
  return `Customer ${existing.length + 1}`;
}

export function draftIsEmpty(d: SaleDraft): boolean {
  return d.lines.length === 0;
}
