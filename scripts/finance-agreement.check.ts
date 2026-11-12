// Check that the dashboard's money cards and the accounting screens agree.
//
//   npm run check:finance
//
// Compares the dashboard finance summary (posted ledger) with the Profit & Loss
// statement and the accounting overview for the same period. Read-only.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCashPosition, getFinanceSummaries, getProfitLossReport } from "../src/server/reports/profit-loss";
import { buildPnlPeriods } from "../src/lib/reports/profit-loss";
import { query } from "../src/server/db";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const rawLine of readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile(path.join(root, ".env.local"));
loadEnvFile(path.join(root, ".env"));

const FROM = "2026-11-01";
const TO = "2026-11-12";

async function main() {
  const [summaries, pnl, cash] = await Promise.all([
    getFinanceSummaries([{ key: "cur", label: "Current", from: FROM, to: TO }]),
    getProfitLossReport({ periods: buildPnlPeriods(FROM, TO, ["current"]), lines: [], dimension: "none" }),
    getCashPosition(),
  ]);
  const dash = summaries[0];

  // The accounting overview reads the same posted journal entries.
  const overview = await query<{ revenue: string; cogs: string; expenses: string }>(
    `select
       coalesce(sum(case when a.data->>'type'='revenue' then (l->>'credit')::numeric - (l->>'debit')::numeric else 0 end),0)::text as revenue,
       coalesce(sum(case when a.data->>'type'='expense' and a.data->>'code' like '5%' then (l->>'debit')::numeric - (l->>'credit')::numeric else 0 end),0)::text as cogs,
       coalesce(sum(case when a.data->>'type'='expense' and a.data->>'code' not like '5%' then (l->>'debit')::numeric - (l->>'credit')::numeric else 0 end),0)::text as expenses
     from app_records j cross join lateral jsonb_array_elements(coalesce(j.data->'lines','[]'::jsonb)) l
     join app_records a on a.collection='chart_of_accounts' and a.id=l->>'accountId'
     where j.collection='journal_entries' and j.data->>'status'='posted' and j.data->>'date' >= $1 and j.data->>'date' <= $2`,
    [FROM, TO],
  );

  const pnlValue = (key: string) => pnl.lines.find((line) => line.key === key)?.values[0] ?? 0;

  console.log(`Period ${FROM} .. ${TO}\n`);
  console.log("DASHBOARD money cards");
  console.log(`  Expenses         ${dash.expenses}`);
  console.log(`  Net profit       ${dash.netProfit}`);
  console.log(`  Biggest expense  ${dash.biggestExpense ? `${dash.biggestExpense.name} ${dash.biggestExpense.amount}` : "—"}`);
  console.log(`  Money in accounts ${cash.balance} (${cash.accountCount} cash accounts)\n`);

  console.log("ACCOUNTING overview");
  console.log(`  Revenue          ${overview.rows[0]?.revenue}`);
  console.log(`  COGS              ${overview.rows[0]?.cogs}`);
  console.log(`  Other expenses    ${overview.rows[0]?.expenses}`);
  console.log(`  Net profit        ${Number(overview.rows[0]?.revenue ?? 0) - Number(overview.rows[0]?.cogs ?? 0) - Number(overview.rows[0]?.expenses ?? 0)}\n`);

  console.log("PROFIT & LOSS statement");
  console.log(`  Revenue          ${pnlValue("revenue")}`);
  console.log(`  Cost of goods    ${pnlValue("cogs")}`);
  console.log(`  Net profit       ${pnlValue("netProfit")}\n`);

  const checks: [string, number, number][] = [
    ["dashboard net profit = P&L net profit", dash.netProfit, pnlValue("netProfit")],
    ["dashboard net profit = accounting net profit", dash.netProfit, Number(overview.rows[0]?.revenue ?? 0) - Number(overview.rows[0]?.cogs ?? 0) - Number(overview.rows[0]?.expenses ?? 0)],
    ["dashboard expenses = accounting other expenses", dash.expenses, Number(overview.rows[0]?.expenses ?? 0)],
    ["dashboard revenue = accounting revenue", dash.revenue, Number(overview.rows[0]?.revenue ?? 0)],
    ["dashboard COGS = accounting COGS", dash.cogs, Number(overview.rows[0]?.cogs ?? 0)],
  ];
  let failed = 0;
  for (const [label, a, b] of checks) {
    const same = Math.abs(a - b) < 0.01;
    if (!same) failed += 1;
    console.log(`  ${same ? "OK  " : "DIFF"} ${label}: ${a} vs ${b}`);
  }
  console.log(failed ? `\n${failed} mismatch(es)` : "\nThe dashboard and the accounting screens agree.");
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
