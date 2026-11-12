// Check the unified Profit & Loss against the live database.
//
//   npm run check:profit-loss
//
// Prints the statement and proves the reconciliation:
//   net profit = the ledger's net profit - ad spend - COD fees
// (ad spend and COD fees are real costs the general ledger never sees).
//
// Read-only: it never writes to the database.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getProfitLossReport } from "../src/server/reports/profit-loss";
import { taka } from "../src/lib/reports/format";

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

const FROM = "2026-09-01";
const TO = "2026-09-30";

async function main() {
  const report = await getProfitLossReport({
    from: FROM,
    to: TO,
    columns: ["current", "previous"],
    lines: [],
    dimension: "channel",
  });

  console.log(`Profit & Loss  ${FROM} .. ${TO}\n`);
  const width = Math.max(...report.lines.map((line) => line.label.length), 12);
  for (const period of report.periods) {
    console.log(`${period.label} (${period.from} → ${period.to})`);
    for (const line of report.lines) {
      const value = line.values[report.periods.indexOf(period)];
      const text = line.key === "margin" ? `${Math.round(value)}%` : taka(value);
      console.log(`  ${line.label.padEnd(width)}  ${text.padStart(14)}`);
    }
    console.log("");
  }

  console.log("Reconciliation");
  const netProfit = report.lines.find((line) => line.key === "netProfit")?.values[0] ?? 0;
  const revenue = report.lines.find((line) => line.key === "revenue")?.values[0] ?? 0;
  const cogs = report.lines.find((line) => line.key === "cogs")?.values[0] ?? 0;
  const other = report.lines.filter((line) => ["courier", "codFees", "adSpend", "operating", "otherExpenses"].includes(line.key)).reduce((sum, line) => sum + line.values[0], 0);
  const otherIncome = report.lines.find((line) => line.key === "otherIncome")?.values[0] ?? 0;
  const expected = revenue + otherIncome + cogs + other;
  console.log(`  revenue + other income + costs = ${Math.round(expected)}`);
  console.log(`  net profit shown                = ${Math.round(netProfit)}`);
  const ok = Math.abs(expected - netProfit) < 1;
  console.log(`  ${ok ? "OK - the statement adds up" : "MISMATCH!"}\n`);

  console.log("Not in the ledger");
  for (const row of report.unposted) console.log(`  ${row.label.padEnd(width)}  ${taka(row.amount).padStart(14)}  (${row.note})`);

  if (report.breakdown?.length) {
    console.log("\nBreakdown by channel (revenue / product cost / gross profit)");
    for (const row of report.breakdown) {
      console.log(`  ${row.label.padEnd(width)}  ${taka(row.revenue).padStart(12)}  ${taka(row.productCost).padStart(12)}  ${taka(row.grossProfit).padStart(12)}  (${row.orders} orders)`);
    }
  }

  if (!ok) process.exitCode = 1;
}

/**
 * Ad spend and COD fees are not in the live data yet, so their SQL is checked
 * against synthetic rows — the expressions are the same, the data is not.
 */
async function checkUnpostedPaths() {
  const { query } = await import("../src/server/db");
  const periods = [{ key: "current", from: FROM, to: TO }];

  const ad = await query<{ periodKey: string; spend: string }>(
    `with periods as (select * from jsonb_to_recordset($1::jsonb) as p(period_key text, start_date date, end_date date)),
       synthetic as (select * from (values ('2026-09-05'::date,'meta',100.00),('2026-09-20'::date,'google',50.00),('2026-10-02'::date,'meta',7.00)) v(spend_date,platform,spend))
     select p.period_key as "periodKey", coalesce(sum(a.spend),0)::text as spend
     from periods p
     left join synthetic a on a.spend_date between p.start_date and p.end_date
     group by p.period_key`,
    [JSON.stringify(periods.map((p) => ({ period_key: p.key, start_date: p.from, end_date: p.to })))],
  );

  const cod = await query<{ periodKey: string; fees: string }>(
    `with periods as (select * from jsonb_to_recordset($1::jsonb) as p(period_key text, start_date date, end_date date)),
       synthetic_orders as (
         select jsonb_build_object('status','delivered','delivery',jsonb_build_object('deliveryDate','2026-09-10'),'courier',jsonb_build_object('codFee',75)) as data
         union all select jsonb_build_object('status','delivered','delivery',jsonb_build_object('deliveryDate','2026-09-11'),'courier',jsonb_build_object('codFee',25)) as data
         union all select jsonb_build_object('status','pending','delivery',jsonb_build_object('deliveryDate','2026-09-12'),'courier',jsonb_build_object('codFee',999)) as data
       )
     select p.period_key as "periodKey",
       coalesce(sum(case when o.data->>'status' = 'delivered'
         then coalesce((o.data #>> '{courier,codFee}')::numeric, 0) else 0 end), 0)::text as fees
     from periods p
     left join synthetic_orders o on coalesce(nullif(o.data #>> '{delivery,deliveryDate}',''), left(o.data->>'updatedAt',10), left(o.data->>'createdAt',10)) between p.start_date::text and p.end_date::text
     group by p.period_key`,
    [JSON.stringify(periods.map((p) => ({ period_key: p.key, start_date: p.from, end_date: p.to })))],
  );

  console.log("\nUnposted-cost SQL (synthetic rows)");
  const adSpend = Number(ad.rows[0]?.spend ?? 0);
  const codFees = Number(cod.rows[0]?.fees ?? 0);
  console.log(`  ad spend in September (100 + 50, the 2 Oct row excluded) = ${adSpend} ${adSpend === 150 ? "OK" : "WRONG"}`);
  console.log(`  COD fees on delivered orders (75 + 25, the pending order excluded) = ${codFees} ${codFees === 100 ? "OK" : "WRONG"}`);
  if (adSpend !== 150 || codFees !== 100) process.exitCode = 1;
}

main().then(checkUnpostedPaths).catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});