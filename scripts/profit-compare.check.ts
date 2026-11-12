// Diagnostic: compare the two profit numbers the app produces for the same period.
//
//   npm run check:profit
//
//   1. The Accounting P&L  — from posted journal entries (chart of accounts).
//   2. The Owner Dashboard  — the management view (orders + POS + ad spend).
//
// Today these two disagree, because:
//   * ad spend (app_ad_spend) and COD fees never become journal entries, so the
//     accounting P&L does not see them;
//   * ledger expenses (rent, salaries…) are only in the accounting P&L, while the
//     dashboard view stops before fixed overheads.
//
// Read-only: it never writes to the database.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getReportBundle } from "../src/server/reports/daily-summary";
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

const FROM = "2026-09-01";
const TO = "2026-09-30";

async function main() {
  // 1. The Accounting (GL / journal-entry) profit & loss.
  const { rows: je } = await query<{ data: { date: string; status: string; lines: { accountId: string; debit: number; credit: number }[] } }>(
    "select data from app_records where collection='journal_entries'"
  );
  const entries = je.map((r) => r.data).filter((e) => e.status === "posted" && e.date >= FROM && e.date <= TO);
  const coa = (await query<{ data: { id: string; code: string; type: string } }>(
    "select data from app_records where collection='chart_of_accounts'"
  )).rows.map((r) => r.data);
  const typeOf = new Map(coa.map((a) => [a.id, a.type]));

  const totals = new Map<string, number>();
  for (const e of entries) {
    for (const line of e.lines ?? []) {
      const t = typeOf.get(line.accountId);
      if (!t) continue;
      totals.set(line.accountId, (totals.get(line.accountId) ?? 0) + (t === "revenue" ? line.credit - line.debit : line.debit - line.credit));
    }
  }
  const codeOf = new Map(coa.map((a) => [a.id, a.code]));
  const sumBy = (pred: (code: string, type: string) => boolean) =>
    [...totals.entries()].reduce((s, [id, amount]) => {
      const code = codeOf.get(id) ?? "";
      const type = typeOf.get(id) ?? "";
      return pred(code, type) ? s + amount : s;
    }, 0);

  const glRevenue = sumBy((code, type) => type === "revenue" && code !== "4030");
  const glOtherIncome = sumBy((code, type) => type === "revenue" && code === "4030");
  const glCogs = sumBy((code, type) => type === "expense" && code.startsWith("5"));
  const glCourier = sumBy((code) => code === "6040");
  const glOperating = sumBy((code, type) => type === "expense" && code.startsWith("6") && code !== "6040");
  const glOther = sumBy((code, type) => type === "expense" && !code.startsWith("5") && !code.startsWith("6"));
  const glNet = glRevenue - glCogs - glCourier - glOperating - glOther + glOtherIncome;

  // 2. The Owner Dashboard (management) profit.
  const bundle = await getReportBundle(FROM, TO, "all");
  const k = bundle.kpis;

  // 3. Ad spend for the same window (never posted to the GL).
  const ad = await query<{ total: string }>(
    "select coalesce(sum(spend),0)::text as total from app_ad_spend where spend_date >= $1 and spend_date <= $2",
    [FROM, TO]
  );

  console.log(`Period ${FROM} .. ${TO}\n`);
  console.log("ACCOUNTING P&L (from posted journal entries / chart of accounts)");
  console.log(`  Revenue            ${glRevenue}`);
  console.log(`  COGS               ${glCogs}`);
  console.log(`  Courier            ${glCourier}`);
  console.log(`  Operating          ${glOperating}`);
  console.log(`  Other expenses     ${glOther}`);
  console.log(`  Other income       ${glOtherIncome}`);
  console.log(`  NET PROFIT         ${glNet}\n`);

  console.log("OWNER DASHBOARD (management view, from orders + POS)");
  console.log(`  Realized revenue   ${k.realizedRevenue}`);
  console.log(`  Gross profit       ${k.grossProfit}`);
  console.log(`  Net operating P/L  ${k.netProfit}`);
  console.log(`  Ad spend (deducted) ${k.adSpend}\n`);

  console.log("AD SPEND (app_ad_spend table)");
  console.log(`  Total for period   ${ad.rows[0].total}`);
  console.log(`  Posted to GL?      no — ad spend never becomes a journal entry\n`);

  console.log("DIFFERENCE");
  console.log(`  GL net profit  - dashboard net profit = ${Math.round(glNet - k.netProfit)}`);

  // What a unified P&L would say.
  const unified = k.netProfit - glOperating - glOther + glOtherIncome;
  console.log(`  Unified (dashboard P/L - ledger opex + other income) = ${Math.round(unified)}`);
  console.log(`  vs GL net profit ${glNet}  -> gap ${Math.round(unified - glNet)}`);

  // Channel dimension already available?
  const channels = bundle.rows.reduce((m, r) => ({ ...m, [r.channel]: (m[r.channel] ?? 0) + r.netRevenue }), {} as Record<string, number>);
  console.log("\nCHANNEL DIMENSION (already computed by the report engine)");
  for (const [c, v] of Object.entries(channels)) console.log(`  ${c.padEnd(12)} net revenue ${Math.round(v)}`);
  const campaigns = new Set(bundle.rows.map((r) => r.campaign));
  console.log(`  campaign buckets: ${[...campaigns].slice(0, 6).join(", ")}${campaigns.size > 6 ? " …" : ""}`);
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
