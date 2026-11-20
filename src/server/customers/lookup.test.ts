// Run with:  npm run test:customers
import { test } from "node:test";
import assert from "node:assert/strict";
import type { LookupOrder } from "@/lib/customers/types";
import { aggregateCustomerHistory, emptyCustomerLookup, mapPosHistoryRows } from "./lookup";

const order = (over: Partial<LookupOrder> = {}): LookupOrder => ({
  id: "o1",
  orderNumber: "ORD-1001",
  status: "delivered",
  createdAt: "2026-11-01T10:00:00.000Z",
  total: 100,
  ...over,
});

test("no orders gives an empty but valid result with all status counts", () => {
  const result = aggregateCustomerHistory([]);
  assert.deepEqual(result, emptyCustomerLookup());
  assert.equal(result.found, false);
  assert.equal(result.total, 0);
  assert.deepEqual(result.counts, {
    pending: 0, processing: 0, in_transit: 0, delivered: 0, partial_delivered: 0, refuse_return: 0, cancelled: 0,
  });
});

test("mixed statuses count, rank active orders and sum only delivered totals", () => {
  const orders: LookupOrder[] = [
    order({ id: "d1", orderNumber: "ORD-1001", status: "delivered", createdAt: "2026-11-01T10:00:00.000Z", total: 100 }),
    order({ id: "d2", orderNumber: "ORD-1002", status: "delivered", createdAt: "2026-11-03T10:00:00.000Z", total: 50.5 }),
    order({ id: "r1", orderNumber: "ORD-1003", status: "refuse_return", createdAt: "2026-11-04T10:00:00.000Z", total: 80, refusalReason: "wrong_size" }),
    order({ id: "c1", orderNumber: "ORD-1004", status: "cancelled", createdAt: "2026-11-05T10:00:00.000Z", total: 70 }),
    order({ id: "p1", orderNumber: "ORD-1005", status: "pending", createdAt: "2026-11-06T10:00:00.000Z", total: 90 }),
    order({ id: "i1", orderNumber: "ORD-1006", status: "in_transit", createdAt: "2026-11-07T10:00:00.000Z", total: 90 }),
    order({ id: "pr1", orderNumber: "ORD-1007", status: "processing", createdAt: "2026-11-02T10:00:00.000Z", total: 90 }),
    order({ id: "pd1", orderNumber: "ORD-1008", status: "partial_delivered", createdAt: "2026-11-08T10:00:00.000Z", total: 30 }),
    order({ id: "i2", orderNumber: "ORD-1009", status: "in_transit", createdAt: "2026-11-09T10:00:00.000Z", total: 90 }),
  ];

  const result = aggregateCustomerHistory(orders);
  assert.equal(result.found, true);
  assert.equal(result.total, 9);
  assert.deepEqual(result.counts, {
    pending: 1, processing: 1, in_transit: 2, delivered: 2, partial_delivered: 1, refuse_return: 1, cancelled: 1,
  });
  assert.deepEqual(result.activeOrders.map((o) => o.orderNumber), ["ORD-1009", "ORD-1006", "ORD-1005"]);
  assert.deepEqual(result.lastOrder, { orderNumber: "ORD-1009", status: "in_transit", createdAt: "2026-11-09T10:00:00.000Z" });
  assert.equal(result.lifetimeDelivered, 150.5);
  assert.equal(result.lastRefusalReason, "wrong_size");
  assert.equal(result.lastRefusal?.orderNumber, "ORD-1003");
});

test("POS sales and returns join the same warning totals", () => {
  const posRows = [
    { id: "inv1", order_number: "INV-1001", status: "completed", created_at: "2026-11-10T10:00:00.000Z", total: "750.25", refusal_reason: null },
    { id: "ret1", order_number: "RET-1001", status: "return", created_at: "2026-11-11T10:00:00.000Z", total: "0", refusal_reason: "wrong_size" },
  ];
  assert.deepEqual(mapPosHistoryRows(posRows), [
    order({ id: "inv1", orderNumber: "INV-1001", status: "delivered", createdAt: "2026-11-10T10:00:00.000Z", total: 750.25, refusalReason: null }),
    order({ id: "ret1", orderNumber: "RET-1001", status: "refuse_return", createdAt: "2026-11-11T10:00:00.000Z", total: 0, refusalReason: "wrong_size" }),
  ]);

  const result = aggregateCustomerHistory([
    order({ id: "o1", orderNumber: "ORD-1001", total: 100 }),
    ...mapPosHistoryRows(posRows),
  ]);
  assert.equal(result.total, 3);
  assert.equal(result.counts.delivered, 2);
  assert.equal(result.counts.refuse_return, 1);
  assert.equal(result.lifetimeDelivered, 850.25);
  assert.equal(result.lastRefusal?.orderNumber, "RET-1001");
  assert.equal(result.lastRefusalReason, "wrong_size");
});

test("editing an order excludes only that order from the active check", () => {
  const orders = [
    order({ id: "i1", orderNumber: "ORD-2001", status: "in_transit", createdAt: "2026-11-01T10:00:00.000Z" }),
    order({ id: "i2", orderNumber: "ORD-2002", status: "pending", createdAt: "2026-11-02T10:00:00.000Z" }),
  ];
  const result = aggregateCustomerHistory(orders, "i2");
  assert.deepEqual(result.activeOrders.map((o) => o.id), ["i1"]);
  assert.equal(result.total, 2);
});

test("only cancelled orders produce no active order, refusal or lifetime value", () => {
  const result = aggregateCustomerHistory([order({ status: "cancelled", total: 250, refusalReason: "customer_refused" })]);
  assert.equal(result.found, true);
  assert.equal(result.counts.cancelled, 1);
  assert.deepEqual(result.activeOrders, []);
  assert.equal(result.lifetimeDelivered, 0);
  assert.equal(result.lastRefusal, null);
  assert.equal(result.lastRefusalReason, null);
});
