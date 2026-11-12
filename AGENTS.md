# Repository guidance

## Project

RetailsPro is a Next.js App Router inventory and accounting application for a shoe shop. It uses TypeScript, React, PostgreSQL (`pg`, without an ORM), browser-side domain stores, and a transactional sync API.

Before changing a subsystem, read its relevant guide:

- Public API and webhook contract: `docs/API.md`
- Report dates, totals, and accounting-like report rules: `docs/REPORTS.md`
- Inventory notification behavior: `docs/NOTIFICATIONS.md`
- Database setup and sync architecture: `README.md`
- Current performance handoff and known incomplete work: `AGEND.md`

## Non-negotiable data and API rules

- Preserve accounting behavior and recorded balances. Do not change sale, purchase, return, settlement, stock valuation, posting, or rounding formulas without tracing their callers and documenting the effect.
- Keep writes on the existing `/api/sync` path unless a task explicitly requires a dedicated transactional endpoint. Preserve optimistic record versions, audit logging, accounting posting, inventory updates, and webhook outbox behavior.
- Do not make a public API contract change casually. Keep authentication, idempotency, stock reservation/release, response shapes, and signed webhook behavior compatible with `docs/API.md`.
- Never pass a filtered or paginated subset to the full collection sync adapter. Its `collect()` behavior treats omitted records as deletions. Use a read-only query endpoint for partial data.
- Enforce server-side session, role, and `canRead`/`canWrite` checks on every new route. Follow `src/server/collections.ts` access rules; do not assume hidden UI controls provide security.
- Preserve product-cost and sensitive-ledger visibility rules. Return only the fields a caller is allowed to see; do not expose raw accounting ledger rows to Reports-only roles.
- Keep database writes transactional when one user action affects multiple records or collections. Preserve optimistic concurrency checks and database-backed number allocation.
- Treat `db/schema.sql` as the database schema source. Schema changes must be additive and safe for existing data unless the task explicitly requests a migration that removes data.

## Performance and collection loading

- Prefer narrow, permission-checked server reads, pagination, indexes, and revision-keyed caches for read-only screens.
- Do not change report date boundaries, timezone handling, filters, totals, exports, or rounding when moving calculations to the server. Consult `docs/REPORTS.md` and preserve the established browser-local inclusive date semantics where used.
- Route-scoped collection activation must account for pending writes and navigation. Do not drop a previously activated collection while its writes may still be pending.
- Keep dashboard summaries, sidebar counts, stock-alert refreshes, and courier status polling live when large collections are not loaded.
- Cache only derived/read data and invalidate it from the source revision. Never let a cache bypass authorization or return cost-sensitive fields to an unauthorized role.

## Notifications

- Inventory alerts are transition-based. Reconcile a lost/stale tracked-state entry against existing open notifications before creating another alert; keep one open notification per variant and status.
- Order and courier notifications belong in the shared `order_notifications` document and must be written transactionally on the server. Keep repeated Steadfast webhook deliveries idempotent, including unchanged status and COD payloads.
- Send email only through a server route that re-checks notification settings and recipients and uses a database uniqueness claim to prevent duplicate delivery across tabs/retries.
- Update `docs/NOTIFICATIONS.md` whenever the notification lifecycle, channels, or supported events change.

## Implementation conventions

- Keep shared domain calculations in the existing `src/lib` modules instead of duplicating formulas in pages or API routes.
- Keep server-only code in `src/server` or route handlers and mark server-only modules appropriately. Do not import server modules into client components.
- Validate and bound query parameters before building SQL. Use parameterized SQL; never interpolate user input into SQL strings.
- Keep API responses and errors consistent with neighboring routes. Avoid returning full database rows when a compact projection will do.
- Preserve existing behavior on failures: show useful loading/error states and do not silently replace failed data with zeroes or empty results.

## Verification

- For TypeScript changes, run `npx tsc --noEmit` when verification is requested or needed for the task.
- Run only focused tests for changed business logic when tests are requested. Do not reset or seed a real database as part of routine verification.
- Review `git diff --check` and the final diff. Do not commit or push unless the user asks.
- Never run `npm run db:reset` against a configured database without explicit user direction; it drops application data.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
