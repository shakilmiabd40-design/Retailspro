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
- Order, courier, sales/COD, summary, and product-sales reports fetch date-bounded order candidates through a permission-checked API. Inventory valuation fetches delivered line history without transferring whole order records. These report routes no longer activate the full Orders collection; settlement reporting retains it because settlement writes update order flags.
- Report courier options come from a small revision-cached query, so report filter bars no longer need the full Orders context just to populate the courier selector.

## Verification already run

- `npx tsc --noEmit` passes after the latest changes.
- `git diff --check` passes.
- No tests were run.

## Still incomplete

1. The Orders screen and Settlement report still activate the full `orders` collection because their current mutations depend on the complete client store. The Orders API pagination therefore does not yet eliminate the full sync on those routes.
2. Purchase/supplier and inventory-stock reports still read full source collections; product-sales and inventory valuation still need the product catalog client-side. Move those remaining reads to filtered or aggregated endpoints while preserving permissions, date rules, totals, and exports.
3. Dashboard cache avoids repeated source reads while revisions are unchanged, but the first read after a write still loads source rows. Replace those scans with SQL aggregates/narrow reads without changing lifetime customer/category semantics.
4. Review all route-scoped store transitions and validate actual sync, courier fallback, notification snapshots, and accounting behavior before considering the work complete.

## Important constraints

- Preserve the generic `/api/sync` write path and its optimistic versioning, accounting posting, webhook, and audit behavior.
- Never use a partial list with the full collection adapter: `collect()` interprets missing rows as deletes.
- Server endpoints must enforce the same `canRead`/role and product cost redaction rules as collection sync.
- Keep dashboard/summary refresh behavior and courier status polling active when the full order collection is unloaded.
- Workspace changes are uncommitted and have not been pushed.
