// Run with:  npm run test:reports
import { test } from "node:test";
import assert from "node:assert/strict";
import { isIsoDay, previousPeriodRange } from "./period";

test("isIsoDay accepts real calendar days only", () => {
  assert.equal(isIsoDay("2026-11-09"), true);
  assert.equal(isIsoDay("2024-02-29"), true);
  assert.equal(isIsoDay("2026-02-29"), false);
  assert.equal(isIsoDay("2026-13-01"), false);
  assert.equal(isIsoDay("2026-1-9"), false);
  assert.equal(isIsoDay(""), false);
  assert.equal(isIsoDay(null), false);
  assert.equal(isIsoDay(20261109), false);
});

test("previousPeriodRange returns the same length ending the day before", () => {
  assert.deepEqual(previousPeriodRange("2026-11-01", "2026-11-07"), {
    from: "2026-10-25",
    to: "2026-10-31",
  });
});

test("previousPeriodRange handles single days", () => {
  assert.deepEqual(previousPeriodRange("2026-01-01", "2026-01-01"), {
    from: "2025-12-31",
    to: "2025-12-31",
  });
});

test("previousPeriodRange crosses month and leap-day boundaries", () => {
  assert.deepEqual(previousPeriodRange("2024-03-01", "2024-03-31"), {
    from: "2024-01-30",
    to: "2024-02-29",
  });
});

test("previousPeriodRange rejects missing, invalid or reversed ranges", () => {
  assert.throws(() => previousPeriodRange("2026-11-07", "2026-11-01"));
  assert.throws(() => previousPeriodRange("2026-02-30", "2026-03-01"));
  assert.throws(() => previousPeriodRange("not-a-day", "2026-03-01"));
});
