import test from "node:test";
import assert from "node:assert/strict";
import { buildAllocationIndex, computeSettlement, expectedSettlement, policyExpected } from "./compute";
import { applyRuntime, runtime } from "@/lib/settings/runtime";
import type { Order } from "@/lib/orders/types";
import type { CourierPayout } from "./types";

function baseOrder(over: Partial<Order> = {}): Order {
  return {
    id: "o-1",
    orderNumber: "ORD-1",
    status: "partial_delivered",
    customerName: "Test Customer",
    phone: "01700000000",
    address: "Somewhere",
    items: [
      { id: "i-1", productId: "p-1", productName: "Shoe", variantId: "v-1", color: "Black", size: "42", sku: "SKU-1", price: 1500, qty: 2, discount: 0 },
      { id: "i-2", productId: "p-1", productName: "Shoe", variantId: "v-1", color: "Black", size: "43", sku: "SKU-2", price: 1500, qty: 1, discount: 0 },
    ],
    deliveryCharge: 100,
    courier: { company: "Steadfast", trackingId: "STF-1", forwardCost: 130, returnCost: 130, otherCost: 0 },
    delivery: { customerPaid: 100, itemsKept: [{ itemId: "i-1", qty: 1 }] },
    returnInfo: { returnRequired: true, returnReceived: false },
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    activity: [],
    ...over,
  } as Order;
}

function payout(orderId: string, amount: number): CourierPayout {
  return {
    id: "pay-1",
    payoutNumber: "PAY-1001",
    courier: "Steadfast",
    amount,
    paidDate: "2026-11-05",
    allocations: [{ orderId, amount }],
    createdAt: "2026-11-05T00:00:00.000Z",
  };
}

test.beforeEach(() => {
  applyRuntime({ settlementMode: "auto_override", codChargePct: 1, riskManagementPct: 0 });
});

// ---- the reported bug -----------------------------------------------------------------

test("a partial delivery marked settled on the order stays Settled even when nothing is expected", () => {
  // The customer paid only the delivery charge, so the courier owes the shop nothing.
  const order = baseOrder({ delivery: { customerPaid: 100, settlementStatus: "settled" } });
  assert.equal(policyExpected(order), 0, "nothing is expected from the courier");

  const row = computeSettlement(order, buildAllocationIndex([]), {});
  assert.equal(row.status, "Settled", "an order marked settled on the order itself must stay Settled");
  assert.equal(row.legacy, true);
  assert.equal(row.applies, true, "it must still be visible in the Settlement report");
  assert.equal(row.pending, 0);
});

test("a partial delivery with a settled flag and a zero expected amount is not left Unsettled", () => {
  const order = baseOrder({ delivery: { customerPaid: 0, settlementStatus: "settled" } });
  const row = computeSettlement(order, buildAllocationIndex([]), {});
  assert.equal(row.status, "Settled");
  assert.equal(row.applies, true);
});

test("a partial delivery the courier owes nothing for is not tracked at all", () => {
  const order = baseOrder({ delivery: { customerPaid: 100 } });
  const row = computeSettlement(order, buildAllocationIndex([]), {});
  // Nothing to collect → it is not outstanding settlement money, so it is not tracked.
  assert.equal(row.expected, 0);
  assert.equal(row.applies, false);
});

test("a partial delivery is never settled for its full COD", () => {
  // The customer paid nothing on a partial delivery: the expectation must be 0, not the order value.
  const order = baseOrder({ delivery: { customerPaid: 0 } });
  assert.equal(expectedSettlement(order), 0);
});

// ---- behaviour that must not change -----------------------------------------------------

test("a partial delivery with an expected amount and no payout is Unsettled", () => {
  const order = baseOrder({ delivery: { customerPaid: 1500 } });
  const row = computeSettlement(order, buildAllocationIndex([]), {});
  assert.ok(row.expected > 0);
  assert.equal(row.status, "Unsettled");
  assert.equal(row.applies, true);
});

test("a partial delivery with a full payout is Settled", () => {
  const order = baseOrder({ delivery: { customerPaid: 1500 } });
  const expected = policyExpected(order);
  const row = computeSettlement(order, buildAllocationIndex([payout("o-1", expected)]), {});
  assert.equal(row.received, expected);
  assert.equal(row.status, "Settled");
  assert.equal(row.pending, 0);
});

test("a partial delivery with a partial payout is Partially Settled", () => {
  const order = baseOrder({ delivery: { customerPaid: 1500 } });
  const expected = policyExpected(order);
  const row = computeSettlement(order, buildAllocationIndex([payout("o-1", expected / 2)]), {});
  assert.equal(row.status, "Partially Settled");
  assert.equal(row.pending, Math.round((expected - expected / 2) * 100) / 100);
});

test("a delivered order marked settled on the order counts as Settled (legacy)", () => {
  const order = baseOrder({ status: "delivered", delivery: { customerPaid: 3000, settlementStatus: "settled" } });
  const row = computeSettlement(order, buildAllocationIndex([]), {});
  assert.equal(row.status, "Settled");
  assert.equal(row.legacy, true);
});

test("a delivered order with no payout and no flag is Unsettled", () => {
  const order = baseOrder({ status: "delivered", delivery: { customerPaid: 3000 } });
  const row = computeSettlement(order, buildAllocationIndex([]), {});
  assert.equal(row.status, "Unsettled");
});

test("an admin override sets the expected amount for a partial delivery", () => {
  const order = baseOrder({ delivery: { customerPaid: 100 } });
  const row = computeSettlement(order, buildAllocationIndex([]), { "o-1": { expected: 500 } });
  assert.equal(row.expected, 500);
  assert.equal(row.overridden, true);
  assert.equal(row.applies, true);
  assert.equal(row.status, "Unsettled");
});

test("a refused return has no settlement expectation", () => {
  const order = baseOrder({ status: "refuse_return", delivery: { customerPaid: 0 } });
  const row = computeSettlement(order, buildAllocationIndex([]), {});
  assert.equal(row.expected, 0);
  assert.equal(row.applies, false);
});

test("the cod and risk percentages are taken off the expected amount", () => {
  applyRuntime({ settlementMode: "auto_override", codChargePct: 2, riskManagementPct: 3 });
  const order = baseOrder({ delivery: { customerPaid: 1500 } });
  // 1500 - 260 courier cost - 2% - 3%
  assert.equal(policyExpected(order), 1500 - 260 - 30 - 45);
});

test("manual mode only counts typed amounts", () => {
  applyRuntime({ settlementMode: "manual" });
  const order = baseOrder({ delivery: { customerPaid: 1500 } });
  const row = computeSettlement(order, buildAllocationIndex([]), {});
  assert.equal(row.expected, 0);
  const typed = computeSettlement(order, buildAllocationIndex([]), { "o-1": { expected: 700 } });
  assert.equal(typed.expected, 700);
  assert.equal(typed.applies, true);
  assert.equal(runtime.settlementMode, "manual");
});
