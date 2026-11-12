# Database backup & restore

The app's data lives in one PostgreSQL database (`DATABASE_URL` in `.env.local`).
`npm run db:setup` only ever **adds** schema; it never deletes data. This page
covers taking and restoring a backup, so a schema change can never cost you data.

## Take a backup

```powershell
npm run db:backup
```

Writes `backups/retailpro-<timestamp>.json` (every `app_*` table: records,
documents, users, roles, sessions, revisions, counters, audit log, API keys,
webhooks and their deliveries, ad spend, sync failures).

The file is **not** committed (`backups/` is git-ignored). It contains password
hashes and session tokens — keep it somewhere private.

Options:

```powershell
npm run db:backup -- --out D:\somewhere\retailpro.json
```

## Which command is safe

| Command | What it does | Data |
| --- | --- | --- |
| `npm run db:backup` | Reads every table into a JSON file | Read-only, never changes data |
| `npm run db:setup` | Creates missing tables/indexes/columns | Read-only for existing rows; safe to re-run |
| `npm run db:reset -- --yes` | **Drops all 15 tables, then recreates them** | **Deletes everything** — only for a factory-fresh install |

> `db:reset` is the only destructive command. Everything else is additive or read-only.

## Restore

There is no one-click restore, because the restore has to respect the app's
optimistic versioning. Two situations:

### 1. A single collection was lost (e.g. a table was dropped by mistake)

Restore that one collection from the backup, keeping the current `version` and
`seq` columns so the app's sync still works:

```sql
-- example: restore the products collection
insert into app_records (collection, id, seq, data, version, updated_at, updated_by)
select 'products', id, seq, data, version, now(), 'restore'
from jsonb_to_recordset(
  (select data->'tables'->'app_records' from jsonb_read_file('C:/path/backup.json') ...)
) as x(collection text, id text, seq bigint, data jsonb, version int)
where collection = 'products'
on conflict (collection, id) do update
  set data = excluded.data, version = excluded.version, updated_at = now();
```

Bump the collection revision so open browsers reload it:

```sql
insert into app_revs (name, rev) values ('products', 1)
on conflict (name) do update set rev = app_revs.rev + 1;
```

### 2. A full restore onto an empty database

1. `npm run db:setup` — creates the schema.
2. Insert every table from the backup, in this order (each one depends on the
   previous): `app_roles` → `app_users` → `app_sessions` → `app_records` →
   `app_documents` → `app_revs` → `app_counters` → `app_audit_log` →
   `app_api_keys` → `app_webhooks` → `app_webhook_deliveries` →
   `app_sent_notification_emails` → `app_ad_spend` →
   `app_report_daily_summary` → `app_sync_failures`.
3. Sign in as usual — password hashes travel with the backup.

`app_sessions` is included so an active browser stays signed in; delete those
rows if you want everyone to sign in again.

## Doing it on a schedule

`db:backup` is a plain script, so it can run from Task Scheduler or cron:

```powershell
npm run db:backup -- --out D:\backups\retailpro.json
```

Keep the file off the git repository and off the machine's Desktop — it is
effectively a password database.

## Check what's in the database right now

```powershell
node -e "..."   # or open the dashboard — the numbers come from the same tables
```

The quickest sanity check after any setup or restore:

```powershell
npm run db:backup   # prints the row count of every table
```
