import { test } from "node:test";
import assert from "node:assert/strict";
import { orderInfoText } from "./utils";
import type { Order } from "./types";

function order(over: Partial<Order> = {}): Order {
  return {
    id: "o1",
    orderNumber: "ORD-100",
    status: "pending",
    customerName: "Rahim Ahmed",
    phone: "01712000000",
    address: "House 12, Road 4",
    area: "Mirpur",
    district: "Dhaka",
    items: [
      { id: "i1", productId: "p1", productName: "Shoe A", variantId: "v1", color: "Black", size: "40", sku: "NK-40-BLK", price: 1000, qty: 1, discount: 0 },
      { id: "i2", productId: "p2", productName: "Shoe B", variantId: "v2", color: "White", size: "41", sku: "AD-41-WHT", price: 500, qty: 1, discount: 0 },
    ],
    deliveryCharge: 100,
    courier: { company: "", trackingId: "", forwardCost: 0, returnCost: 0, otherCost: 0 },
    delivery: { customerPaid: 0 },
    returnInfo: { returnRequired: false, returnReceived: false },
    cancellation: {},
    activity: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...over,
  } as Order;
}

test("copy info includes the customer, full address, SKUs and expected COD", () => {
  assert.equal(
    orderInfoText(order()),
    [
      "Order: #ORD-100",
      "Name: Rahim Ahmed",
      "Phone: 01712000000",
      "Address: House 12, Road 4, Mirpur, Dhaka",
      "SKU: NK-40-BLK, AD-41-WHT",
      "COD: ৳1,600.00",
    ].join("\n")
  );
});

test("copy info deduplicates repeated SKUs and omits empty address parts", () => {
  const o = order({
    district: "",
    items: [
      { id: "i1", productId: "p1", productName: "Shoe A", variantId: "v1", color: "", size: "", sku: "NK-40-BLK", price: 1000, qty: 1, discount: 0 },
      { id: "i2", productId: "p1", productName: "Shoe A", variantId: "v1", color: "", size: "", sku: "NK-40-BLK", price: 1000, qty: 1, discount: 0 },
    ],
  });
  assert.ok(orderInfoText(o).includes("Address: House 12, Road 4, Mirpur\n"));
  assert.ok(orderInfoText(o).includes("SKU: NK-40-BLK\n"));
});
