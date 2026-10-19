"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useCollection } from "@/lib/persist/hooks";
import { syncManager } from "@/lib/persist/sync";
import { takeNumber } from "@/lib/persist/numbers";
import { useProducts, type StockLineItem, type StockUpdate } from "@/lib/products/store";
import { useOrders } from "@/lib/orders/store";
import { useWarranty } from "@/lib/warranty/store";
import { useSettings } from "@/lib/settings/store";
import { useAudit } from "@/lib/settings/audit";
import { useAccess } from "@/lib/settings/access";
import { availableStock } from "@/lib/products/utils";
import type { Product } from "@/lib/products/types";
import type { Order } from "@/lib/orders/types";
import type {
  CartLine,
  CashMovement,
  HeldSale,
  PosCustomer,
  PosInvoice,
  PosPayment,
  PosReturn,
  PosReturnItem,
  PosSession,
  RefundMethod,
  ReturnCondition,
  SaleDraft,
  SaleType,
  CartCustomer,
} from "./types";
import {
  WALK_IN_NAME,
  checkPayments,
  computeTotals,
  discountCapFor,
  discountLimitError,
  invoiceCashNet,
  isOverride,
  isWithinReturnWindow,
  refundValueFor,
  remainingQty,
  roundMoney,
  sessionSummary,
  toInvoiceItems,
  type SaleTotals,
  type SessionSummary,
} from "./utils";

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

export interface DeliveryInput {
  deliveryCharge: number;
  district?: string;
  area?: string;
  notes?: string;
  /** Extra overall discount (৳) typed at checkout; folded into the cart discount. */
  orderDiscount?: number;
  /** Free Delivery: what the courier actually charges even though the customer pays ৳0 — counted as a loss. */
  freeDeliveryCourierCost?: number;
}

export interface ReturnLineInput {
  invoiceItemId: string;
  qty: number;
  reason: string;
  condition: ReturnCondition;
}

export interface ProcessReturnInput {
  invoiceId: string;
  lines: ReturnLineInput[];
  /** How money goes back when the return isn't fully used up by an exchange. */
  refundMethod: RefundMethod;
  notes?: string;
  /** Exchange: the new items, plus whatever the customer pays on top when they cost more than the return. */
  exchange?: { draft: SaleDraft; payments: Omit<PosPayment, "id">[] };
}

export interface DiscountPolicy {
  /** Highest total discount % this person may give; null = unlimited. */
  cap: number | null;
  /** The role's normal cap, before any override. */
  roleCap: number;
  canOverride: boolean;
}

interface PosContextValue {
  invoices: PosInvoice[];
  sessions: PosSession[];
  returns: PosReturn[];
  held: HeldSale[];
  hydrated: boolean;
  /** The signed-in person's open session, if any. */
  mySession: PosSession | undefined;
  /**
   * Whether a just-completed sale's invoice turned out never to reach the server, because a same-instant
   * conflict on one of its own products tore up the whole compound write. Checked by the checkout screen right
   * after completeWalkInSale / createDeliverySale.
   */
  saleWasRolledBack: (invoiceId: string) => boolean;
  /** Once a sale is confirmed saved, stop watching it for a torn write — nothing left to tear. */
  stopWatchingSale: (invoiceId: string) => void;
  discountPolicy: DiscountPolicy;
  getInvoice: (id: string) => PosInvoice | undefined;
  getSession: (id: string) => PosSession | undefined;
  getReturn: (id: string) => PosReturn | undefined;
  summaryFor: (session: PosSession) => SessionSummary;

  openSession: (openingCash: number) => Result<{ session: PosSession }>;
  closeSession: (id: string, countedCash: number, note?: string) => Result<{ session: PosSession; summary: SessionSummary }>;
  addCashMovement: (sessionId: string, input: { type: "in" | "out"; amount: number; reason: string; note?: string; approvedBy?: string }) => Result;

  /** Turns the cart's lines into current prices / stock so the screen and the store always agree. */
  resolveDraft: (lines: CartLine[]) => { lines: CartLine[]; problems: string[] };
  completeWalkInSale: (draft: SaleDraft, payments: Omit<PosPayment, "id">[], notes?: string) => Result<{ invoice: PosInvoice }>;
  createDeliverySale: (draft: SaleDraft, input: DeliveryInput) => Result<{ invoice: PosInvoice; order: Order }>;
  voidInvoice: (id: string, reason: string, note?: string) => Result;
  processReturn: (input: ProcessReturnInput) => Result<{ ret: PosReturn; exchangeInvoice?: PosInvoice }>;

  holdSale: (name: string, draft: SaleDraft) => Result<{ held: HeldSale }>;
  removeHeld: (id: string) => void;
}

const PosContext = createContext<PosContextValue | null>(null);

// ---- helpers ---------------------------------------------------------------------------

function toCustomer(c: CartCustomer, extra: Partial<PosCustomer> = {}): PosCustomer {
  const name = c.name.trim();
  const phone = c.phone.trim();
  return {
    walkIn: !name && !phone,
    name: name || WALK_IN_NAME,
    phone: phone || undefined,
    address: c.address.trim() || undefined,
    note: c.note.trim() || undefined,
    ...extra,
  };
}

const badPhone = (phone: string) => phone.trim().length > 0 && phone.replace(/\D/g, "").length < 6;

function asStockItems(items: { productId: string; variantId: string; qty: number }[]): StockLineItem[] {
  return items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty }));
}

/** Current product data for each cart line (one line per variant). Anything that can't be sold is reported, not dropped silently. */
function resolveLines(lines: CartLine[], products: Product[]): { lines: CartLine[]; problems: string[] } {
  const merged = new Map<string, CartLine>();
  for (const l of lines) {
    const cur = merged.get(l.variantId);
    if (cur) merged.set(l.variantId, { ...cur, qty: cur.qty + l.qty });
    else merged.set(l.variantId, { ...l });
  }
  const out: CartLine[] = [];
  const problems: string[] = [];
  for (const l of merged.values()) {
    const product = products.find((p) => p.id === l.productId);
    const variant = product?.variants.find((v) => v.id === l.variantId);
    const label = `${l.productName} (${l.color}/${l.size})`;
    if (!product || !variant || product.status !== "active" || variant.status !== "active") {
      problems.push(`${label} isn't available any more.`);
      continue;
    }
    if (!Number.isInteger(l.qty) || l.qty < 1) {
      problems.push(`${label}: quantity must be a whole number of at least 1.`);
      continue;
    }
    const avail = availableStock(variant);
    if (l.qty > avail) problems.push(avail > 0 ? `Only ${avail} left for ${label}.` : `${label} is out of stock.`);
    out.push({
      ...l,
      productName: product.name,
      imageUrl: product.imageUrl,
      color: variant.color,
      size: variant.size,
      sku: variant.sku,
      barcode: variant.barcode || product.barcode,
      price: variant.price,
      cost: variant.cost,
    });
  }
  return { lines: out, problems };
}

// ---- provider -----------------------------------------------------------------------------

export function PosProvider({ children }: { children: ReactNode }) {
  const { products, sellStock, restoreStock, bulkUpdateStock } = useProducts();
  const { getOrder, createOrder, cancelOrder, discardOrder } = useOrders();
  const { createWarrantiesForOrder, discardForOrder, voidWarrantiesForOrderItem } = useWarranty();
  const { settings } = useSettings();
  const { log } = useAudit();
  const { can, currentUser, currentRole, isSuperAdmin } = useAccess();

  const [invoices, setInvoices, invoicesReady] = useCollection<PosInvoice>("pos_invoices");
  const [sessions, setSessions, sessionsReady] = useCollection<PosSession>("pos_sessions");
  const [returns, setReturns, returnsReady] = useCollection<PosReturn>("pos_returns");
  const [held, setHeld, heldReady] = useCollection<HeldSale>("pos_held");
  const hydrated = invoicesReady && sessionsReady && returnsReady && heldReady;

  // ---- torn-write recovery ---------------------------------------------------------------
  // A sale writes to two or three collections at once (products, pos_invoices, warranties, sometimes orders) in
  // a single request that the server applies as one transaction. If someone else's sale conflicts on the very
  // same product at the very same instant, the whole request is refused together — but afterwards, products gets
  // force-reloaded from the server while the still-dirty invoice/warranty/order quietly get resent on their own,
  // moments later, as if nothing had happened. Left alone that would hand the customer a receipt and a warranty
  // for a sale whose stock deduction never actually reached the server. So: remember which products a sale
  // depended on, and if a conflict names one of them, tear the rest of that same sale down too, right away,
  // before the automatic retry can re-send it — never for a conflict that has nothing to do with this sale.
  const pendingSales = useRef(new Map<string, { productIds: Set<string>; orderId?: string }>());
  const [rolledBack, setRolledBack] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const off = syncManager.onNotice((n) => {
      if (n.kind !== "conflict") return;
      const hit = new Set(n.names.filter((x) => x.startsWith("products/")).map((x) => x.slice("products/".length)));
      if (!hit.size) return;
      for (const [invoiceId, dep] of pendingSales.current) {
        if (![...dep.productIds].some((id) => hit.has(id))) continue;
        pendingSales.current.delete(invoiceId);
        setInvoices((prev) => prev.filter((i) => i.id !== invoiceId));
        discardForOrder(invoiceId);
        if (dep.orderId) discardOrder(dep.orderId);
        setRolledBack((prev) => new Set(prev).add(invoiceId));
      }
    });
    return () => {
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Call right after a sale is added to local state, so a torn write can be found and cleaned up by invoice id. */
  function trackSale(invoiceId: string, productIds: string[], orderId?: string) {
    pendingSales.current.set(invoiceId, { productIds: new Set(productIds), orderId });
  }
  /** The invoice reached the server safely — stop watching it (called once useSaleConfirmation sees it saved). */
  function untrackSale(invoiceId: string) {
    pendingSales.current.delete(invoiceId);
  }
  const saleWasRolledBack = (invoiceId: string) => rolledBack.has(invoiceId);

  const pos = settings.pos;
  const canOverride = isSuperAdmin || can("pos", "edit");
  const roleCap = discountCapFor({ roleId: currentRole.id, canOverride: false, byRole: pos.maxDiscountByRole, fallback: pos.defaultMaxDiscountPct }) ?? pos.defaultMaxDiscountPct;
  const discountPolicy: DiscountPolicy = { cap: canOverride ? null : roleCap, roleCap, canOverride };

  const mySession = sessions.find((s) => s.status === "open" && s.cashierId === currentUser.id);

  const getInvoice = (id: string) => invoices.find((i) => i.id === id);
  const getSession = (id: string) => sessions.find((s) => s.id === id);
  const getReturn = (id: string) => returns.find((r) => r.id === id);
  const summaryFor = (session: PosSession) => sessionSummary(session, invoices);

  function discountNote(totals: SaleTotals, invoiceNumber: string, draft: SaleDraft) {
    if (totals.discountTotal <= 0 && draft.discountLog.length === 0) return;
    const override = isOverride(totals, roleCap);
    log({
      module: "POS",
      action: "edit",
      entity: `Invoice ${invoiceNumber}`,
      summary: `Discount ৳${totals.discountTotal} (${Math.round(totals.discountPct * 100) / 100}% of ৳${totals.subtotal})${override ? ` — above the ${roleCap}% role limit (override)` : ""}`,
      before: { discountLimitPct: roleCap },
      after: {
        itemDiscount: totals.itemDiscount,
        cartDiscount: totals.cartDiscount,
        override,
        changes: draft.discountLog.map((d) => ({ at: d.at, by: d.by, target: d.target, from: d.from, to: d.to, amount: d.amount, override: d.override })),
      },
    });
  }

  // ---- sessions --------------------------------------------------------------------------

  function openSession(openingCash: number): Result<{ session: PosSession }> {
    if (!can("pos", "create")) return fail("Your role can't open a POS session.");
    if (mySession) return fail("You already have an open session.");
    if (!Number.isFinite(openingCash) || openingCash < 0) return fail("Enter the opening cash (0 if the drawer starts empty).");
    const n = takeNumber("pos_session");
    if (n === null) return fail("Still reserving the next session number — try again in a moment.");
    const session: PosSession = {
      id: crypto.randomUUID(),
      sessionNumber: `${settings.invoice.numbering.posSession}${n}`,
      status: "open",
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      openedAt: new Date().toISOString(),
      openingCash: roundMoney(openingCash),
      movements: [],
    };
    setSessions((prev) => [session, ...prev]);
    log({ module: "POS", action: "create", entity: `Session ${session.sessionNumber}`, summary: `Opened with ৳${session.openingCash} in the drawer` });
    return { ok: true, session };
  }

  function closeSession(id: string, countedCash: number, note?: string): Result<{ session: PosSession; summary: SessionSummary }> {
    const s = getSession(id);
    if (!s) return fail("Session not found.");
    if (s.status !== "open") return fail("This session is already closed.");
    if (s.cashierId !== currentUser.id && !can("pos", "financial") && !isSuperAdmin) return fail("Only the cashier (or someone with POS → Financial) can close this session.");
    if (!Number.isFinite(countedCash) || countedCash < 0) return fail("Enter the cash you counted in the drawer.");
    const summary = summaryFor(s);
    const counted = roundMoney(countedCash);
    const difference = roundMoney(counted - summary.expectedCash);
    const closed: PosSession = { ...s, status: "closed", closedAt: new Date().toISOString(), expectedCash: summary.expectedCash, countedCash: counted, difference, closingNote: note?.trim() || undefined };
    setSessions((prev) => prev.map((x) => (x.id === id ? closed : x)));
    log({
      module: "POS",
      action: "status_change",
      entity: `Session ${s.sessionNumber}`,
      summary: `Closed by ${currentUser.name}: expected ৳${summary.expectedCash}, counted ৳${counted} (${difference === 0 ? "balanced" : difference < 0 ? `short ৳${Math.abs(difference)}` : `over ৳${difference}`})`,
      after: { expectedCash: summary.expectedCash, countedCash: counted, difference, note: note?.trim() || undefined },
    });
    return { ok: true, session: closed, summary };
  }

  function addCashMovement(sessionId: string, input: { type: "in" | "out"; amount: number; reason: string; note?: string; approvedBy?: string }): Result {
    const s = getSession(sessionId);
    if (!s || s.status !== "open") return fail("That session isn't open.");
    if (s.cashierId !== currentUser.id) return fail("You can only move cash in your own session.");
    if (!(input.amount > 0)) return fail("Enter an amount above zero.");
    if (!input.reason.trim()) return fail("Say what the cash is for.");
    const amount = roundMoney(input.amount);
    if (input.type === "out" && amount > summaryFor(s).expectedCash) return fail(`Only ৳${summaryFor(s).expectedCash} is in the drawer.`);
    const movement: CashMovement = {
      id: crypto.randomUUID(),
      type: input.type,
      amount,
      kind: "manual",
      reason: input.reason.trim(),
      note: input.note?.trim() || undefined,
      approvedBy: input.approvedBy?.trim() || undefined,
      at: new Date().toISOString(),
      by: currentUser.name,
    };
    setSessions((prev) => prev.map((x) => (x.id === sessionId ? { ...x, movements: [...x.movements, movement] } : x)));
    log({ module: "POS", action: "create", entity: `Session ${s.sessionNumber}`, summary: `Cash ${input.type === "in" ? "in" : "out"} ৳${amount} — ${movement.reason}${movement.approvedBy ? ` (approved by ${movement.approvedBy})` : ""}` });
    return { ok: true };
  }

  // ---- selling -------------------------------------------------------------------------------

  const resolveDraft: PosContextValue["resolveDraft"] = (lines) => resolveLines(lines, products);

  function invoiceBase(args: {
    id?: string;
    number: string;
    saleType: SaleType;
    session: PosSession;
    customer: PosCustomer;
    totals: SaleTotals;
    draft: SaleDraft;
    payments: PosPayment[];
    change: number;
    notes?: string;
    extra?: Partial<PosInvoice>;
  }): PosInvoice {
    const now = new Date();
    return {
      id: args.id ?? crypto.randomUUID(),
      invoiceNumber: args.number,
      status: "completed",
      saleType: args.saleType,
      sessionId: args.session.id,
      cashierId: currentUser.id,
      cashierName: currentUser.name,
      customer: args.customer,
      items: toInvoiceItems(args.totals.lines),
      subtotal: args.totals.subtotal,
      itemDiscount: args.totals.itemDiscount,
      cartDiscount: args.totals.cartDiscount,
      vatPercent: args.saleType === "walk_in" ? pos.vatPercent : 0,
      vat: args.totals.vat,
      deliveryCharge: args.totals.deliveryCharge,
      total: args.totals.total,
      payments: args.payments,
      tendered: roundMoney(args.payments.reduce((s, p) => s + p.amount, 0)),
      change: args.change,
      warrantyEndsAt: args.saleType === "walk_in" ? new Date(now.getTime() + settings.warranty.durationDays * 24 * 60 * 60 * 1000).toISOString() : undefined,
      discountLog: args.draft.discountLog,
      notes: args.notes?.trim() || undefined,
      createdAt: now.toISOString(),
      ...args.extra,
    };
  }

  /** Warranty is issued the moment a walk-in sale completes (delivery sales get theirs when Orders marks them delivered). */
  function issueWarranties(inv: PosInvoice) {
    createWarrantiesForOrder({
      id: inv.id,
      orderNumber: inv.invoiceNumber,
      source: "pos",
      customerName: inv.customer.name,
      phone: inv.customer.phone ?? "",
      items: inv.items.map((i) => ({ productId: i.productId, productName: i.productName, variantId: i.variantId, color: i.color, size: i.size, sku: i.sku, qty: i.qty })),
    });
  }

  function completeWalkInSale(draft: SaleDraft, payments: Omit<PosPayment, "id">[], notes?: string): Result<{ invoice: PosInvoice }> {
    if (!can("pos", "create")) return fail("Your role can't make POS sales.");
    if (!mySession) return fail("Open a session before selling.");
    if (!draft.lines.length) return fail("The cart is empty.");
    const resolved = resolveLines(draft.lines, products);
    if (resolved.problems.length) return fail(resolved.problems[0]);

    const totals = computeTotals(resolved.lines, draft.cartDiscount, pos.vatPercent, 0);
    const limit = discountLimitError(totals, discountPolicy.cap);
    if (limit) return fail(limit);

    if (badPhone(draft.customer.phone)) return fail("That phone number looks too short.");
    if (pos.requirePhoneForWarranty && !draft.customer.phone.trim()) return fail("Enter the customer's phone number — warranties are linked to it (Settings → POS).");

    const check = checkPayments(payments, totals.total);
    if (!check.ok) return fail(check.error!);

    const n = takeNumber("pos_invoice");
    if (n === null) return fail("Still reserving the next invoice number — try again in a moment.");

    const fullPayments: PosPayment[] = payments.map((p) => ({ ...p, id: crypto.randomUUID(), amount: roundMoney(p.amount) }));
    const invoice = invoiceBase({
      number: `${settings.invoice.numbering.posInvoice}${n}`,
      saleType: "walk_in",
      session: mySession,
      customer: toCustomer(draft.customer),
      totals,
      draft,
      payments: fullPayments,
      change: check.change,
      notes,
    });

    sellStock(asStockItems(invoice.items));
    setInvoices((prev) => [invoice, ...prev]);
    issueWarranties(invoice);
    trackSale(invoice.id, invoice.items.map((i) => i.productId));
    discountNote(totals, invoice.invoiceNumber, draft);
    return { ok: true, invoice };
  }

  function createDeliverySale(draft: SaleDraft, input: DeliveryInput): Result<{ invoice: PosInvoice; order: Order }> {
    if (!can("pos", "create")) return fail("Your role can't make POS sales.");
    if (!mySession) return fail("Open a session before selling.");
    if (!draft.lines.length) return fail("The cart is empty.");
    const c = draft.customer;
    if (!c.name.trim()) return fail("A delivery order needs the customer's name.");
    if (!c.phone.trim() || badPhone(c.phone)) return fail("A delivery order needs a valid phone number.");
    if (!c.address.trim()) return fail("A delivery order needs the customer's address.");
    if (!(input.deliveryCharge >= 0)) return fail("Delivery charge can't be negative.");
    const courierEstimate = input.freeDeliveryCourierCost ?? 0;
    if (!(courierEstimate >= 0)) return fail("Courier charge can't be negative.");

    const resolved = resolveLines(draft.lines, products);
    if (resolved.problems.length) return fail(resolved.problems[0]);

    // Delivery orders live in the Orders module, which has no tax line — so VAT isn't added here.
    const charge = roundMoney(input.deliveryCharge);
    let totals = computeTotals(resolved.lines, draft.cartDiscount, 0, charge);
    const extra = input.orderDiscount ?? 0;
    if (!(extra >= 0)) return fail("Order discount can't be negative.");
    // The checkout's order discount joins the cart discount, so the invoice, the order and Expected COD all agree.
    if (extra > 0) totals = computeTotals(resolved.lines, { type: "fixed", value: totals.cartDiscount + extra }, 0, charge);
    const limit = discountLimitError(totals, discountPolicy.cap);
    if (limit) return fail(limit);

    const n = takeNumber("pos_invoice");
    if (n === null) return fail("Still reserving the next invoice number — try again in a moment.");
    const invoiceId = crypto.randomUUID();
    const invoiceNumber = `${settings.invoice.numbering.posInvoice}${n}`;

    const created = createOrder({
      customerName: c.name.trim(),
      phone: c.phone.trim(),
      address: c.address.trim(),
      district: input.district?.trim() || undefined,
      area: input.area?.trim() || undefined,
      notes: [c.note.trim(), input.notes?.trim()].filter(Boolean).join(" · ") || undefined,
      deliveryCharge: totals.deliveryCharge,
      freeDeliveryCourierCost: courierEstimate,
      pos: { invoiceId, invoiceNumber },
      // The cart-level discount is folded into each line, so the order's Expected COD equals the POS total.
      items: totals.lines.map((l) => ({
        productId: l.line.productId,
        productName: l.line.productName,
        variantId: l.line.variantId,
        color: l.line.color,
        size: l.line.size,
        sku: l.line.sku,
        price: l.line.price,
        qty: l.line.qty,
        discount: roundMoney(l.discount + l.cartDiscount),
      })),
    });
    if (!created.ok) return fail(created.error);

    const invoice = invoiceBase({
      id: invoiceId,
      number: invoiceNumber,
      saleType: "delivery",
      session: mySession,
      customer: toCustomer(c, { district: input.district?.trim() || undefined, area: input.area?.trim() || undefined }),
      totals,
      draft,
      payments: [],
      change: 0,
      notes: input.notes,
      extra: { orderId: created.order.id, orderNumber: created.order.orderNumber },
    });
    setInvoices((prev) => [invoice, ...prev]);
    trackSale(invoice.id, invoice.items.map((i) => i.productId), created.order.id);
    discountNote(totals, invoice.invoiceNumber, draft);
    return { ok: true, invoice, order: created.order };
  }

  // ---- void --------------------------------------------------------------------------------------

  function voidInvoice(id: string, reason: string, note?: string): Result {
    if (!can("pos", "delete")) return fail("Only roles with POS → Delete can void a sale.");
    const inv = getInvoice(id);
    if (!inv) return fail("Invoice not found.");
    if (inv.status === "void") return fail("This sale is already void.");
    if (!reason.trim()) return fail("A reason is required to void a sale.");
    if (inv.items.some((i) => i.returnedQty > 0)) return fail("Part of this sale has already been returned, so it can't be voided. Process the remaining items as a return instead.");
    if (inv.exchangeOfReturnId) return fail(`This sale was part of exchange ${inv.exchangeOfReturnNumber ?? ""}. Return its items instead of voiding it.`);

    const cashBack = inv.saleType === "walk_in" ? invoiceCashNet(inv) : 0;
    if (cashBack > 0 && !mySession) return fail(`This sale took ৳${cashBack} in cash. Open a session so the cash refund is recorded in your drawer.`);

    const detail = [reason.trim(), note?.trim()].filter(Boolean).join(" — ");

    if (inv.saleType === "delivery") {
      const order = inv.orderId ? getOrder(inv.orderId) : undefined;
      if (order) {
        const res = cancelOrder(order.id, { reason: "other", notes: `POS invoice ${inv.invoiceNumber} voided: ${detail}`, cancelledBy: currentUser.name });
        if (!res.ok) return fail(res.error);
      }
    } else {
      restoreStock(asStockItems(inv.items));
      // The sale never happened, so its warranties go too (whatever the "void on return" setting says).
      for (const i of inv.items) voidWarrantiesForOrderItem(inv.id, i.variantId, `POS sale ${inv.invoiceNumber} voided`);
    }

    const at = new Date().toISOString();
    setInvoices((prev) => prev.map((x) => (x.id === id ? { ...x, status: "void", voidedAt: at, voidedBy: currentUser.name, voidReason: detail } : x)));
    if (cashBack > 0 && mySession) {
      const movement: CashMovement = { id: crypto.randomUUID(), type: "out", amount: cashBack, kind: "refund", reason: `Void ${inv.invoiceNumber}`, at, by: currentUser.name, ref: inv.invoiceNumber };
      setSessions((prev) => prev.map((s) => (s.id === mySession.id ? { ...s, movements: [...s.movements, movement] } : s)));
    }
    log({
      module: "POS",
      action: "delete",
      entity: `Invoice ${inv.invoiceNumber}`,
      summary: `Voided (${detail}). ${inv.saleType === "delivery" ? "Linked order cancelled and stock released." : "Stock restored, revenue reversed and warranties voided."}`,
      before: { status: inv.status, total: inv.total, payments: inv.payments.map((p) => ({ method: p.method, amount: p.amount })) },
      after: { status: "void", refundedInCash: cashBack },
    });
    return { ok: true };
  }

  // ---- returns & exchanges ------------------------------------------------------------------------

  function processReturn(input: ProcessReturnInput): Result<{ ret: PosReturn; exchangeInvoice?: PosInvoice }> {
    if (!can("pos", "approve")) return fail("Only roles with POS → Approve can process returns and exchanges.");
    const session = mySession;
    if (!session) return fail("Open a session first — a return moves money, so it has to be recorded in a drawer.");
    const inv = getInvoice(input.invoiceId);
    if (!inv) return fail("Invoice not found.");
    if (inv.status !== "completed") return fail("This sale was voided, so there is nothing to return.");
    if (inv.saleType !== "walk_in") return fail("Delivery sales are returned through Orders and Returns, not the POS.");
    if (!isWithinReturnWindow(inv, pos.returnWindowDays) && !canOverride) {
      return fail(`This sale is outside the ${pos.returnWindowDays}-day return window. A manager with "Override limits" can still take it back.`);
    }
    if (!input.lines.length) return fail("Pick at least one item to return.");

    const seen = new Set<string>();
    const items: PosReturnItem[] = [];
    for (const l of input.lines) {
      const it = inv.items.find((i) => i.id === l.invoiceItemId);
      if (!it) return fail("One of the items isn't on this invoice.");
      if (seen.has(it.id)) return fail("The same item is listed twice.");
      seen.add(it.id);
      const label = `${it.productName} (${it.color}/${it.size})`;
      const left = remainingQty(it);
      if (!Number.isInteger(l.qty) || l.qty < 1) return fail(`Enter how many ${label} come back.`);
      if (l.qty > left) return fail(left === 0 ? `${label} has already been fully returned.` : `You can only return ${left} of ${label}.`);
      if (!l.reason.trim()) return fail(`Pick a reason for ${label}.`);
      items.push({
        id: crypto.randomUUID(),
        invoiceItemId: it.id,
        productId: it.productId,
        productName: it.productName,
        variantId: it.variantId,
        color: it.color,
        size: it.size,
        sku: it.sku,
        qty: l.qty,
        value: refundValueFor(it, l.qty),
        reason: l.reason.trim(),
        condition: l.condition,
      });
    }
    const credit = roundMoney(items.reduce((s, i) => s + i.value, 0));

    // Work out the exchange first: every check happens before a number is taken, so a rejected attempt burns none.
    let exchange: { totals: SaleTotals; draft: SaleDraft; payments: Omit<PosPayment, "id">[]; change: number; owed: number } | undefined;
    if (input.exchange) {
      const ex = input.exchange;
      if (!ex.draft.lines.length) return fail("Add the new item(s) the customer is taking.");
      const resolved = resolveLines(ex.draft.lines, products);
      if (resolved.problems.length) return fail(resolved.problems[0]);
      const totals = computeTotals(resolved.lines, ex.draft.cartDiscount, pos.vatPercent, 0);
      const limit = discountLimitError(totals, discountPolicy.cap);
      if (limit) return fail(limit);

      const creditUsed = Math.min(credit, totals.total);
      const owed = roundMoney(totals.total - creditUsed);
      const extra = owed > 0 ? ex.payments : [];
      const all: Omit<PosPayment, "id">[] = [...(creditUsed > 0 ? [{ method: "exchange_credit" as const, amount: creditUsed }] : []), ...extra];
      const check = checkPayments(all, totals.total);
      if (!check.ok) return fail(check.error!);
      exchange = { totals, draft: ex.draft, payments: all, change: check.change, owed };
    }

    const retNumber = takeNumber("pos_return");
    if (retNumber === null) return fail("Still reserving the next return number — try again in a moment.");
    const returnNumber = `${settings.invoice.numbering.posReturn}${retNumber}`;
    const retId = crypto.randomUUID();

    let exchangeInvoice: PosInvoice | undefined;
    let refundAmount = credit;
    let customerPaid = 0;
    if (exchange) {
      const n = takeNumber("pos_invoice");
      if (n === null) return fail("Still reserving the next invoice number — try again in a moment.");
      exchangeInvoice = invoiceBase({
        number: `${settings.invoice.numbering.posInvoice}${n}`,
        saleType: "walk_in",
        session,
        customer: toCustomer({ walkIn: inv.customer.walkIn, name: inv.customer.walkIn ? "" : inv.customer.name, phone: inv.customer.phone ?? "", address: inv.customer.address ?? "", note: "" }),
        totals: exchange.totals,
        draft: exchange.draft,
        payments: exchange.payments.map((p) => ({ ...p, id: crypto.randomUUID(), amount: roundMoney(p.amount) })),
        change: exchange.change,
        notes: `Exchange for ${inv.invoiceNumber} (${returnNumber})`,
        extra: { exchangeOfReturnId: retId, exchangeOfReturnNumber: returnNumber },
      });
      refundAmount = roundMoney(Math.max(0, credit - exchange.totals.total));
      customerPaid = exchange.owed;
    }

    const now = new Date().toISOString();
    const ret: PosReturn = {
      id: retId,
      returnNumber,
      type: exchangeInvoice ? "exchange" : "return",
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerName: inv.customer.name,
      customerPhone: inv.customer.phone,
      items,
      creditValue: credit,
      exchangeInvoiceId: exchangeInvoice?.id,
      exchangeInvoiceNumber: exchangeInvoice?.invoiceNumber,
      exchangeTotal: exchangeInvoice?.total,
      customerPaid: exchangeInvoice ? customerPaid : undefined,
      refundAmount,
      refundMethod: refundAmount > 0 ? input.refundMethod : "adjustment",
      notes: input.notes?.trim() || undefined,
      sessionId: session.id,
      processedById: currentUser.id,
      processedBy: currentUser.name,
      createdAt: now,
    };

    // Stock: resellable goes back on the shelf, damaged doesn't; new items leave it.
    const back: StockUpdate[] = items.filter((i) => i.condition === "resellable").map((i) => ({ productId: i.productId, variantId: i.variantId, value: i.qty, mode: "add" as const }));
    if (back.length) bulkUpdateStock(back);
    if (exchangeInvoice) {
      sellStock(asStockItems(exchangeInvoice.items));
      issueWarranties(exchangeInvoice);
    }

    // Warranty: a line that came back in full is void; if only some pairs came back, the rest keep their warranty.
    if (settings.warranty.voidOnReturn) {
      for (const ri of items) {
        const it = inv.items.find((i) => i.id === ri.invoiceItemId)!;
        if (it.returnedQty + ri.qty >= it.qty) voidWarrantiesForOrderItem(inv.id, it.variantId, `Returned on ${returnNumber}`);
      }
    }

    setInvoices((prev) => {
      const updated = prev.map((x) =>
        x.id !== inv.id
          ? x
          : {
              ...x,
              items: x.items.map((it) => {
                const ri = items.find((r) => r.invoiceItemId === it.id);
                return ri ? { ...it, returnedQty: it.returnedQty + ri.qty, returnedValue: roundMoney(it.returnedValue + ri.value) } : it;
              }),
            }
      );
      return exchangeInvoice ? [exchangeInvoice, ...updated] : updated;
    });
    setReturns((prev) => [ret, ...prev]);

    if (refundAmount > 0 && ret.refundMethod === "cash") {
      const movement: CashMovement = { id: crypto.randomUUID(), type: "out", amount: refundAmount, kind: "refund", reason: `${ret.type === "exchange" ? "Exchange" : "Return"} ${returnNumber}`, at: now, by: currentUser.name, ref: returnNumber };
      setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, movements: [...s.movements, movement] } : s)));
    }

    log({
      module: "POS",
      action: "create",
      entity: `${ret.type === "exchange" ? "Exchange" : "Return"} ${returnNumber}`,
      summary: `${items.reduce((s, i) => s + i.qty, 0)} item(s) taken back from ${inv.invoiceNumber} (৳${credit})${exchangeInvoice ? `; exchanged for ${exchangeInvoice.invoiceNumber} (৳${exchangeInvoice.total})` : ""}${refundAmount > 0 ? `; ৳${refundAmount} refunded by ${ret.refundMethod}` : ""}`,
      after: { items: items.map((i) => ({ sku: i.sku, qty: i.qty, condition: i.condition, reason: i.reason })), credit, refundAmount, refundMethod: ret.refundMethod },
    });
    if (exchangeInvoice && exchange) discountNote(exchange.totals, exchangeInvoice.invoiceNumber, exchange.draft);

    return { ok: true, ret, exchangeInvoice };
  }

  // ---- held sales -------------------------------------------------------------------------------------

  function holdSale(name: string, draft: SaleDraft): Result<{ held: HeldSale }> {
    if (!can("pos", "create")) return fail("Your role can't hold sales.");
    if (!draft.lines.length) return fail("There's nothing in the cart to hold.");
    const h: HeldSale = { ...draft, id: crypto.randomUUID(), name: name.trim() || "Held sale", cashierId: currentUser.id, cashierName: currentUser.name, createdAt: new Date().toISOString() };
    setHeld((prev) => [h, ...prev]);
    return { ok: true, held: h };
  }

  const removeHeld = (id: string) => setHeld((prev) => prev.filter((h) => h.id !== id));

  const value = useMemo<PosContextValue>(
    () => ({
      invoices,
      sessions,
      returns,
      held,
      hydrated,
      mySession,
      discountPolicy,
      getInvoice,
      getSession,
      getReturn,
      summaryFor,
      openSession,
      closeSession,
      addCashMovement,
      resolveDraft,
      completeWalkInSale,
      createDeliverySale,
      voidInvoice,
      processReturn,
      holdSale,
      removeHeld,
      saleWasRolledBack,
      stopWatchingSale: untrackSale,
    }),
    // The actions close over live products / orders / settings, so those are dependencies too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, sessions, returns, held, hydrated, rolledBack, products, settings, currentUser, currentRole, isSuperAdmin, getOrder, createOrder, cancelOrder]
  );

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error("usePos must be used within a PosProvider");
  return ctx;
}

