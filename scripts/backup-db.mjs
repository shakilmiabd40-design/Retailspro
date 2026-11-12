// Backs up the app's database to a JSON file — no pg_dump needed.
//
//   npm run db:backup            write backups/retailpro-<timestamp>.json
//   npm run db:backup -- --out  write to a specific path
//
// What it saves: every app_* table (app_records, app_documents, app_users, app_roles,
// app_sessions, app_revs, app_counters, app_audit_log, app_api_keys, app_webhooks,
// app_webhook_deliveries, app_sent_notification_emails, app_ad_spend,
// app_report_daily_summary, app_sync_failures).
//
// The file contains password hashes and session tokens — keep it somewhere private.
// Restoring is manual: see docs/BACKUP.md.
//
// Reads DATABASE_URL from .env.local (or .env, or the real environment).
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(filePath) {
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

// Same TLS rules as src/server/db.ts.
function sslFor(host) {
  const mode = (process.env.DATABASE_SSL ?? "").toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (mode === "disable" || (!mode && local)) return false;
  const ca = process.env.DATABASE_CA_CERT;
  if (ca) return { ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true };
  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "false") return { rejectUnauthorized: false };
  if (/\.(aivencloud\.com|aiven\.io)$/i.test(host)) return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

// Every app_* table, in dependency order so a restore can replay them safely.
const TABLES = [
  "app_roles",
  "app_users",
  "app_sessions",
  "app_records",
  "app_documents",
  "app_revs",
  "app_counters",
  "app_audit_log",
  "app_api_keys",
  "app_webhooks",
  "app_webhook_deliveries",
  "app_sent_notification_emails",
  "app_ad_spend",
  "app_report_daily_summary",
  "app_sync_failures",
];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("REPLACE-WITH-YOUR-HOST") || url.includes("REPLACE_WITH-YOUR_PASSWORD")) {
    console.error("\n❌ DATABASE_URL isn't set (or is still the placeholder).");
    console.error("   Put your Neon or Aiven connection string in .env.local, then run this again.\n");
    process.exit(1);
  }

  let u;
  try {
    u = new URL(url);
  } catch (err) {
    console.error("\n❌ Could not parse DATABASE_URL:", err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const outFlag = process.argv.indexOf("--out");
  const outPath = outFlag >= 0 && process.argv[outFlag + 1] ? path.resolve(process.argv[outFlag + 1]) : path.join(root, "backups", `retailpro-${timestamp()}.json`);

  const pool = new Pool({
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: Number(u.port) || 5432,
    database: u.pathname.replace(/^\//, "") || undefined,
    ssl: sslFor(u.hostname),
    max: 1,
    connectionTimeoutMillis: 20_000,
  });

  try {
    console.log(`→ Target: ${decodeURIComponent(u.username)}@${u.hostname}:${u.port || 5432}/${u.pathname.replace(/^\//, "")}`);
    console.log("→ Connecting…");
    await pool.query("select 1");
    console.log("✓ Connected.");

    const present = new Set(
      (await pool.query("select table_name from information_schema.tables where table_schema='public' and table_name like 'app_%'")).rows.map((r) => r.table_name)
    );

    const backup = { createdAt: new Date().toISOString(), host: u.hostname, database: u.pathname.replace(/^\//, ""), tables: {} };
    let rowCount = 0;

    for (const table of TABLES) {
      if (!present.has(table)) {
        console.log(`  · ${table}: not present, skipped`);
        continue;
      }
      const { rows } = await pool.query(`select * from ${table}`);
      backup.tables[table] = rows;
      rowCount += rows.length;
      console.log(`  · ${table}: ${rows.length} rows`);
    }

    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(backup, null, 0), "utf8");

    console.log(`\n🎉 Backup written: ${outPath}`);
    console.log(`   ${rowCount} rows across ${Object.keys(backup.tables).length} tables.`);
    console.log("   It holds password hashes and session tokens — keep the file private.\n");
  } catch (err) {
    console.error("\n❌ Backup failed:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
