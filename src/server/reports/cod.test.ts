// Run with:  npm run test:reports
import { test } from "node:test";
import assert from "node:assert/strict";
import { codExpected, collectedFor, computeCodPending, type CodOrderInput, type CodSettings } from "./cod";

const settings = (over: Partial<CodSettings> = {}): CodSettings => ({
  settlementMode: "auto",
  codChargePct: 1,
  riskManagementPct: 0,
  ...over,
});

const order = (over: Partial<CodOrderInput> = {}): CodOrderInput => ({
  id: "o1",
  status: "delivered",
  deliveryDay: "2026-11-01",
  customerPaid: 1000,
  expectedCod: 900,
  forwardCost: 60,
  returnCost: 0,
  otherCost: 0,
  legacySettled: false,
  ...over,
});

test("collectedFor prefers recorded payment but falls back for delivered orders", () => {
  assert.equal(collectedFor({ status: "delivered", customerPaid: 850, expectedCod: 900 }), 850);
  assert.equal(collectedFor({ status: "delivered", customerPaid: 0, expectedCod: 900 }), 900);
  assert.equal(collectedFor({ status: "partial_delivered", customerPaid: 0, expectedCod: 900 }), 0);
  assert.equal(collectedFor({ status: "partial_delivered", customerPaid: 400, expectedCod: 900 }), 400);
});

test("codExpected applies courier costs then the COD charge percentage", () => {
  // 1000 - 60 - 1% of 1000 = 930
  assert.equal(codExpected(order(), settings()), 930);
});

test("codExpected adds risk-management percentage and clamps at zero", () => {
  // 1000 - 60 - 10 - 5% of 1000 = 880
  assert.equal(
    codExpected(order(), settings({ codChargePct: 1, riskManagementPct: 5 })),
    880,
  );
  // costs exceed collection: never negative
  assert.equal(codExpected(order({ customerPaid: 50, forwardCost: 100 }), settings()), 0);
});

test("codExpected honours the settlement mode", () => {
  const withOverride = order({ overrideExpected: 700 });

  // auto ignores a stored override
  assert.equal(codExpected(withOverride, settings({ settlementMode: "auto" })), 930);
  // auto_override uses it
  assert.equal(codExpected(withOverride, settings({ settlementMode: "auto_override" })), 700);
  // manual uses only typed amounts
  assert.equal(codExpected(withOverride, settings({ settlementMode: "manual" })), 700);
  assert.equal(codExpected(order(), settings({ settlementMode: "manual" })), 0);
});

test("computeCodPending applies allocations and splits ageing buckets", () => {
  const orders = [
    order({ id: "age7", deliveryDay: "2026-11-02", customerPaid: 1000 }), // age 8 → 8-14
    order({ id: "age8", deliveryDay: "2026-11-03", customerPaid: 1000 }), // age 7 → 0-7
    order({ id: "age15", deliveryDay: "2026-10-18", customerPaid: 1000 }), // age 23 → 15+
    order({ id: "partial", deliveryDay: "2026-11-09", customerPaid: 1000 }), // age 1, partly paid
    order({ id: "settled", deliveryDay: "2026-11-09", customerPaid: 1000 }), // fully allocated
  ];
  const received = new Map<string, number>([
    ["partial", 200],
    ["settled", 930],
  ]);

  const out = computeCodPending(orders, received, settings(), "2026-11-10");

  const one = 930; // 1000 - 60 - 1%
  assert.equal(out.expectedTotal, one * 5);
  assert.equal(out.receivedTotal, 200 + 930);
  assert.equal(out.total, one * 3 + (one - 200));
  assert.equal(out.openOrders, 4);
  // age 8 lands in 8-14, age 7 in 0-7
  assert.equal(out.pending0to7, one + (one - 200));
  assert.equal(out.pending8to14, one);
  assert.equal(out.pending15plus, one);
});

test("computeCodPending treats a legacy settled flag as paid when nothing was recorded", () => {
  const out = computeCodPending(
    [order({ id: "legacy", legacySettled: true })],
    new Map(),
    settings(),
    "2026-11-10",
  );
  assert.equal(out.total, 0);
  assert.equal(out.openOrders, 0);
  assert.equal(out.expectedTotal, 930);
  assert.equal(out.receivedTotal, 930);
});

test("computeCodPending skips zero-value orders and counts undated ones as current", () => {
  const out = computeCodPending(
    [
      order({ id: "zero", customerPaid: 0, expectedCod: 0, forwardCost: 0 }),
      order({ id: "no-day", deliveryDay: null, customerPaid: 1000 }),
    ],
    new Map(),
    settings(),
    "2026-11-10",
  );
  assert.equal(out.total, 930);
  assert.equal(out.openOrders, 1);
  assert.equal(out.pending0to7, 930);
});
