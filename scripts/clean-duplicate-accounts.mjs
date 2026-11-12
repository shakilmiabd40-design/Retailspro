// Removes chart-of-accounts rows that were seeded twice by the old seeding race.
//
//   node scripts/clean-duplicate-accounts.mjs
//
// Only a row is removed when ALL of these hold:
//   * another row has the same code and name (a duplicate of a default account);
//   * no journal line, inventory movement or cost layer points at it.
//
// Money is never touched: a row that any entry references is always kept.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

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

const dryRun = process.argv.includes("--dry-run");

const { rows: totalsBefore } = await pool.query(
  `select coalesce(sum((l->>'debit')::numeric),0)::text as debit, coalesce(sum((l->>'credit')::numeric),0)::text as credit
   from app_records j cross join lateral jsonb_array_elements(coalesce(j.data->'lines','[]'::jsonb)) l
   where j.collection='journal_entries' and j.data->>'status'='posted'`
);

// Accounts that share a code with another row. For each code only ONE copy is kept —
// the one an entry points at, or the oldest one when nothing points at either.
const { rows: duplicates } = await pool.query(
  `with used as (
     select distinct l->>'accountId' as id from app_records j
       cross join lateral jsonb_array_elements(coalesce(j.data->'lines','[]'::jsonb)) l
     where j.collection='journal_entries'
     union
     select distinct data->>'accountId' as id from app_records where collection='inventory_cost_layers'
     union
     select distinct data->>'accountId' as id from app_records where collection='grni'
     union
     select distinct data->>'accountId' as id from app_records where collection='ap_invoices'
   ),
   ranked as (
     select a.id, a.data->>'code' as code, a.data->>'name' as name,
       row_number() over (
         partition by a.data->>'code', a.data->>'name'
         order by (exists (select 1 from used u where u.id = a.id)) desc, a.seq asc
       ) as rn
     from app_records a
     where a.collection='chart_of_accounts'
   )
   select id, code, name from ranked where rn > 1`
);

console.log(`Duplicate accounts that nothing points at: ${duplicates.length}`);
if (!duplicates.length) {
  await pool.end();
  process.exit(0);
}

if (dryRun) {
  for (const row of duplicates) console.log(`  would remove ${row.code} ${row.name} (${row.id})`);
  await pool.end();
  process.exit(0);
}

await pool.query("begin");
try {
  const ids = duplicates.map((row) => row.id);
  await pool.query("delete from app_records where collection='chart_of_accounts' and id = any($1::text[])", [ids]);
  const { rows: totalsAfter } = await pool.query(
    `select coalesce(sum((l->>'debit')::numeric),0)::text as debit, coalesce(sum((l->>'credit')::numeric),0)::text as credit
     from app_records j cross join lateral jsonb_array_elements(coalesce(j.data->'lines','[]'::jsonb)) l
     where j.collection='journal_entries' and j.data->>'status'='posted'`
  );
  if (totalsAfter[0].debit !== totalsBefore[0].debit || totalsAfter[0].credit !== totalsBefore[0].credit) {
    throw new Error("Ledger totals changed — rolling back.");
  }
  // Let open browsers notice the change.
  await pool.query(
    `insert into app_revs (name, rev) values ('chart_of_accounts', 1)
     on conflict (name) do update set rev = app_revs.rev + 1`,
  );
  await pool.query("commit");
  console.log(`Removed ${ids.length} duplicate accounts. Ledger totals unchanged (debit ${totalsAfter[0].debit}, credit ${totalsAfter[0].credit}).`);
} catch (err) {
  await pool.query("rollback");
  console.error("Cleanup failed and was rolled back:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
