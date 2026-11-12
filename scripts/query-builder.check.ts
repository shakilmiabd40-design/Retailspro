// Check the report builder against the live database.
//
//   npm run check:query
//
// Runs every dataset with every dimension and measure, so a broken expression
// shows up here rather than in the browser. Read-only.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { QUERY_DATASETS, normaliseQueryRequest } from "../src/lib/reports/query-builder";
import { runQuery } from "../src/server/reports/query-builder";

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

const FROM = "2020-01-01";
const TO = "2030-12-31";

async function main() {
  let failures = 0;

  for (const dataset of QUERY_DATASETS) {
    console.log(`\n${dataset.label}`);
    for (const dimension of dataset.dimensions) {
      for (const field of dataset.fields.filter((f) => f.aggregatable)) {
        const request = normaliseQueryRequest({
          dataset: dataset.key,
          dimension: dimension.key,
          measure: field.key,
          aggregation: "sum",
          from: FROM,
          to: TO,
          filters: {},
        });
        if (!request) {
          failures += 1;
          console.log(`  FAIL ${dimension.key} / ${field.key} — request rejected`);
          continue;
        }
        try {
          const result = await runQuery(request);
          const top = result.rows[0];
          console.log(`  OK  ${dimension.key.padEnd(14)} ${field.key.padEnd(16)} ${String(result.rows.length).padStart(3)} groups, ${result.total} records${top ? `, top "${top.group}" = ${Math.round(top.value)}` : ""}`);
        } catch (err) {
          failures += 1;
          console.log(`  FAIL ${dimension.key} / ${field.key}: ${err instanceof Error ? err.message : err}`);
        }
      }
    }
  }

  // A hand-made request must not be able to reach anything outside the catalogue.
  console.log("\nRequest validation");
  const bogus = normaliseQueryRequest({ dataset: "orders; drop table app_users", dimension: "1=1", measure: "password_hash", aggregation: "sum", from: "2026-01-01", to: "2026-01-02", filters: {} });
  console.log(`  ${bogus ? `unknown dataset rejected -> fell back to "${bogus.dataset}"` : "unknown dataset rejected"}`);
  const badDate = normaliseQueryRequest({ dataset: "orders", from: "not-a-date", to: "2026-01-02", dimension: "channel", measure: "netRevenue", aggregation: "sum", filters: {} });
  console.log(`  ${badDate === null ? "bad date rejected" : "BAD DATE ACCEPTED"}`);
  const good = normaliseQueryRequest({ dataset: "orders", dimension: "channel", measure: "netRevenue", aggregation: "sum", from: "2026-01-01", to: "2026-12-31", filters: { status: "delivered" } });
  console.log(`  ${good ? `valid request kept, filter applied: ${JSON.stringify(good.filters)}` : "valid request rejected"}`);

  if (failures) process.exitCode = 1;
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
