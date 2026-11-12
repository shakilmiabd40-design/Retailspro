// Run with:  npm run test:reports
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Order } from "@/lib/orders/types";
import { deliveredDayFor, finalStatusDayFor, reportDayFor } from "./order-days";

const order = (over: Partial<Order> = {}): Order => ({
  id: "o1",
  orderNumber: "1001",
  status: "delivered",
  customerName: "Customer",
  phone: "01700000000",
  address: "Dhaka",
  items: [],
  deliveryCharge: 0,
  courier: { company: "Steadfast", trackingId: "", forwardCost: 0, returnCost: 0, otherCost: 0 },
  delivery: { customerPaid: 0 },
  returnInfo: { returnRequired: false, returnReceived: false },
  cancellation: {},
  activity: [],
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

test("date-only fields keep their calendar day without a timezone shift", () => {
  // A server east of Dhaka must not turn 2026-11-01 into 2026-10-31.
  assert.equal(deliveredDayFor(order({ delivery: { customerPaid: 0, deliveryDate: "2026-11-01" } })), "2026-11-01");
  assert.equal(reportDayFor(order({ courier: { company: "X", trackingId: "", dispatchDate: "2026-10-31", forwardCost: 0, returnCost: 0, otherCost: 0 } }), "dispatch"), "2026-10-31");
});

test("timestamps use the Asia/Dhaka business day", () => {
  // 20:00 UTC is 02:00 the next day in Dhaka.
  assert.equal(reportDayFor(order({ createdAt: "2026-10-31T20:00:00.000Z" }), "order_created"), "2026-11-01");
  // 18:00 UTC is midnight in Dhaka, still the same day.
  assert.equal(reportDayFor(order({ createdAt: "2026-10-31T18:00:00.000Z" }), "order_created"), "2026-11-01");
});

test("delivered falls back to the audit trail and then updatedAt", () => {
  const withActivity = order({
    delivery: { customerPaid: 0 },
    activity: [{ id: "a1", at: "2026-11-03T12:00:00.000Z", label: "Marked Delivered" }],
  });
  assert.equal(deliveredDayFor(withActivity), "2026-11-03");
  assert.equal(deliveredDayFor(order({ delivery: { customerPaid: 0 }, updatedAt: "2026-11-04T12:00:00.000Z" })), "2026-11-04");
});

test("final status resolves each terminal status from its own timestamp", () => {
  assert.equal(
    finalStatusDayFor(
      order({ status: "partial_delivered", delivery: { customerPaid: 10 }, activity: [{ id: "a", at: "2026-11-02T12:00:00.000Z", label: "Marked Partial Delivered" }] }),
    ),
    "2026-11-02",
  );
  assert.equal(
    finalStatusDayFor(
      order({ status: "refuse_return", delivery: { customerPaid: 0 }, activity: [{ id: "a", at: "2026-11-03T12:00:00.000Z", label: "Marked Refuse Return" }] }),
    ),
    "2026-11-03",
  );
  assert.equal(finalStatusDayFor(order({ status: "cancelled", cancellation: { cancelledAt: "2026-11-04T12:00:00.000Z" } })), "2026-11-04");
  assert.equal(finalStatusDayFor(order({ status: "pending" })), null);
});

test("non-delivered orders have no delivered day", () => {
  assert.equal(deliveredDayFor(order({ status: "partial_delivered" })), null);
  assert.equal(reportDayFor(order({ status: "partial_delivered" }), "delivered"), null);
});
