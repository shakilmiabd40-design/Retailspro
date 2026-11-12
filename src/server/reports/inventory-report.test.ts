// Run with:  npm run test:reports
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS } from "@/lib/notifications/engine";
import { buildInventoryStockReport, buildInventoryValueReport, type StockProduct } from "./inventory";

const products: StockProduct[] = [
  {
    id: "p1",
    name: "Air Runner",
    brand: "Nike",
    category: "Sneakers",
    status: "active",
    variants: [
      { id: "v1", sku: "NK-1", color: "Black", size: "42", stock: 20, reserved: 2, status: "active", cost: 800 },
      { id: "v2", sku: "NK-2", color: "White", size: "40", stock: 0, reserved: 0, status: "active", cost: 800 },
    ],
  },
];

const settings = { ...DEFAULT_SETTINGS, reorderPoint: 5, monitorMultiplier: 2 };

test("Inventory stock splits available stock and labels the low-stock band", () => {
  const report = buildInventoryStockReport(products, {
    category: "all",
    brand: "all",
    productId: "all",
    sku: "",
    settings,
    states: {},
    snapshots: [],
  });

  assert.equal(report.lowBand, 10);
  assert.equal(report.rows.length, 2);
  const inStock = report.rows.find((row) => row.variantId === "v1")!;
  assert.equal(inStock.available, 18);
  assert.equal(inStock.reserved, 2);
  assert.equal(inStock.onHand, 20);
  assert.equal(inStock.label, "In Stock");
  assert.equal(inStock.reorder, 5);
  assert.equal(report.kpis.totalVariants, 2);
  assert.equal(report.kpis.inStock, 1);
  assert.equal(report.kpis.outOfStock, 1);
});

test("Inventory stock honours the product filters", () => {
  const report = buildInventoryStockReport(products, {
    category: "all",
    brand: "all",
    productId: "all",
    sku: "NK-2",
    settings,
    states: {},
    snapshots: [],
  });
  assert.deepEqual(report.rows.map((row) => row.variantId), ["v2"]);
});

test("Inventory valuation values stock at cost and flags dead stock", () => {
  const report = buildInventoryValueReport(products, {
    category: "all",
    brand: "all",
    productId: "all",
    sku: "",
    lastSoldDays: new Map([["v1", "2026-08-01"]]),
    today: "2026-11-10",
    deadDays: 60,
    seesCost: true,
  });

  // Only the variant with stock on hand is valued.
  assert.equal(report.rows.length, 1);
  const row = report.rows[0];
  assert.equal(row.qty, 20);
  assert.equal(row.unitCost, 800);
  assert.equal(row.value, 16000);
  // Last sold more than 60 days before today → dead stock.
  assert.equal(row.dead, true);
  assert.equal(report.kpis.totalQty, 20);
  assert.equal(report.kpis.totalValue, 16000);
});

test("Inventory valuation keeps recently sold stock out of the dead-stock list", () => {
  const report = buildInventoryValueReport(products, {
    category: "all",
    brand: "all",
    productId: "all",
    sku: "",
    lastSoldDays: new Map([["v1", "2026-10-01"]]),
    today: "2026-11-10",
    deadDays: 60,
    seesCost: true,
  });
  assert.equal(report.rows[0].dead, false);
  assert.equal(report.kpis.deadQty, 0);
});

test("Inventory valuation hides cost when the caller may not see it", () => {
  const report = buildInventoryValueReport(products, {
    category: "all",
    brand: "all",
    productId: "all",
    sku: "",
    lastSoldDays: new Map(),
    today: "2026-11-10",
    deadDays: 60,
    seesCost: false,
  });

  assert.equal(report.rows[0].unitCost, null);
  assert.equal(report.rows[0].value, null);
  assert.equal(report.kpis.totalValue, null);
  assert.equal(report.kpis.deadValue, null);
  // Quantity and dead-stock detection still work without cost access.
  assert.equal(report.kpis.totalQty, 20);
  assert.equal(report.rows[0].dead, true);
});
