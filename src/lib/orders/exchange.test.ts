import { test } from "node:test";
import assert from "node:assert/strict";
import { collectedAmount, courierLoss, courierProfit, expectedCod, grossRevenue, productSales, salesRevenue } from "./utils";
import type { Order } from "./types";

function order(over: Partial<Order> = {}): Order {
  return {
    id: "o1", orderNumber: "ORD-1", status: "delivered", customerName: "A", phone: "017", address: "x",
    items: [{ id: "i1", productId: "p", productName: "Shoe", variantId: "v", color: "", size: "", sku: "", price: 1000, qty: 1, discount: 0 }],
    deliveryCharge: 100,
    courier: { company: "Steadfast", trackingId: "1", forwardCost: 125, returnCost: 0, otherCost: 0 },
    delivery: { customerPaid: 0 },
    returnInfo: { returnRequired: false, returnReceived: false },
    cancellation: {}, activity: [], createdAt: "2026-01-01", updatedAt: "2026-01-01",
    ...over,
  } as Order;
}

test("exchange COD = new items − credit + delivery charge, never below 0", () => {
  assert.equal(expectedCod(order()), 1100);
  assert.equal(expectedCod(order({ exchange: { originalOrderId: "x", originalOrderNumber: "ORD-0", credit: 1000 } })), 100);
  assert.equal(expectedCod(order({ exchange: { originalOrderId: "x", originalOrderNumber: "ORD-0", credit: 5000 } })), 0);
});

test("delivered exchange: COD above the courier charge is courier profit, below is courier loss", () => {
  const ex = { originalOrderId: "x", originalOrderNumber: "ORD-0", credit: 1000 };
  const profit = order({ exchange: ex, delivery: { customerPaid: 130 } });
  assert.equal(courierProfit(profit), 5);
  assert.equal(courierLoss(profit), 0);
  const loss = order({ exchange: ex, delivery: { customerPaid: 100 } });
  assert.equal(courierLoss(loss), 25);
  assert.equal(courierProfit(loss), 0);
  // COD of ৳0 (free exchange): the whole courier charge is a loss, using the expected COD when nothing was recorded
  const free = order({ exchange: { ...ex, credit: 1100 } });
  assert.equal(collectedAmount(free), 0);
  assert.equal(courierLoss(free), 125);
});

test("a normal delivered order has no courier profit/loss", () => {
  const o = order({ delivery: { customerPaid: 1100 } });
  assert.equal(courierProfit(o), 0);
  assert.equal(courierLoss(o), 0);
});

test("once the exchange parcel is delivered the original keeps only its delivery charge", () => {
  const original = order({ exchangeMoved: 1000 });
  assert.equal(productSales(original), 0);
  assert.equal(grossRevenue(original), 100);
  assert.equal(salesRevenue(original), 100 - 125);
  // before that, nothing changes
  assert.equal(grossRevenue(order()), 1100);
});
