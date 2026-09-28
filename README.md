# RetailPro Dashboard

An inventory, sales and courier-settlement system for a shoe shop: products & stock, orders
through delivery, suppliers & purchase orders, returns, warranty, reports, and a full Settings
module — with **sign-in, roles & permissions**, and all data in **PostgreSQL (Neon or Aiven)**.

## Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS v4 with CSS-variable design tokens (dark/light theme)
- **Charts / icons / theme:** Recharts, lucide-react, next-themes
- **Database:** PostgreSQL via `pg` (no ORM) — Neon, Aiven or any Postgres; only `DATABASE_URL` differs
- **Auth:** email/username + password (scrypt), server-side sessions in the database, HTTP-only cookie

## Quick start

```bash
npm install
cp .env.example .env.local        # then put your connection string in DATABASE_URL
npm run db:setup                  # creates the tables (safe to re-run)
npm run dev
```

Open http://localhost:3000 — on a fresh database you are asked to **create the first account**.
It becomes the Super Admin (and you can tick "Start with sample data" for demo products, orders
and suppliers). Everyone else is added later under **Settings → Users & Roles**.

### Neon

1. Create a project at [console.neon.tech](https://console.neon.tech).
2. **Connect** → copy the **pooled** connection string into `DATABASE_URL`:
   `postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require`

### Aiven

1. Create a **PostgreSQL** service at [console.aiven.io](https://console.aiven.io).
2. **Overview → Service URI** → copy it into `DATABASE_URL`
   (`postgres://avnadmin:PASSWORD@HOST.aivencloud.com:PORT/defaultdb?sslmode=require`). Note the port is not 5432.
3. Optional but recommended: download the service's CA certificate and set `DATABASE_CA_CERT`
   so the server certificate is verified. Without it the connection is encrypted but unverified.

Other variables (all optional) are documented in `.env.example`: `DATABASE_SSL`, `DATABASE_CA_CERT`,
`DATABASE_SSL_REJECT_UNAUTHORIZED`, `DATABASE_POOL_MAX`, `SETUP_TOKEN`, `AUTH_COOKIE_SECURE`.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run db:setup` | Creates / upgrades the tables from `db/schema.sql`. Never deletes data. |
| `npm run db:reset -- --yes` | **Drops** every RetailPro table and recreates them (all data and users are lost). |

If your database still has the old `customers` / `products` / `orders` demo tables from an earlier
version of this project, they are no longer used and can be dropped.

### Troubleshooting

- **The login page says "Connect your database" / "Database not set up yet"** — `DATABASE_URL` is missing,
  or `npm run db:setup` hasn't been run against it.
- **"Can't reach the database"** — check the host and port were copied exactly; check the provider allows
  connections from your machine / server (Aiven: *Allowed IP addresses*).
- **`self-signed certificate in certificate chain`** — Aiven's CA isn't in Node's trust store. Leave `DATABASE_CA_CERT`
  unset (the default encrypts without verifying) or set it to the CA certificate from the Aiven console.
- **`password authentication failed`** — the password changes if you reset credentials in the provider console; copy the string again.
- **Works locally but not on Vercel** — add the same variables under Project → Settings → Environment Variables and redeploy.
- **Locked out** — a Super Admin can reset your password under Settings → Users & Roles. If the only Super Admin is locked
  (too many wrong passwords), the lockout clears by itself after the configured minutes (Settings → Security).

## Signing in

- Passwords are stored only as salted **scrypt** hashes. The server issues a random session token in an
  HTTP-only, SameSite=Lax cookie (Secure over https); only its SHA-256 hash is kept in the database.
- **Settings → Security** is enforced by the server: minimum length / uppercase / number / symbol rules, force password
  change at first sign-in, **inactivity timeout**, and a **failed-attempt lockout**. Two-factor authentication is not implemented yet.
- New users and password resets get a generated temporary password, shown **once** to the admin; the user must
  choose their own at first sign-in.
- Roles & permissions are checked on the server for every read and write (per collection — see below), and the UI hides
  what a role can't use. The Super Admin role can't be edited, and there is always at least one active Super Admin.
- Every sign-in, failed attempt, lockout, user / role change, backup and restore is written to the audit log with the
  actor and time stamped by the server.
- For public deployments set `SETUP_TOKEN` so nobody else can claim the first-run admin account.

## How data is stored

The app's business rules (stock reservation, warranties, settlements…) still run in the browser, so instead of
rewriting them as server code the stores save through a small sync layer (`src/lib/persist/*`):

- Each list (`products`, `orders`, `suppliers`, `purchase_orders`, `returns`, `warranties`) is stored one row per record in
  `app_records`; single documents (`settings`, `catalog`, `settlements`, notification state) in `app_documents`.
- Changes are sent as a **batch in one transaction** ~0.3 s after you make them (so "create order + reserve stock" is
  all-or-nothing). The top bar shows *Saved / Saving… / Offline — retrying*.
- **Optimistic concurrency:** every record has a version. If two people change the same record, the second save is
  rejected, the page reloads that data and tells the user to repeat the change — nothing is silently overwritten.
- Other people's changes appear without reloading (a cheap change counter is polled every 15 s and on window focus).
- **Document numbers** (ORD-, PO-, RET-, WAR-, CLM-) come from a database sequence, so two users never get the same number.
  Each browser reserves a few ahead of time and hands unused ones back when you sign out or close the tab.
  Under heavy simultaneous use a number can occasionally be skipped, but never duplicated.
- Server access rules live in `src/server/collections.ts`. They are per collection, not per field — for example, hiding
  cost price from a role is a screen-level rule, not a database-level one.

Users, roles, sessions and the audit log are ordinary relational tables (`app_users`, `app_roles`, `app_sessions`,
`app_audit_log`). See `db/schema.sql`.

### Backups, restore and moving old browser data

- **Settings → Data → Backup** downloads every product, order, supplier, setting… as one JSON file (Super Admin). **Restore**
  replaces the database's business data with a backup. Users, roles and passwords are not part of it — use your provider's
  own backups (Neon and Aiven both provide point-in-time recovery) for a full database restore.
- If this browser still holds data from the earlier `localStorage` version, **Settings → Data** offers a one-time
  **Move this browser's old data into the database**.

## Project structure

```
src/
  app/
    (auth)/login, change-password   Public screens (no data providers mounted)
    (app)/...                       Everything behind sign-in: dashboard, products, orders, suppliers,
                                    purchase-orders, returns, warranty, reports, notifications, settings
    api/                            Route handlers: auth, load / sync / revs, counters, users, roles, audit, backup…
  proxy.ts                          Redirects visitors without a session cookie to /login
  server/                           Server-only code: db pool, auth & sessions, permissions, seed, backup
  lib/
    persist/                        Browser sync layer (hooks, manager, number pool)
    auth/                           Session context (sign-out, inactivity ping)
    settings/                       Settings stores, permissions matrix, audit feed, runtime formatting
    products|orders|suppliers|...   Domain types, utils and stores
  components/                       UI (sidebar, topbar, settings forms, cards…)
db/schema.sql                       Tables
scripts/setup-db.mjs                npm run db:setup / db:reset
```

## Deploy: GitHub + Vercel

1. Push the repo to GitHub and import it at [vercel.com/new](https://vercel.com/new) (Next.js is auto-detected).
2. Add `DATABASE_URL` (and optionally `DATABASE_CA_CERT`, `SETUP_TOKEN`, `DATABASE_POOL_MAX=3`) under
   **Settings → Environment Variables**. On Neon use the **pooled** connection string.
3. Run `npm run db:setup` once from your machine with the same `DATABASE_URL` in `.env.local`.
4. Deploy, open the site, and create the first Super Admin.

## Online store connection: public API & webhooks

The shop's website can read products and **live stock**, **place orders** (stock is reserved automatically),
and receive **signed webhooks** when an order's status or a product's stock changes.

- **Developer documentation:** [`docs/API.md`](docs/API.md) (hand this to the website developer) and [`docs/openapi.yaml`](docs/openapi.yaml).
- **Manage keys & webhooks:** sign in as Super Admin → **Settings → Integrations & API**.

### One-time setup

1. `npm run db:setup` — adds the new tables (`app_api_keys`, `app_webhooks`, `app_webhook_deliveries`). Safe to re-run; nothing is deleted.
2. Deploy as usual. Optionally set `CRON_SECRET` (any long random string) — see "Retries" below.
3. **Settings → Integrations & API → New key**, name it (e.g. *Sabsan website*), copy the key once, send it to the developer privately.
4. Give the developer: the API address shown on that page, the key, and `docs/API.md`.
5. When the developer gives you their webhook URL, **Add webhook**, tick the events, press **Send test**, and give them the signing secret.

### How it works

- Endpoints live under `/api/v1/*` (`src/app/api/v1`, logic in `src/server/publicapi`). They use API keys, not the browser login cookie.
- `POST /api/v1/orders` runs the same rules as creating an order in the dashboard (stock check, reservation, `ORD-` numbering, activity log, audit entry) inside one database transaction, and is idempotent on the site's `external_id`.
- Webhook events are produced by comparing each order/product before and after **every** save (dashboard, POS or API) in `src/app/api/sync/route.ts`, and are written to an outbox table in the same transaction. They are delivered right after the response, and failures retry after 1 min, 5 min, 30 min, 2 h, 6 h, 12 h.
- **Retries** also happen whenever the shop is busy. For a guaranteed schedule call `POST /api/v1/webhooks/dispatch` every minute with `Authorization: Bearer $CRON_SECRET` from any scheduler (cron-job.org, GitHub Actions; Vercel Cron on Pro plans).
- A key can only see and cancel the orders it created itself; cost prices and courier costs are never exposed.

## Low-stock email alerts

**Settings → Notifications → Low stock alerts → Email** now really sends mail (Code 128/EAN-13, Accounting etc. are separate sections above). Turn it on, tick which roles should get it — each person's own account email receives a message the moment a variant drops to Replenish, Critical or Out of Stock, with a direct link back into RetailPro.

- Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in the environment (see `.env.example` for how to create the App Password — it needs 2-Step Verification turned on for that Google account, not your normal Gmail password).
- Sent through Gmail's own SMTP, no third-party email service needed.
- Each stock alert is emailed **at most once** (a database check prevents duplicates even with several staff browsers open at once). A failed send (bad credentials, Gmail unreachable) is allowed to retry the next time the alert re-evaluates.
- SMS, and email for the other event types on that page (new order, return request, settlement reminder), are still just recorded preferences — nothing is sent for those yet.
- Run `npm run db:setup` once after upgrading (adds one small tracking table; safe to re-run).

## Accounting module

**Accounting** in the sidebar (Super Admin, Manager and Accounts roles; others via *Users & Roles → Accounting*).

- **Expenses** — rent, salaries, Facebook/Meta boosting, packaging, internet, transport and more (or type your own category). Mark an expense **Repeats every month** and you get a one-tap reminder when it is due.
- **All transactions** — expenses, other income, *sales money received* (COD settlement / cash takings), transfers between accounts, and owner money in/out.
- **Accounts & balances** — cash, bKash, bank with opening balances. Optional.
- **Profit & Loss** — month by month: revenue (delivered orders + POS walk-in sales), product cost, gross profit, courier cost, running expenses, other income, **net profit**. CSV export.
- **Dashboard** — new cards (Expenses, Net Profit, Biggest expense, Money in accounts) and the chart's *Net profit* now includes expenses.

Definitions: *Gross profit* = revenue − product cost · *Net profit* = gross profit − courier cost − running expenses + other income.
Transfers, owner money and "sales money received" move balances but never change profit. Run `npm run db:setup` once after upgrading (safe to re-run), and `npm run test:accounting` to run the accounting tests.

## Products module

`/products` is a full inventory-management flow, built to match a shoe-inventory spec:

- **All Products** (`/products`) — search by name/SKU/barcode, filter by category, brand,
  stock status, product status; bulk select → update stock / change category / change
  status / delete / export; CSV import & export; pagination (20/50/100).
- **Add / Edit Product** (`/products/new`, `/products/[id]/edit`) — basic info, a single
  **image URL** field (no file upload — paste a link, e.g. from Unsplash or your CDN),
  pricing (cost/selling/discount), shoe attributes (gender, type, material, colors,
  sizes), and a **Generate Variants** button that builds the full color × size matrix
  with per-variant SKU/barcode/cost/price/stock.
- **Product Details** (`/products/[id]`) — stock summary tiles, full variant table,
  Edit / Update Stock / Print Barcode / Delete actions.
- **Bulk Stock Update** (`/products/bulk-stock-update`) — search products, add them to
  a working set, then Set/Add/Remove stock across every selected variant at once.
- **Shoe Stock Matrix** — an editable color × size grid (opened via "Update Stock" on
  a product, or "Adjust Stock" from the list) for fast, whole-product stock edits.
- **Categories / Brands / Attributes** (`/products/categories`, `/brands`, `/attributes`)
  — manage the suggestion lists used across the product form and filters.

**Data storage:** products live in the database (collection `products`, one row per product
with its variants; brands/categories/sizes/colors in the `catalog` document). See
[How data is stored](#how-data-is-stored).

## Orders module

`/orders` implements the full order lifecycle spec: **Pending → Processing → In
Transit → (Delivered | Partial Delivered | Refuse Return)**, with **Cancelled**
branching off Pending/Processing only.

- **All Orders** (`/orders`) — operational counts (Pending/Processing/.../Cancelled)
  and financial totals (Total COD, Collected Amount, Courier Cost, Courier
  Profit/Loss), both reactive to a date-range filter; search by order ID/customer/
  phone/tracking; filter by status, courier company, settlement status.
- **Create Order** (`/orders/new`) — customer info, product/variant search with
  live available-stock checks, per-line discount, and a running Expected COD
  calculation (Subtotal − Discount + Delivery Charge).
- **Order Details** (`/orders/[id]`) — customer info, items, courier info, delivery
  result, return info, cancellation info (if cancelled), and a full activity
  timeline. Actions adapt to the order's current status:
  - **Pending** → Update Status opens a one-click "Mark as Processing" step, or Cancel.
  - **Processing** → Update Status opens the courier dispatch form (company,
    tracking ID, dispatch date, forward cost) → In Transit. Cancel still available.
  - **In Transit** → Update Status opens a 3-way outcome form (Delivered / Partial
    Delivered / Refuse Return), each with its own required fields. Cancel is no
    longer offered, per the spec (the parcel has already left).
  - **Partial Delivered / Refuse Return** → a "Mark Return Received" action appears
    until the parcel is physically back, at which point reserved stock releases.
- **Sidebar counts** — the Orders submenu shows a live count per status.

**Stock reservation model** (implemented in `src/lib/products/store.tsx`,
consumed by `src/lib/orders/store.tsx`): each product variant now has a
`reserved` quantity alongside `stock`. Creating an order reserves stock
(`available = stock − reserved`); Delivered permanently consumes it (`stock`
decreases); Cancelled or Return Received releases the reservation back to
available. This is exactly the Available ⇄ Reserved flow described in the spec.

**Financial formulas** (`src/lib/orders/utils.ts`) implement section 24 exactly:
Expected COD, Actual Courier Cost, Courier Net (Partial Delivered), and Courier
Loss (Refuse Return = full courier cost). Cancelled orders are excluded from all
revenue/courier aggregates but kept as historical records, per the spec's explicit
requirement that cancelled orders are never deleted.

Orders are stored in the database like everything else. Choose "Start with sample data" on
first run to get one sample order per status so every screen has something to show.

## Suppliers, Purchase Orders, Returns & Warranty

These four modules round out the inventory side of the spec, and are wired
together: delivering an order auto-creates warranties, receiving a PO adds real
stock, and returns (customer or supplier) move stock and warranty status
accordingly. All four use the same storage as Products and Orders.

- **Suppliers** (`/suppliers`) — list, add/edit, and a details page with
  Overview / Purchase Orders / Returns to Supplier tabs. Deleting a supplier
  with PO history archives it instead (per the spec's delete rule) rather than
  removing it, so past POs keep a valid reference.
- **Purchase Orders** (`/purchase-orders`) — Draft → Approved → Sent →
  (Partially Received | Received), with Cancelled available until fully
  received. **Receive Stock** (`/purchase-orders/[id]/receive`) is the GRN
  screen: enter what actually arrived per line (qty + unit cost, which can
  differ from the PO's original cost), and it's added straight to real product
  stock via the same `bulkUpdateStock` used by Products' Bulk Stock Update. A
  PO with any receiving history can only be Cancelled, never deleted.
- **Returns** (`/returns`) — Customer Returns only accept **Delivered** orders
  as a reference (validated in `src/lib/returns/store.tsx`, with a clear error
  otherwise) since nothing was actually sold on any other status. Marking a
  customer return **Received** restocks non-damaged items and leaves damaged
  ones out of sellable stock; marking a supplier return received *decreases*
  stock, since the item is leaving the business. Approving a customer return
  also voids the warranty for exactly the returned line items — not the whole
  order — via `voidWarrantiesForOrderItem`.
- **Warranty** (`/warranty`) — created automatically, one record per order
  line, whenever `markDelivered` runs in the Orders store (see
  `createWarrantiesForOrder` in `src/lib/warranty/store.tsx`): `start_date` =
  delivery time, `end_date` = +365 days, status `Active`. No warranty is
  created for Partial Delivered, Refuse Return, or Cancelled orders, matching
  the spec exactly. Claims can be filed while a warranty is Active and
  unexpired; each claim has its own status you can move through
  Submitted → Approved/Rejected → In Service → Replaced/Refunded → Closed.



## Notes

- Toggle dark/light mode with the sun/moon button in the top bar (a per-browser preference).
- All colors are CSS variables in `src/app/globals.css` (`:root` light, `.dark` dark).

## Settings module

`Settings` in the sidebar: Company / Shop, Users & Roles (custom role builder + permission matrix), Product,
Inventory, Orders, Courier & Settlement, Purchase, Returns, Warranty, Invoice / Numbering & Printing, Notifications,
Data (import / export / backup / restore), Audit Log and Security.

- Code: `src/lib/settings/*` (stores, permissions, audit), `src/components/settings/*` (shared form UI),
  `src/app/(app)/settings/*` (pages), `src/app/(app)/orders/[id]/invoice` (settings-driven printable invoice).
- Settings are one document in the database; changes are recorded in the audit log with before / after values.
- The audit log page merges server-recorded events with history rebuilt from orders, purchase orders, returns,
  warranty and settlement records.

