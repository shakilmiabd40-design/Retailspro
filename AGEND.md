# Performance work handoff

## Goal

Reduce initial load and large list/report transfer time without changing order, courier, inventory, accounting, access-control, or sync behavior. Do not push unless explicitly asked.

## Completed in the current working tree

- Orders list API supports filters, pagination, summary totals, date validation, and status counts. Order page uses paginated rows and keeps financial/status summaries independent of the visible page.
- Dashboard and finance KPI reads use server endpoints. Dashboard sends report data rather than loading it from client stores.
- Accounting overview, trial balance, balance sheet, P&L, inventory, GRNI, and journal list have server query endpoints/pages. Accounting store avoids loading FIFO/movement/GRNI/AP collections for report screens.
- POS, legacy accounting, and other large collections gained route-aware activation through `useCollection(..., enabled)`.
- Dashboard initially skips orders, products, purchase orders, returns, warranties, and POS collection loads. Stock alert snapshots and Steadfast auto-sync candidate lookup now have small server reads. Accounting pages skip the full orders, returns, and warranty collections.
- Topbar search now uses a permission-checked API query. Sidebar order counts use the order summary endpoint on dashboard/accounting screens.
- Route-aware collection hook retains a collection after first activation so navigation cannot drop a pending write; it also resets hydration before a first load.
- Added order and journal indexes to `db/schema.sql`.
- Supplier search for the mail shortcut now uses the permission-checked search API; the full suppliers collection only activates on supplier, purchasing, returns, reports, GRNI, and data pages.
- Dashboard, finance KPI, and dashboard stock-alert read models are cached per process against the source collections' `app_revs` values. Unchanged data avoids repeated full source reads; writes still use the existing transactions and revision bumps.
- Dashboard stock-alert polling sends only the source revision when snapshots are unchanged, avoiding repeated transfer of the entire variant snapshot.
- Orders, returns, and warranty collections activate only on workflows and reports that consume them. The sidebar uses a small revision-cached status-count query on routes where the full orders collection is not loaded.
- Returns and warranty reports now fetch date-bounded candidate rows through permission-checked read APIs; those report routes no longer activate their complete returns/warranties sync collections. Existing browser-local date filtering still applies to preserve inclusive date semantics.
- Order, courier, sales/COD, summary, and product-sales reports fetch date-bounded order candidates through a permission-checked API. Sales & COD and Courier Cost & Profit/Loss now go further: dedicated `/api/reports/sales-cod` and `/api/reports/courier` endpoints return compact rows and KPIs, and the report day is the fixed Asia/Dhaka calendar day. These report routes no longer activate the full Orders collection; settlement reporting retains it because settlement writes update order flags.
- Order Status and Product Sales moved to dedicated `/api/reports/order-status` and `/api/reports/product-sales` endpoints that return compact rows. Product Sales reads product category/brand from a narrow server query and its customer returns from the server-side return candidates.
- Purchase, Supplier, Inventory Stock and Inventory Valuation moved to dedicated endpoints too. Purchase orders, returns and the product catalog are read narrowly on the server, so the report pages no longer compute from whole collections in the browser. Product cost is only sent to roles with the products "financial" permission.
- The Returns and Warranty reports now load their candidates through the shared report hook instead of a hand-rolled fetch in an effect.
- The `returns` collection is no longer activated on the Product Sales and Supplier report routes; it now loads only on `/returns` and `/suppliers/*`. The `orders` collection was already route-scoped and stays off every report route except the Settlement report. The `products` and `purchase_orders` collections still sync on every app route (the notification board and the report filter bar need them), so that transfer is unchanged by this work.
- Report courier options come from a small revision-cached query, so report filter bars no longer need the full Orders context just to populate the courier selector.

## Verification already run

- `npx tsc --noEmit` passes after the latest changes.
- `npm run build` passes.
- `npm run test:reports` passes (57 focused report tests).
- `npm run check:dashboard` proves the narrow dashboard/P&L read produces byte-identical output to the
  previous full-record read, for five date ranges, both cost-visibility modes and three P&L periods.
- `npm run check:profit` prints the gap between the Owner Dashboard's profit and the Accounting P&L.
- `npm run check:profit-loss` runs the new Profit & Loss report against the live database and proves the
  statement adds up; it also checks the ad-spend and COD-fee SQL against synthetic rows.
- `npm run check:query` runs every report-builder dataset with every dimension and measure.
- `npm run lint` is clean (the one remaining `react-hooks/set-state-in-effect` error in
  `src/lib/notifications/store.tsx` was fixed by moving the snapshot reset into React's "adjust state
  during render" pattern, which keeps the exact behaviour).
- `git diff --check` passes.
- **Database migration applied** with `npm run db:setup` (never `db:reset`): the three missing tables (`app_ad_spend`, `app_report_daily_summary`, `app_sync_failures`), the `app_sync_failures` columns and all 13 new indexes now exist. Every `app_records` collection count and both users were identical before and after, and the Phase 1/2/3/4/5 report queries were smoke-tested against the live data.
- `npm run db:backup` writes a full JSON dump of every `app_*` table to `backups/` (git-ignored). See `docs/BACKUP.md`.

## Still incomplete

1. The Orders screen and Settlement report still activate the full `orders` collection. This is a
   direct consequence of the write path, not an oversight: both screens mutate orders in the browser and
   save through `/api/sync`, which needs the complete record (and its current `version`) to build a
   correct upsert. Moving them off the collection needs a dedicated transactional endpoint — a different
   write path — so it is left alone until that is explicitly wanted.
2. The dashboard and the P&L read the whole `orders` and `products` collections on a cache miss. The
   read is now narrowed in SQL (`src/server/reports/dashboard-source.ts` drops the activity trail, the
   customer's address/notes and the product's description/lists, none of which the dashboard or the P&L
   read), which cut the orders payload by ~58% without changing a number — `npm run check:dashboard`
   proves the old and new reads produce byte-identical output for every range and both cost modes. What
   is still open is pushing the aggregation itself into SQL (lifetime customer and category counts still
   need every order), which must not change those semantics.
3. The `products` and `purchase_orders` collections still sync on every app route, because the stock
   board and the report filter bar need them. Narrowing them means giving the stock board a server-side
   source on non-dashboard routes — a notification-lifecycle change, so it is not done here.
4. Review all route-scoped store transitions and validate actual sync, courier fallback, notification snapshots, and accounting behavior before considering the work complete.

## Migration status (report redesign)

| Report | Read source |
| --- | --- |
| Owner Dashboard, Sales by Channel, Sync Health | Server (`/api/reports/daily-summary`, `/api/reports/sync-health`) |
| Profit & Loss, Report Builder | Server (`/api/reports/profit-loss`, `/api/reports/query`) |
| Sales & COD, Courier Cost & Profit/Loss | Server (`/api/reports/sales-cod`, `/api/reports/courier`) |
| Order Status, Product Sales | Server (`/api/reports/order-status`, `/api/reports/product-sales`) |
| Purchase, Supplier | Server (`/api/reports/purchases`, `/api/reports/suppliers`) |
| Inventory Stock, Inventory Valuation | Server (`/api/reports/inventory-stock`, `/api/reports/inventory-valuation`) |
| Returns, Warranty | Server candidates (`/api/reports/returns`, `/api/reports/warranties`), browser-local date filter |
| Settlement Report | Client-side (transactional ledger screen that writes payouts) |

## Important constraints

- Preserve the generic `/api/sync` write path and its optimistic versioning, accounting posting, webhook, and audit behavior.
- Never use a partial list with the full collection adapter: `collect()` interprets missing rows as deletes.
- Server endpoints must enforce the same `canRead`/role and product cost redaction rules as collection sync.
- Keep dashboard/summary refresh behavior and courier status polling active when the full order collection is unloaded.
- Workspace changes are uncommitted and have not been pushed.
