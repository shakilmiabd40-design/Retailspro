// Run with:  npm run test:reports
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PurchaseOrder } from "@/lib/purchase-orders/types";
import type { ReturnRecord } from "@/lib/returns/types";
import type { ProductMeta } from "@/lib/reports/orders";
import { buildPurchaseReport } from "./purchases";
import { buildSupplierReport } from "./suppliers";

const meta: ProductMeta = new Map([["p1", { category: "Sneakers", brand: "Nike" }]]);
const supplierNames = new Map([["sup-1", "Supplier One"]]);

const po = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: "po1",
  poNumber: "PO-3001",
  supplierId: "sup-1",
  status: "approved",
  poDate: "2026-11-01",
  items: [
    { id: "i1", productId: "p1", productName: "Shoe", variantId: "v1", color: "Black", size: "42", sku: "SKU", qtyOrdered: 10, qtyReceived: 4, unitCost: 800 },
  ],
  shippingCost: 100,
  discount: 0,
  receivings: [
    { id: "r1", date: "2026-11-01T10:00:00.000Z", items: [{ variantId: "v1", qty: 4, unitCost: 800 }] },
  ],
  createdAt: "2026-11-01T09:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  ...over,
});

const baseOptions = {
  from: "2026-11-01",
  to: "2026-11-01",
  supplierNames,
  meta,
};

test("Purchase report counts only counted purchase orders and adds shipping to the cost", () => {
  const report = buildPurchaseReport(
    [
      po(),
      po({ id: "po2", poNumber: "PO-3002", status: "draft" }),
      po({ id: "po3", poNumber: "PO-3003", status: "cancelled" }),
    ],
    { ...baseOptions, dateType: "po_created" },
  );

  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].cost, 8100); // 10 × 800 + 100 shipping
  assert.equal(report.rows[0].pending, 6);
  assert.equal(report.rows[0].pendingValue, 4800);
  assert.deepEqual(report.kpis, {
    purchaseOrders: 1,
    qtyOrdered: 10,
    qtyReceived: 4,
    qtyReceivedInPeriod: 4,
    totalCost: 8100,
    pendingQty: 6,
    pendingValue: 4800,
  });
});

test("Purchase report in GRN mode only lists receipts inside the period", () => {
  const report = buildPurchaseReport(
    [
      po(),
      po({
        id: "po2",
        poNumber: "PO-3002",
        poDate: "2026-10-20",
        receivings: [{ id: "r2", date: "2026-10-20T10:00:00.000Z", items: [{ variantId: "v1", qty: 2, unitCost: 800 }] }],
      }),
    ],
    { ...baseOptions, dateType: "grn" },
  );

  assert.deepEqual(report.rows.map((row) => row.poId), ["po1"]);
  assert.equal(report.grn.length, 1);
  assert.equal(report.grn[0].qty, 4);
  assert.equal(report.grn[0].value, 3200);
  assert.equal(report.kpis.qtyReceivedInPeriod, 4);
});

test("Purchase report leaves shipping and discount out while a product filter is on", () => {
  const report = buildPurchaseReport([po()], {
    ...baseOptions,
    dateType: "po_created",
    productFilterOn: true,
    productId: "p1",
  });
  assert.equal(report.rows[0].cost, 8000);

  const filteredOut = buildPurchaseReport([po()], {
    ...baseOptions,
    dateType: "po_created",
    productFilterOn: true,
    productId: "other",
  });
  assert.equal(filteredOut.rows.length, 0);
});

const supplierReturn = (over: Partial<ReturnRecord> = {}): ReturnRecord => ({
  id: "ret1",
  returnNumber: "5001",
  type: "supplier",
  referenceId: "po1",
  referenceLabel: "PO-3001",
  partyName: "Supplier One",
  status: "received",
  items: [{ id: "ri1", productId: "p1", productName: "Shoe", variantId: "v1", color: "Black", size: "42", sku: "SKU", qty: 2, reason: "", condition: "new" }],
  returnReceived: true,
  returnReceivedAt: "2026-11-01T09:00:00.000Z",
  createdAt: "2026-11-01T08:00:00.000Z",
  updatedAt: "2026-11-01T09:00:00.000Z",
  ...over,
});

test("Supplier report values purchases and returns per supplier", () => {
  const report = buildSupplierReport([po()], [supplierReturn()], {
    from: "2026-11-01",
    to: "2026-11-01",
    dateType: "grn",
    suppliers: [{ id: "sup-1", name: "Supplier One" }],
    poSuppliers: new Map([["po1", "sup-1"]]),
    variantCosts: new Map([["v1", 800]]),
    meta,
  });

  assert.equal(report.rows.length, 1);
  const row = report.rows[0];
  assert.equal(row.poCount, 1);
  assert.equal(row.purchase, 3200); // stock received in the period
  assert.equal(row.receivedQty, 4);
  assert.equal(row.returnQty, 2);
  assert.equal(row.returnValue, 1600);
  assert.equal(row.lastPurchaseDay, "2026-11-01");
  assert.deepEqual(report.kpis, { totalPurchase: 3200, receivedQty: 4, returnQty: 2, returnValue: 1600 });
});

test("Supplier report hides the return value when the caller may not see cost", () => {
  const report = buildSupplierReport([po()], [supplierReturn()], {
    from: "2026-11-01",
    to: "2026-11-01",
    dateType: "grn",
    suppliers: [{ id: "sup-1", name: "Supplier One" }],
    poSuppliers: new Map([["po1", "sup-1"]]),
    variantCosts: new Map(),
    meta,
  });
  assert.equal(report.rows[0].returnValue, 0);
  assert.equal(report.kpis.returnValue, 0);
});
