// Creates (or upgrades) the RetailPro tables in your Postgres database — Neon, Aiven, or any other.
//
//   npm run db:setup            create tables (safe to re-run; never deletes data)
//   npm run db:reset -- --yes   DROP every RetailPro table, then recreate them (deletes ALL app data & users)
//
// Reads DATABASE_URL from .env.local (or .env, or the real environment).
import { readFileSync, existsSync } from "node:fs";
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
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
  if (ca) return { ca, rejectUnauthorized: true };
  const explicit = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
  if (explicit === "false") return { rejectUnauthorized: false };
  if (explicit === "true") return { rejectUnauthorized: true };
  if (/\.(aivencloud\.com|aiven\.io)$/i.test(host)) return { rejectUnauthorized: false };
  return { rejectUnauthorized: true };
}

const RESET = process.argv.includes("--reset");
const YES = process.argv.includes("--yes");
const TABLES = ["app_sent_notification_emails", "app_webhook_deliveries", "app_webhooks", "app_api_keys", "app_audit_log", "app_counters", "app_revs", "app_documents", "app_records", "app_sessions", "app_users", "app_roles"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("REPLACE-WITH-YOUR-HOST") || url.includes("REPLACE_WITH_YOUR_PASSWORD")) {
    console.error("\n❌ DATABASE_URL isn't set (or is still the placeholder).");
    console.error("   Put your Neon or Aiven connection string in .env.local, then run this again.\n");
    process.exit(1);
  }

  let u;
  try {
    u = new URL(url);
  } catch (err) {
    console.error("\n❌ Could not parse DATABASE_URL:", err instanceof Error ? err.message : err);
    console.error("   It must be a single line starting with postgres:// or postgresql://\n");
    process.exit(1);
  }

  const ssl = sslFor(u.hostname);
  console.log(`→ Target: ${decodeURIComponent(u.username)}@${u.hostname}:${u.port || 5432}/${u.pathname.replace(/^\//, "")}  (tls: ${ssl === false ? "off" : ssl.rejectUnauthorized ? "verified" : "encrypted, not verified"})`);

  if (RESET && !YES) {
    console.error("\n⚠️  --reset drops all RetailPro tables (products, orders, users, audit log…).");
    console.error("   Re-run with --yes to confirm:  npm run db:reset -- --yes\n");
    process.exit(1);
  }

  const pool = new Pool({
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    database: u.pathname.replace(/^\//, "") || undefined,
    ssl,
    max: 1,
    connectionTimeoutMillis: 20_000,
  });

  try {
    console.log("→ Connecting…");
    await pool.query("select 1");
    console.log("✓ Connected.");

    if (RESET) {
      console.log("→ Dropping RetailPro tables…");
      await pool.query(`drop table if exists ${TABLES.join(", ")} cascade`);
      console.log("✓ Dropped.");
    }

    console.log("→ Creating tables (db/schema.sql)…");
    await pool.query(readFileSync(path.join(root, "db", "schema.sql"), "utf8"));
    console.log("✓ Schema ready.");

    const { rows } = await pool.query("select count(*)::int as n from app_users");
    console.log(
      rows[0].n === 0
        ? "\n🎉 Done. Start the app (npm run dev) and open it — you'll be asked to create the first Super Admin.\n"
        : `\n🎉 Done. ${rows[0].n} user(s) already exist; sign in as usual.\n`
    );
  } catch (err) {
    console.error("\n❌ Setup failed:", err instanceof Error ? err.message : err);
    console.error("   Check DATABASE_URL (copy it fresh from Neon / Aiven) and the DATABASE_SSL* variables in .env.example.\n");
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
