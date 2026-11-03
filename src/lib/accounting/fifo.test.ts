import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateLandedCost, consumeFifo } from "./fifo";
import type { InventoryCostLayer } from "./gl-types";

const layer = (id: string, date: string, qty: number, unitCost: number): InventoryCostLayer => ({
  id, productId: "p", variantId: "v", qty, remainingQty: qty, unitCost,
  totalCost: qty * unitCost, landedCost: 0, receivedAt: date, source: "po_receipt",
});

test("FIFO consumes the oldest layers first and leaves newer balances intact", () => {
  const result = consumeFifo([layer("new", "2026-02-01", 4, 140), layer("old", "2026-01-01", 3, 100)], 5);
  assert.equal(result.totalCost, 580);
  assert.deepEqual(result.allocations.map((a) => [a.layerId, a.qty]), [["old", 3], ["new", 2]]);
  assert.equal(result.layers.find((x) => x.id === "old")?.remainingQty, 0);
  assert.equal(result.layers.find((x) => x.id === "new")?.remainingQty, 2);
});

test("missing historical layers are valued using the fallback and marked estimated", () => {
  const result = consumeFifo([layer("old", "2026-01-01", 1, 100)], 3, 125);
  assert.equal(result.totalCost, 350);
  assert.equal(result.estimatedQty, 2);
});

test("receipt freight is allocated by merchandise value without losing cents", () => {
  const lines = allocateLandedCost([{ qty: 2, unitCost: 100 }, { qty: 1, unitCost: 100 }], 10);
  assert.equal(lines.reduce((sum, line) => sum + line.landedTotal, 0), 310);
  assert.equal(lines[0].landedTotal, 206.67);
  assert.equal(lines[1].landedTotal, 103.33);
});
