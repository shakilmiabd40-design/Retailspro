// Run with:  npm run test:validate
// The sync API stores whatever the browser sends, so these guard the invariants that no legitimate screen
// ever breaks. A valid record must pass untouched; only clearly-corrupt values are rejected (422).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOrder, validateProduct } from "./validate";

const is422 = (err: unknown) => {
  const e = err as { status?: number; code?: string };
  return e?.status === 422 && e?.code === "invalid_field";
};

const order = (over: Record<string, unknown> = {}) => ({
  id: "o1",
  orderNumber: "ORD-10241",
  status: "pending",
  customerName: "A",
  phone: "01700000000",
  address: "House 1, Road 2",
  items: [{ id: "i1", productId: "p1", productName: "Shoe", variantId: "v1", color: "Black", size: "42", sku: "S1", price: 1000, qty: 2, discount: 0 }],
  deliveryCharge: 60,
  courier: { company: "", trackingId: "", forwardCost: 0, returnCost: 0, otherCost: 0 },
  delivery: { customerPaid: 0 },
  returnInfo: { returnRequired: false, returnReceived: false },
  cancellation: {},
  activity: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

const product = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "Shoe",
  sku: "S1",
  brand: "B",
  category: "C",
  status: "active",
  costPrice: 500,
  sellingPrice: 1000,
  colors: ["Black"],
  sizes: ["42"],
  variants: [{ id: "v1", color: "Black", size: "42", sku: "S1", barcode: "", cost: 500, price: 1000, stock: 10, reserved: 2, status: "active" }],
  createdAt: "2026-09-01T00:00:00.000Z",
  ...over,
});

// ── Orders ─────────────────────────────────────────────────────────────────

test("a valid order passes", () => {
  assert.doesNotThrow(() => validateOrder(order()));
  assert.doesNotThrow(() => validateOrder(order({ status: "delivered", delivery: { customerPaid: 2060 } })));
});

test("an unknown status is rejected", () => {
  assert.throws(() => validateOrder(order({ status: "paid" })), is422);
  assert.throws(() => validateOrder(order({ status: "" })), is422);
});

test("negative money is rejected everywhere it appears", () => {
  assert.throws(() => validateOrder(order({ deliveryCharge: -1 })), is422);
  assert.throws(() => validateOrder(order({ courier: { forwardCost: -5, returnCost: 0, otherCost: 0 } })), is422);
  assert.throws(() => validateOrder(order({ delivery: { customerPaid: -100 } })), is422);
  assert.throws(() => validateOrder(order({ orderDiscount: -10 })), is422);
});

test("a line discount can equal but never exceed the line total", () => {
  const items = [{ id: "i1", productId: "p1", productName: "S", variantId: "v1", color: "B", size: "42", sku: "S1", price: 333, qty: 3, discount: 999 }];
  assert.doesNotThrow(() => validateOrder(order({ items }))); // 333×3 = 999
  assert.throws(() => validateOrder(order({ items: [{ ...items[0], discount: 999.05 }] })), is422);
  assert.throws(() => validateOrder(order({ items: [{ ...items[0], discount: -1 }] })), is422);
});

test("item quantity must be a whole number of 1 or more; price can't be negative", () => {
  const base = { id: "i1", productId: "p1", productName: "S", variantId: "v1", color: "B", size: "42", sku: "S1", price: 100, discount: 0 };
  assert.throws(() => validateOrder(order({ items: [{ ...base, qty: 0 }] })), is422);
  assert.throws(() => validateOrder(order({ items: [{ ...base, qty: 1.5 }] })), is422);
  assert.throws(() => validateOrder(order({ items: [{ ...base, qty: 2, price: -1 }] })), is422);
  assert.doesNotThrow(() => validateOrder(order({ items: [{ ...base, qty: 2 }] })));
});

test("a non-object order is rejected", () => {
  assert.throws(() => validateOrder(null), is422);
  assert.throws(() => validateOrder("nope"), is422);
});

// ── Products ───────────────────────────────────────────────────────────────

test("a valid product passes, including a legacy variant with no reserved field", () => {
  assert.doesNotThrow(() => validateProduct(product()));
  const legacy = { id: "v1", color: "Black", size: "42", sku: "S1", barcode: "", cost: 500, price: 1000, stock: 10, status: "active" };
  assert.doesNotThrow(() => validateProduct(product({ variants: [legacy] })));
});

test("negative stock, reserved, cost or price is rejected", () => {
  const v = (over: Record<string, unknown>) => product({ variants: [{ id: "v1", color: "B", size: "42", sku: "S1", barcode: "", cost: 500, price: 1000, stock: 10, reserved: 0, status: "active", ...over }] });
  assert.throws(() => validateProduct(v({ stock: -1 })), is422);
  assert.throws(() => validateProduct(v({ reserved: -1 })), is422);
  assert.throws(() => validateProduct(v({ cost: -1 })), is422);
  assert.throws(() => validateProduct(v({ price: -1 })), is422);
});

test("negative product-level cost/selling/discount price is rejected", () => {
  assert.throws(() => validateProduct(product({ costPrice: -1 })), is422);
  assert.throws(() => validateProduct(product({ sellingPrice: -5 })), is422);
  assert.throws(() => validateProduct(product({ discountPrice: -5 })), is422);
});

test("NaN and Infinity are rejected (a JSON round-trip can't produce them, but a forged body can)", () => {
  assert.throws(() => validateProduct(product({ costPrice: Number.NaN })), is422);
  assert.throws(() => validateProduct(product({ sellingPrice: Number.POSITIVE_INFINITY })), is422);
});
