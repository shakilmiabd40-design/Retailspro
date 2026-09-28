// Run with:  npm run test:pos
import { test } from "node:test";
import assert from "node:assert/strict";
import type { CartLine, PosInvoice, PosInvoiceItem, PosSession } from "./types";
import { checkPayments, computeTotals, discountAmount, discountCapFor, discountLimitError, invoiceByMethod, invoiceCashNet, isWithinReturnWindow, refundValueFor, returnState, sessionSummary } from "./utils";

const line = (over: Partial<CartLine> & { price: number; qty: number }): CartLine => ({
  key: over.variantId ?? "v",
  productId: "p",
  productName: "Shoe",
  variantId: "v",
  color: "Black",
  size: "42",
  sku: "SKU",
  cost: 0,
  discountType: "fixed",
  discountValue: 0,
  ...over,
});

test("no discount: total is price × qty", () => {
  const t = computeTotals([line({ price: 1500, qty: 2 })], { type: "fixed", value: 0 }, 0, 0, 2);
  assert.equal(t.subtotal, 3000);
  assert.equal(t.total, 3000);
});

test("percent and fixed line discounts, never below zero or above the line", () => {
  assert.equal(discountAmount("percent", 10, 2000, 2), 200);
  assert.equal(discountAmount("fixed", 5000, 2000, 2), 2000);
  assert.equal(discountAmount("percent", 250, 2000, 2), 2000);
  assert.equal(discountAmount("fixed", -5, 2000, 2), 0);
});

test("cart discount is spread over the lines and adds up exactly", () => {
  const lines = [line({ variantId: "a", price: 1000, qty: 1 }), line({ variantId: "b", price: 1000, qty: 1 }), line({ variantId: "c", price: 1000, qty: 1 })];
  const t = computeTotals(lines, { type: "fixed", value: 100 }, 0, 0, 2);
  assert.equal(t.cartDiscount, 100);
  assert.equal(t.lines.reduce((s, l) => s + l.cartDiscount, 0), 100);
  assert.equal(t.total, 2900);
  assert.equal(t.lines.reduce((s, l) => s + l.net, 0), 2900);
});

test("line discount + cart discount stack, cart discount applies to the reduced amount", () => {
  const t = computeTotals([line({ price: 1000, qty: 2, discountType: "percent", discountValue: 10 })], { type: "percent", value: 10 }, 0, 0, 2);
  assert.equal(t.itemDiscount, 200); // 10% of 2000
  assert.equal(t.cartDiscount, 180); // 10% of 1800
  assert.equal(t.total, 1620);
  assert.equal(Math.round(t.discountPct * 100) / 100, 19);
});

test("VAT is charged after discounts; delivery is neither taxed nor discounted", () => {
  const t = computeTotals([line({ price: 1000, qty: 1 })], { type: "percent", value: 10 }, 5, 60, 2);
  assert.equal(t.vat, 45); // 5% of 900
  assert.equal(t.total, 900 + 45 + 60);
});

test("whole-taka rounding keeps every stored amount a whole number", () => {
  const t = computeTotals([line({ variantId: "a", price: 999, qty: 1 }), line({ variantId: "b", price: 333, qty: 1 })], { type: "percent", value: 7 }, 5, 0, 0);
  for (const l of t.lines) for (const n of [l.discount, l.cartDiscount, l.net, l.vat]) assert.equal(n, Math.round(n));
  assert.equal(t.total, t.lines.reduce((s, l) => s + l.net + l.vat, 0));
});

test("discount limits: per line and for the whole sale, none for overriders", () => {
  const t = computeTotals([line({ price: 1000, qty: 1, discountType: "percent", discountValue: 10 })], { type: "fixed", value: 0 }, 0, 0, 2);
  assert.match(discountLimitError(t, 5) ?? "", /limit is 5%/);
  assert.equal(discountLimitError(t, 10), null);
  assert.equal(discountLimitError(t, null), null);
  const whole = computeTotals([line({ variantId: "a", price: 1000, qty: 1, discountType: "percent", discountValue: 4 }), line({ variantId: "b", price: 1000, qty: 1 })], { type: "percent", value: 4 }, 0, 0, 2);
  assert.match(discountLimitError(whole, 5) ?? "", /in total/);
  assert.equal(discountCapFor({ roleId: "r", canOverride: false, byRole: { r: 8 }, fallback: 10 }), 8);
  assert.equal(discountCapFor({ roleId: "x", canOverride: false, byRole: {}, fallback: 10 }), 10);
  assert.equal(discountCapFor({ roleId: "r", canOverride: true, byRole: { r: 8 }, fallback: 10 }), null);
});

test("payments: exact, cash change, split, short and card over-payment", () => {
  assert.equal(checkPayments([{ method: "cash", amount: 1000 }], 1000).ok, true);
  const change = checkPayments([{ method: "cash", amount: 2000 }], 1350);
  assert.equal(change.ok, true);
  assert.equal(change.change, 650);
  assert.equal(checkPayments([{ method: "card", amount: 600 }, { method: "cash", amount: 500 }], 1000).change, 100);
  const short = checkPayments([{ method: "cash", amount: 900 }], 1000);
  assert.equal(short.ok, false);
  assert.equal(short.balance, 100);
  assert.equal(checkPayments([{ method: "card", amount: 1200 }], 1000).ok, false);
  assert.equal(checkPayments([{ method: "cash", amount: 0 }], 0).ok, false);
});

const item = (over: Partial<PosInvoiceItem> = {}): PosInvoiceItem => ({ id: "i1", productId: "p", productName: "Shoe", variantId: "v", color: "Black", size: "42", sku: "S", price: 333, cost: 200, qty: 3, discount: 0, cartDiscount: 0, net: 1000, vat: 0, returnedQty: 0, returnedValue: 0, ...over });

test("refunds: partial returns never over- or under-pay the line", () => {
  let it = item();
  let paid = 0;
  for (const q of [1, 1, 1]) {
    const v = refundValueFor(it, q);
    paid += v;
    it = { ...it, returnedQty: it.returnedQty + q, returnedValue: it.returnedValue + v };
  }
  assert.equal(paid, 1000);
  assert.equal(refundValueFor(it, 1), 0); // nothing left
});

test("refund includes the VAT that was charged", () => {
  assert.equal(refundValueFor(item({ qty: 2, net: 2000, vat: 100 }), 1), 1050);
});

const inv = (over: Partial<PosInvoice>): PosInvoice => ({
  id: "x", invoiceNumber: "INV-1", status: "completed", saleType: "walk_in", sessionId: "s1", cashierId: "u", cashierName: "U",
  customer: { walkIn: true, name: "Walk-in customer" }, items: [item()], subtotal: 0, itemDiscount: 0, cartDiscount: 0, vatPercent: 0, vat: 0,
  deliveryCharge: 0, total: 0, payments: [], tendered: 0, change: 0, discountLog: [], createdAt: new Date().toISOString(), ...over,
});

test("cash kept = cash handed over − change; card and mobile are separate", () => {
  const i = inv({ payments: [{ id: "1", method: "cash", amount: 1000 }, { id: "2", method: "card", amount: 500 }], change: 150 });
  assert.equal(invoiceCashNet(i), 850);
  assert.deepEqual(invoiceByMethod(i), { cash: 850, card: 500, mobile_banking: 0 });
  const credit = inv({ payments: [{ id: "1", method: "exchange_credit", amount: 900 }] });
  assert.equal(invoiceCashNet(credit), 0);
  assert.equal(invoiceByMethod(credit).cash, 0);
});

test("session expected cash: opening + cash sales + cash in − cash out, voided sales included, their refund is a cash-out", () => {
  const session: PosSession = {
    id: "s1", sessionNumber: "SES-1", status: "open", cashierId: "u", cashierName: "U", openedAt: new Date().toISOString(), openingCash: 5000,
    movements: [
      { id: "m1", type: "in", amount: 200, kind: "manual", reason: "float", at: "", by: "" },
      { id: "m2", type: "out", amount: 300, kind: "manual", reason: "tea", at: "", by: "" },
      { id: "m3", type: "out", amount: 1000, kind: "refund", reason: "Void INV-2", at: "", by: "" },
    ],
  };
  const invoices = [
    inv({ id: "a", total: 2000, payments: [{ id: "1", method: "cash", amount: 2000 }] }),
    inv({ id: "b", total: 1000, status: "void", payments: [{ id: "2", method: "cash", amount: 1000 }] }),
    inv({ id: "c", total: 800, payments: [{ id: "3", method: "card", amount: 800 }] }),
    inv({ id: "d", sessionId: "other", total: 999, payments: [{ id: "4", method: "cash", amount: 999 }] }),
  ];
  const s = sessionSummary(session, invoices);
  assert.equal(s.cashSales, 3000);
  assert.equal(s.cardSales, 800);
  assert.equal(s.expectedCash, 5000 + 3000 + 200 - 300 - 1000);
  assert.equal(s.invoices, 3);
  assert.equal(s.voided, 1);
  assert.equal(s.salesTotal, 2800); // void excluded
});

test("return state and return window", () => {
  assert.equal(returnState({ items: [item({ returnedQty: 0 })] }), "none");
  assert.equal(returnState({ items: [item({ returnedQty: 1 })] }), "partial");
  assert.equal(returnState({ items: [item({ returnedQty: 3 })] }), "full");
  const day = 24 * 60 * 60 * 1000;
  assert.equal(isWithinReturnWindow({ createdAt: new Date(Date.now() - 6 * day).toISOString() }, 7), true);
  assert.equal(isWithinReturnWindow({ createdAt: new Date(Date.now() - 8 * day).toISOString() }, 7), false);
  assert.equal(isWithinReturnWindow({ createdAt: new Date(Date.now() - 800 * day).toISOString() }, 0), true);
});
