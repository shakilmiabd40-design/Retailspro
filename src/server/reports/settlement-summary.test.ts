// Run with:  npm run test:reports
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Order } from "@/lib/orders/types";
import type { CodSettings } from "./cod";
import { policyExpectedFor, settlementPositionFor } from "./settlement-summary";

const auto: CodSettings = { settlementMode: "auto", codChargePct: 0, riskManagementPct: 0 };

const order = (over: Partial<Order> = {}): Order => ({
  id: "o1",
  orderNumber: "1001",
  status: "delivered",
  customerName: "Customer",
  phone: "01700000000",
  address: "Dhaka",
  items: [{ id: "i1", productId: "p1", productName: "Shoe", variantId: "v1", color: "Black", size: "42", sku: "SKU", price: 1000, qty: 1, discount: 0 }],
  deliveryCharge: 100,
  courier: { company: "Steadfast", trackingId: "", forwardCost: 60, returnCost: 0, otherCost: 0 },
  delivery: { customerPaid: 1040, deliveryDate: "2026-11-01" },
  returnInfo: { returnRequired: false, returnReceived: false },
  cancellation: {},
  activity: [],
  createdAt: "2026-10-30T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  ...over,
});

test("policy expected follows the courier settlement formula", () => {
  assert.equal(policyExpectedFor(order(), auto), 980); // 1040 collected − 60 cost
  assert.equal(policyExpectedFor(order({ status: "partial_delivered", delivery: { customerPaid: 500 } }), auto), 440); // 500 − 60
  assert.equal(policyExpectedFor(order({ status: "refuse_return" }), auto), 0);
  assert.equal(policyExpectedFor(order(), { ...auto, codChargePct: 1 }), 969.6); // 1040 − 60 − 10.4
});

test("auto settlement is unsettled until allocations cover the expected amount", () => {
  const none = settlementPositionFor(order(), new Map(), auto);
  assert.equal(none.expected, 980);
  assert.equal(none.received, 0);
  assert.equal(none.status, "Unsettled");
  assert.equal(none.applies, true);

  const partial = settlementPositionFor(order(), new Map([["o1", 400]]), auto);
  assert.equal(partial.pending, 580);
  assert.equal(partial.status, "Partially Settled");

  const settled = settlementPositionFor(order(), new Map([["o1", 980]]), auto);
  assert.equal(settled.pending, 0);
  assert.equal(settled.status, "Settled");
});

test("a legacy settled flag counts as paid when the ledger has no allocation", () => {
  const position = settlementPositionFor(order({ delivery: { customerPaid: 1040, deliveryDate: "2026-11-01", settlementStatus: "settled" } }), new Map(), auto);
  assert.equal(position.legacy, true);
  assert.equal(position.received, 980);
  assert.equal(position.status, "Settled");
});

test("auto + override uses the typed amount; manual ignores the policy", () => {
  const overridden = settlementPositionFor(order(), new Map(), { ...auto, settlementMode: "auto_override" }, 500);
  assert.equal(overridden.overridden, true);
  assert.equal(overridden.expected, 500);
  assert.equal(overridden.pending, 500);

  const manual = settlementPositionFor(order(), new Map(), { ...auto, settlementMode: "manual" });
  assert.equal(manual.expected, 0);
  assert.equal(manual.applies, true);
  assert.equal(manual.status, "Unsettled");
});

test("Refuse Return only enters settlement tracking when an override expects money", () => {
  const refused = order({ status: "refuse_return", delivery: { customerPaid: 0 } });
  assert.equal(settlementPositionFor(refused, new Map(), auto).applies, false);
  assert.equal(settlementPositionFor(refused, new Map(), { ...auto, settlementMode: "auto_override" }, 100).applies, true);
});
