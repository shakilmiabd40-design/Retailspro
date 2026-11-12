// Run with:  npm run test:reports
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Order } from "@/lib/orders/types";
import type { ReturnRecord } from "@/lib/returns/types";
import type { CodSettings } from "./cod";
import { buildCourierReport } from "./courier";
import { buildOrderStatusReport } from "./order-status";
import { buildProductSalesReport } from "./product-sales";
import { buildSalesCodReport } from "./sales-cod";
import { buildReceivedByOrder } from "./settlement-summary";

const settings: CodSettings = { settlementMode: "auto", codChargePct: 0, riskManagementPct: 0 };

const order = (over: Partial<Order> = {}): Order => ({
  id: "o1",
  orderNumber: "1001",
  status: "delivered",
  customerName: "Customer",
  phone: "01700000000",
  address: "Dhaka",
  items: [{ id: "i1", productId: "p1", productName: "Shoe", variantId: "v1", color: "Black", size: "42", sku: "SKU", price: 1000, qty: 1, discount: 0 }],
  deliveryCharge: 100,
  courier: { company: "Steadfast", trackingId: "T1", forwardCost: 60, returnCost: 0, otherCost: 0 },
  delivery: { customerPaid: 1040, deliveryDate: "2026-11-01", settlementStatus: "pending" },
  returnInfo: { returnRequired: false, returnReceived: false },
  cancellation: {},
  activity: [],
  createdAt: "2026-10-30T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  ...over,
});

test("Sales & COD only includes delivered orders inside the report-day range", () => {
  const report = buildSalesCodReport(
    [
      order({ id: "in", delivery: { customerPaid: 1040, deliveryDate: "2026-11-01", settlementStatus: "pending" } }),
      order({ id: "out", orderNumber: "1002", delivery: { customerPaid: 1040, deliveryDate: "2026-10-31", settlementStatus: "pending" } }),
      order({ id: "partial", orderNumber: "1003", status: "partial_delivered", delivery: { customerPaid: 500, deliveryDate: "2026-11-01" } }),
    ],
    { from: "2026-11-01", to: "2026-11-01", dateType: "delivered", receivedByOrder: new Map(), settings },
  );

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].orderId, "in");
  assert.deepEqual(report.kpis, {
    deliveredOrders: 1,
    productSales: 1000,
    grossRevenue: 1100,
    courierCost: 60,
    netRevenue: 1040,
    deliveryCharge: 100,
    expectedCod: 1100,
    collected: 1040,
    difference: 60,
  });
});

test("Sales & COD filters by settlement position without changing the formulas", () => {
  const target = order({ id: "settled" });
  const received = new Map([["settled", 980]]); // 1040 collected − 60 courier cost

  const all = buildSalesCodReport([target], { from: "2026-11-01", to: "2026-11-01", dateType: "delivered", receivedByOrder: received, settings });
  assert.equal(all.rows[0].settlementStatus, "Settled");

  const settled = buildSalesCodReport([target], { from: "2026-11-01", to: "2026-11-01", dateType: "delivered", receivedByOrder: received, settings, settlementStatus: "Settled" });
  assert.equal(settled.rows.length, 1);

  const unsettled = buildSalesCodReport([target], { from: "2026-11-01", to: "2026-11-01", dateType: "delivered", receivedByOrder: received, settings, settlementStatus: "Unsettled" });
  assert.equal(unsettled.rows.length, 0);
});

test("Sales & COD applies the courier filter", () => {
  const report = buildSalesCodReport(
    [order({ id: "a", courier: { company: "Steadfast", trackingId: "", forwardCost: 0, returnCost: 0, otherCost: 0 } }), order({ id: "b", orderNumber: "1002", courier: { company: "Pathao", trackingId: "", forwardCost: 0, returnCost: 0, otherCost: 0 } })],
    { from: "2026-11-01", to: "2026-11-01", dateType: "delivered", receivedByOrder: new Map(), settings, courier: "Pathao" },
  );
  assert.deepEqual(report.rows.map((row) => row.orderId), ["b"]);
});

test("settlement allocations sum per order", () => {
  const received = buildReceivedByOrder({
    payouts: [
      { allocations: [{ orderId: "a", amount: 100 }, { orderId: "a", amount: 50 }, { orderId: "b", amount: 0 }] },
      { allocations: [{ orderId: "b", amount: 25 }] },
    ],
  });
  assert.equal(received.get("a"), 150);
  assert.equal(received.get("b"), 25);
});

test("Courier report mirrors the Partial / Refuse profit and loss rules", () => {
  const report = buildCourierReport(
    [
      order({ id: "delivered", courier: { company: "Steadfast", trackingId: "", forwardCost: 60, returnCost: 0, otherCost: 0 } }),
      order({
        id: "partial",
        orderNumber: "1002",
        status: "partial_delivered",
        delivery: { customerPaid: 500, deliveryDate: "2026-11-01" },
        courier: { company: "Steadfast", trackingId: "", forwardCost: 200, returnCost: 0, otherCost: 0 },
        activity: [{ id: "a1", at: "2026-11-01T12:00:00.000Z", label: "Marked Partial Delivered" }],
      }),
      order({
        id: "refuse",
        orderNumber: "1003",
        status: "refuse_return",
        delivery: { customerPaid: 0, deliveryDate: "2026-11-01" },
        courier: { company: "Steadfast", trackingId: "", forwardCost: 100, returnCost: 50, otherCost: 0 },
        activity: [{ id: "a2", at: "2026-11-01T12:00:00.000Z", label: "Marked Refuse Return" }],
      }),
      order({ id: "cancelled", orderNumber: "1004", status: "cancelled", cancellation: { cancelledAt: "2026-11-01T12:00:00.000Z" } }),
    ],
    { from: "2026-11-01", to: "2026-11-01", dateType: "final_status" },
  );

  assert.deepEqual(report.rows.map((row) => row.orderId).sort(), ["delivered", "partial", "refuse"]);

  const partial = report.rows.find((row) => row.orderId === "partial")!;
  assert.equal(partial.customerPaid, 500);
  assert.equal(partial.courierNet, 300);
  assert.equal(partial.profit, 300);
  assert.equal(partial.loss, 0);

  const refuse = report.rows.find((row) => row.orderId === "refuse")!;
  assert.equal(refuse.customerPaid, 0);
  assert.equal(refuse.courierNet, -150);
  assert.equal(refuse.profit, 0);
  assert.equal(refuse.loss, 150);

  const delivered = report.rows.find((row) => row.orderId === "delivered")!;
  assert.equal(delivered.customerPaid, null);
  assert.equal(delivered.courierNet, null);

  assert.deepEqual(report.kpis, {
    forwardCost: 360,
    returnCost: 50,
    otherCost: 0,
    actualCourierCost: 410,
    customerPaidPartial: 500,
    profit: 300,
    loss: 150,
    netResult: 150,
  });
});

test("Courier report filters by status", () => {
  const report = buildCourierReport(
    [
      order({ id: "delivered" }),
      order({ id: "partial", orderNumber: "1002", status: "partial_delivered", delivery: { customerPaid: 500, deliveryDate: "2026-11-01" }, activity: [{ id: "a", at: "2026-11-01T12:00:00.000Z", label: "Marked Partial Delivered" }] }),
    ],
    { from: "2026-11-01", to: "2026-11-01", dateType: "final_status", status: "partial_delivered" },
  );
  assert.deepEqual(report.rows.map((row) => row.orderId), ["partial"]);
});

test("Order Status returns every order in the range, newest first", () => {
  const report = buildOrderStatusReport(
    [
      order({ id: "a", orderNumber: "1001", createdAt: "2026-11-01T10:00:00.000Z" }),
      order({ id: "b", orderNumber: "1002", createdAt: "2026-11-01T12:00:00.000Z", courier: { company: "Pathao", trackingId: "T2", forwardCost: 0, returnCost: 0, otherCost: 0 } }),
      order({ id: "c", orderNumber: "1003", createdAt: "2026-10-30T10:00:00.000Z" }),
    ],
    { from: "2026-11-01", to: "2026-11-01", dateType: "order_created" },
  );

  assert.deepEqual(report.rows.map((row) => row.orderId), ["b", "a"]);
  assert.equal(report.rows[0].createdDay, "2026-11-01");
  assert.equal(report.rows[0].updatedDay, "2026-11-01");
  assert.equal(report.rows[0].courier, "Pathao");
});

test("Order Status applies the courier filter", () => {
  const report = buildOrderStatusReport(
    [
      order({ id: "a", createdAt: "2026-11-01T10:00:00.000Z" }),
      order({ id: "b", orderNumber: "1002", createdAt: "2026-11-01T12:00:00.000Z", courier: { company: "Pathao", trackingId: "T2", forwardCost: 0, returnCost: 0, otherCost: 0 } }),
    ],
    { from: "2026-11-01", to: "2026-11-01", dateType: "order_created", courier: "Pathao" },
  );
  assert.deepEqual(report.rows.map((row) => row.orderId), ["b"]);
});

const productMeta = new Map([["p1", { category: "Sneakers", brand: "Nike" }]]);

const customerReturn = (over: Partial<ReturnRecord> = {}): ReturnRecord => ({
  id: "r1",
  returnNumber: "5001",
  type: "customer",
  referenceId: "o1",
  referenceLabel: "#1001",
  partyName: "Customer",
  status: "received",
  items: [{ id: "ri1", productId: "p1", productName: "Shoe", variantId: "v1", color: "Black", size: "42", sku: "SKU", qty: 1, reason: "", condition: "new" }],
  returnReceived: true,
  returnReceivedAt: "2026-11-01T09:00:00.000Z",
  createdAt: "2026-10-31T09:00:00.000Z",
  updatedAt: "2026-11-01T09:00:00.000Z",
  ...over,
});

const noProductFilter = { category: "all", brand: "all", productId: "all", sku: "" };

test("Product Sales counts delivered orders and customer returns received in the period", () => {
  const report = buildProductSalesReport(
    [
      order({ id: "d1" }),
      order({ id: "p1", orderNumber: "1002", status: "pending" }),
    ],
    [customerReturn(), customerReturn({ id: "r2", returnNumber: "5002", returnReceivedAt: "2026-11-05T09:00:00.000Z" })],
    productMeta,
    { from: "2026-11-01", to: "2026-11-01", dateType: "delivered", ...noProductFilter },
  );

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].qty, 1);
  assert.equal(report.rows[0].revenue, 1000);
  assert.equal(report.rows[0].returned, 1);
  assert.equal(report.rows[0].category, "Sneakers");
  assert.deepEqual(report.kpis, { qty: 1, revenue: 1000, returned: 1, net: 0 });
});

test("Product Sales applies the category and SKU filters", () => {
  const orders = [order({ id: "d1" })];

  const wrongCategory = buildProductSalesReport(orders, [], productMeta, {
    from: "2026-11-01",
    to: "2026-11-01",
    dateType: "delivered",
    ...noProductFilter,
    category: "Boots",
  });
  assert.equal(wrongCategory.rows.length, 0);

  const wrongSku = buildProductSalesReport(orders, [], productMeta, {
    from: "2026-11-01",
    to: "2026-11-01",
    dateType: "delivered",
    ...noProductFilter,
    sku: "NK-AM270",
  });
  assert.equal(wrongSku.rows.length, 0);

  const match = buildProductSalesReport(orders, [], productMeta, {
    from: "2026-11-01",
    to: "2026-11-01",
    dateType: "delivered",
    ...noProductFilter,
    category: "Sneakers",
    sku: "sku",
  });
  assert.equal(match.rows.length, 1);
});

test("Product Sales leaves out supplier returns", () => {
  const report = buildProductSalesReport(
    [order({ id: "d1" })],
    [customerReturn({ type: "supplier" })],
    productMeta,
    { from: "2026-11-01", to: "2026-11-01", dateType: "delivered", ...noProductFilter },
  );
  assert.equal(report.rows[0].returned, 0);
});
