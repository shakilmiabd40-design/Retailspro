// Run with:  npm run test:reports
import { test } from "node:test";
import assert from "node:assert/strict";
import { QUERY_DATASETS, normaliseQueryRequest } from "@/lib/reports/query-builder";

test("Report builder: an unknown dataset is rejected", () => {
  assert.equal(normaliseQueryRequest({ dataset: "orders; drop table app_users", from: "2026-01-01", to: "2026-01-02" }), null);
  assert.equal(normaliseQueryRequest({ dataset: "", from: "2026-01-01", to: "2026-01-02" }), null);
});

test("Report builder: a broken date range is rejected", () => {
  assert.equal(normaliseQueryRequest({ dataset: "orders", from: "not-a-date", to: "2026-01-02" }), null);
  assert.equal(normaliseQueryRequest({ dataset: "orders", from: "2026-01-02", to: "2026-01-01" }), null);
  assert.equal(normaliseQueryRequest({ dataset: "orders" }), null);
});

test("Report builder: unknown dimensions and measures fall back to the dataset default", () => {
  const request = normaliseQueryRequest({
    dataset: "orders",
    dimension: "1=1",
    measure: "password_hash",
    aggregation: "sum",
    from: "2026-01-01",
    to: "2026-12-31",
    filters: {},
  });
  assert.ok(request);
  assert.equal(request.dimension, "channel");
  assert.equal(request.measure, "netRevenue");
});

test("Report builder: only known filter values are kept", () => {
  const request = normaliseQueryRequest({
    dataset: "orders",
    dimension: "status",
    measure: "netRevenue",
    aggregation: "sum",
    from: "2026-01-01",
    to: "2026-12-31",
    filters: { status: "delivered", courier: "not-a-courier", channel: "website" },
  });
  assert.ok(request);
  assert.deepEqual(request.filters, { status: "delivered", channel: "website" });
});

test("Report builder: an unknown aggregation falls back to a total", () => {
  const request = normaliseQueryRequest({
    dataset: "orders",
    dimension: "status",
    measure: "netRevenue",
    aggregation: "drop table" as never,
    from: "2026-01-01",
    to: "2026-12-31",
    filters: {},
  });
  assert.equal(request?.aggregation, "sum");
});

test("Report builder: every dataset has a default that actually exists", () => {
  for (const dataset of QUERY_DATASETS) {
    assert.ok(dataset.fields.some((field) => field.key === dataset.defaultMeasure), `${dataset.key} default measure missing`);
    assert.ok(dataset.dimensions.some((dimension) => dimension.key === dataset.defaultDimension), `${dataset.key} default dimension missing`);
  }
});
