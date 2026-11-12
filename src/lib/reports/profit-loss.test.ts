// Run with:  npm run test:reports
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPnlPeriods,
  buildPnlStatement,
  emptyPnlTotals,
  netProfitOf,
  normalisePreset,
  redactPnlStatement,
  type PnlTotals,
} from "@/lib/reports/profit-loss";

const totals = (over: Partial<PnlTotals> = {}): PnlTotals => ({ ...emptyPnlTotals(), ...over });

test("Profit & loss: the statement adds up and costs are shown negative", () => {
  const statement = buildPnlStatement(
    [{ key: "current", label: "Current period", from: "2026-09-01", to: "2026-09-30" }],
    [totals({ revenue: 12090, cogs: 6000, courier: 860, operating: 300, otherIncome: 50 })],
  );

  const value = (key: string) => statement.lines.find((line) => line.key === key)?.values[0];
  assert.equal(value("revenue"), 12090);
  assert.equal(value("cogs"), -6000);
  assert.equal(value("grossProfit"), 12090 + 50 - 6000);
  assert.equal(value("courier"), -860);
  assert.equal(value("netProfit"), 12090 + 50 - 6000 - 860 - 300);
  // The margin is a percentage; the page rounds it for display.
  assert.ok(Math.abs((value("margin") ?? 0) - 41.02141680395387) < 0.000001);
});

test("Profit & loss: ad spend and COD fees come out of the net profit", () => {
  const withCosts = netProfitOf(totals({ revenue: 1000, adSpend: 200, codFees: 50 }));
  const withoutCosts = netProfitOf(totals({ revenue: 1000 }));
  assert.equal(withoutCosts - withCosts, 250);
});

test("Profit & loss: an optional line with nothing in it is left out", () => {
  const statement = buildPnlStatement([{ key: "current", label: "Current period", from: "2026-09-01", to: "2026-09-30" }], [totals({ revenue: 100 })]);
  assert.equal(statement.lines.find((line) => line.key === "adSpend"), undefined);
  assert.equal(statement.lines.find((line) => line.key === "codFees"), undefined);
  assert.ok(statement.lines.find((line) => line.key === "revenue"));
});

test("Profit & loss: redacting keeps the sales side and hides the money behind it", () => {
  const statement = buildPnlStatement([{ key: "current", label: "Current period", from: "2026-09-01", to: "2026-09-30" }], [totals({ revenue: 12090, cogs: 6000, courier: 860 })]);
  const redacted = redactPnlStatement(statement);
  const value = (lines: typeof statement.lines, key: string) => lines.find((line) => line.key === key)?.values[0];
  assert.equal(value(redacted.lines, "revenue"), 12090);
  assert.equal(value(redacted.lines, "cogs"), 0);
  assert.equal(value(redacted.lines, "netProfit"), 0);
  assert.equal(value(redacted.lines, "grossProfit"), 0);
});

test("Profit & loss: the previous period is the same number of days, ending the day before", () => {
  const periods = buildPnlPeriods("2026-09-01", "2026-09-30", ["current", "previous", "ytd", "lastYear"]);
  assert.deepEqual(
    periods.map((period) => [period.key, period.from, period.to]),
    [
      ["current", "2026-09-01", "2026-09-30"],
      ["previous", "2026-08-02", "2026-08-31"],
      ["ytd", "2026-01-01", "2026-09-30"],
      ["lastYear", "2025-09-01", "2025-09-30"],
    ],
  );
});

test("Profit & loss: a single-day range still gets a one-day previous period", () => {
  const periods = buildPnlPeriods("2026-09-18", "2026-09-18", ["previous"]);
  assert.equal(periods[0].from, "2026-09-17");
  assert.equal(periods[0].to, "2026-09-17");
});

test("Profit & loss: last year keeps 29 February on 28 February", () => {
  const periods = buildPnlPeriods("2024-02-29", "2024-02-29", ["lastYear"]);
  assert.equal(periods[0].from, "2023-02-28");
  assert.equal(periods[0].to, "2023-02-28");
});

test("Saved layouts: unknown lines and columns are dropped, a broken preset falls back", () => {
  const preset = normalisePreset({ id: "x", name: "Mine", lines: ["revenue", "not-a-line"] as never, columns: ["current", "nope"] as never, dimension: "nonsense" as never });
  assert.deepEqual(preset.lines, ["revenue"]);
  assert.deepEqual(preset.columns, ["current"]);
  assert.equal(preset.dimension, "none");

  const broken = normalisePreset(null);
  assert.ok(broken.lines.length > 0);
  assert.ok(broken.columns.length > 0);
});
