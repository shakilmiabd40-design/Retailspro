// Regression check: the narrow dashboard read must produce byte-identical output to
// the old full-record read, for every range and both cost-visibility modes.
//
//   npm run check:dashboard
//
// Reads the live database (read-only) and compares both paths. It never writes.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { buildDashboard, type DashboardDateRange } from "../src/lib/dashboard";
import { profitLoss } from "../src/lib/accounting/utils";
import { redactProductCost } from "../src/server/redact";
// The field lists come from the module itself, so this check can never drift from
// what the dashboard actually reads.
import { UNUSED_ORDER_FIELDS, UNUSED_PRODUCT_FIELDS } from "../src/server/reports/dashboard-source";
import type { Order } from "../src/lib/orders/types";
import type { Product } from "../src/lib/products/types";
import type { PosInvoice } from "../src/lib/pos/types";
import type { LedgerEntry } from "../src/lib/accounting/types";

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

function sslFor(host: string) {
  const mode = (process.env.DATABASE_SSL ?? "").toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (mode === "disable" || (!mode && local)) return false;
  const ca = process.env.DATABASE_CA_CERT;
  if (ca) return { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true };
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false") return { rejectUnauthorized: false };
  if (/\.(aivencloud\.com|aiven\.io)$/i.test(host)) return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

// Must match src/server/reports/dashboard-source.ts (imported above).
const minus = (fields: readonly string[]) => fields.map((f) => `'${f}'`).join(" - ");

let failures = 0;

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const pool = new pg.Pool({
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    host: url.hostname,
    port: Number(url.port) || 5432,
    database: url.pathname.replace(/^\//, "") || undefined,
    ssl: sslFor(url.hostname),
    max: 1,
    connectionTimeoutMillis: 20_000,
  });

  const load = async <T,>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const { rows } = await pool.query<{ data: T }>(sql, params);
    return rows.map((r) => r.data);
  };

  const compare = (label: string, a: unknown, b: unknown) => {
    const sa = JSON.stringify(a);
    const sb = JSON.stringify(b);
    if (sa === sb) {
      console.log(`  OK  ${label}`);
    } else {
      failures += 1;
      console.log(`  FAIL ${label}`);
      console.log(`       old: ${String(sa).slice(0, 300)}`);
      console.log(`       new: ${String(sb).slice(0, 300)}`);
    }
  };

  try {
    const [oldOrders, newOrders] = await Promise.all([
      load<Order>("select data from app_records where collection='orders'"),
      load<Order>(`select data - ${minus(UNUSED_ORDER_FIELDS)} as data from app_records where collection='orders'`),
    ]);
    const [oldProducts, newProducts] = await Promise.all([
      load<Product>("select data from app_records where collection='products'"),
      load<Product>(`select data - ${minus(UNUSED_PRODUCT_FIELDS)} as data from app_records where collection='products'`),
    ]);
    const invoices = await load<PosInvoice>("select data from app_records where collection='pos_invoices'");
    const ledger = await load<LedgerEntry>("select data from app_records where collection='ledger'");

    console.log(`Loaded: ${oldOrders.length} orders, ${oldProducts.length} products, ${invoices.length} invoices, ${ledger.length} ledger entries\n`);

    const bytes = (rows: unknown[]) => JSON.stringify(rows).length;
    console.log("Payload size:");
    console.log(`  orders   ${bytes(oldOrders)} -> ${bytes(newOrders)} bytes`);
    console.log(`  products ${bytes(oldProducts)} -> ${bytes(newProducts)} bytes\n`);

    const ranges: (DashboardDateRange | undefined)[] = [
      undefined,
      { from: "2026-10-01", to: "2026-10-31", label: "October" },
      { from: "2026-01-01", to: "2026-12-31", label: "This Year" },
      { from: "2026-09-18", to: "2026-09-18", label: "One Day" },
      { from: "2020-01-01", to: "2030-01-01", label: "All time" },
    ];

    for (const seesCost of [true, false]) {
      console.log(`Dashboard (seesCost=${seesCost}):`);
      const oldP = seesCost ? oldProducts : oldProducts.map((p) => redactProductCost(p) as Product);
      const newP = seesCost ? newProducts : newProducts.map((p) => redactProductCost(p) as Product);
      for (const range of ranges) {
        const now = new Date("2026-11-12T09:00:00.000Z");
        const oldOut = buildDashboard(oldOrders, oldP, now, ledger, invoices, range);
        const newOut = buildDashboard(newOrders, newP, now, ledger, invoices, range);
        compare(`range ${range?.label ?? "default"}`, oldOut, newOut);
      }
    }

    console.log("\nFinance (P&L):");
    const oldP = oldProducts.map((p) => redactProductCost(p) as Product);
    const newP = newProducts.map((p) => redactProductCost(p) as Product);
    for (const [from, to] of [
      ["2026-10-01", "2026-10-31"],
      ["2026-09-18", "2026-09-18"],
      ["2026-01-01", "2026-12-31"],
    ] as [string, string][]) {
      const oldOut = profitLoss({ orders: oldOrders, products: oldP, invoices, ledger }, from, to);
      const newOut = profitLoss({ orders: newOrders, products: newP, invoices, ledger }, from, to);
      compare(`P&L ${from}..${to}`, oldOut, newOut);
    }
  } catch (err) {
    failures += 1;
    console.error("Differential check failed:", err instanceof Error ? err.message : err);
  } finally {
    await pool.end();
  }

  console.log(failures ? `\n${failures} mismatch(es) — the narrow read changes the numbers!` : "\nAll outputs identical.");
  process.exitCode = failures ? 1 : 0;
}

main();
