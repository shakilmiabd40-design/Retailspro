// Restores one collection from a backup file (used after a botched cleanup).
//   node scripts/restore-collection.mjs <backup.json> <collection>
import { readFileSync } from "node:fs";
import pg from "pg";

const [, , backupPath, collection] = process.argv;
if (!backupPath || !collection) {
  console.error("Usage: node scripts/restore-collection.mjs <backup.json> <collection>");
  process.exit(1);
}

function loadEnvFile(filePath) {
  try {
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
  } catch {}
}
loadEnvFile(".env.local");
loadEnvFile(".env");

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

const backup = JSON.parse(readFileSync(backupPath, "utf8"));
// The backup stores `app_records` as one table with a collection column.
const allRows = backup.tables?.app_records ?? backup.tables?.[collection];
if (!Array.isArray(allRows)) {
  console.error(`No "${collection}" in the backup.`);
  process.exit(1);
}
const rows = allRows
  .map((row) => (row.collection ? row : { ...row, collection }))
  .filter((row) => row.collection === collection);

const url = new URL(process.env.DATABASE_URL);
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

const { rows: existing } = await pool.query("select id from app_records where collection = $1", [collection]);
const have = new Set(existing.map((row) => row.id));
const missing = rows.filter((row) => !have.has(row.id));

console.log(`Backup has ${rows.length} "${collection}" rows; ${missing.length} are missing from the database.`);

if (missing.length) {
  const payload = JSON.stringify(missing.map((row) => ({ id: row.id, data: row.data })));
  await pool.query(
    `insert into app_records (collection, id, data, updated_by)
     select $1, row_data.id, row_data.data, 'restore'
     from jsonb_to_recordset($2::jsonb) as row_data(id text, data jsonb)
     on conflict (collection, id) do nothing`,
    [collection, payload],
  );
  await pool.query(
    `insert into app_revs (name, rev) values ($1, 1) on conflict (name) do update set rev = app_revs.rev + 1`,
    [collection],
  );
  console.log(`Restored ${missing.length} rows.`);
} else {
  console.log("Nothing to restore.");
}

const { rows: after } = await pool.query("select count(*)::int as n from app_records where collection = $1", [collection]);
console.log(`"${collection}" now has ${after[0].n} rows.`);
await pool.end();
