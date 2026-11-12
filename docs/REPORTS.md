# Reports module

Twelve reports under **Reports** in the sidebar, all built from the same live data as the rest of the app.

| Report | Route | Default date type |
| --- | --- | --- |
| Owner Dashboard (R1) | `/reports` | Delivered Date |
| **Profit & Loss** | `/reports/profit-loss` | Delivered Date |
| **Report Builder** | `/reports/query` | — |
| Sales by Channel (R2) | `/reports/channels` | Delivered Date |
| Sync Health (R12) | `/reports/sync-health` | Live queue |
| Sales & COD | `/reports/sales-cod` | Delivered Date |
| Courier Cost & Profit/Loss | `/reports/courier` | Final Status Date |
| Settlement Report | `/reports/settlement` | Settlement Paid Date |
| Order Status | `/reports/order-status` | Order Created Date |
| Product Sales | `/reports/product-sales` | Delivered Date |
| Inventory Stock (snapshot) | `/reports/inventory-stock` | none |
| Inventory Valuation (snapshot) | `/reports/inventory-valuation` | none |
| Purchase Report | `/reports/purchases` | Stock Received (GRN) Date |
| Supplier Report | `/reports/suppliers` | Stock Received (GRN) Date |
| Returns Report | `/reports/returns` | Return Received Date |
| Warranty Report | `/reports/warranty` | Warranty Start Date (Claims tab: Claim Submitted Date) |

## Owner dashboard, channels and sync health (Phase 1)

These read live PostgreSQL through `src/server/reports/daily-summary.ts`; they do not write to `app_report_daily_summary`.
That rollup table is reserved for a later materialisation step.

### Business day

Every report day is a fixed **Asia/Dhaka** calendar day, independent of the browser or database session timezone.
A stored `YYYY-MM-DD` value is already a calendar day and is never shifted. A full timestamp is an instant and is
converted to Asia/Dhaka before its date is taken. Range bounds are inclusive on both ends.

### Revenue and profit

- **Realized revenue** = delivered online orders + completed POS walk-in sales.
  - Online delivered: `product subtotal − discounts + delivery charge − (forward + return + other courier cost)`.
    This is the existing `salesRevenue()` definition.
  - Shop walk-in: `POS invoice total − POS return creditValue`. POS **delivery** invoices are excluded because the
    resulting order is counted once when it is delivered.
- **Product cost** is the variant cost stored on the product (or the line cost snapshot for POS), multiplied by quantity.
- **Gross profit** = realized revenue − product cost.
- **Net operating profit** = gross profit + partial-delivery courier net − refused-parcel courier cost − COD fees − ad spend.
  Refused and partial parcels have no delivered revenue, so their courier result is added as a separate cost/profit line.
- **Expected revenue / profit** is the currently open pipeline (pending, processing, in transit), not a realized figure.

### Channel attribution

- Explicit `source` values `website`, `facebook`, `instagram` and `shop` are used as-is.
- Legacy `source: "pos"` maps to `shop`; legacy `source: "api"` maps to `website`.
- An order with no `source` but an API `channel` (the API key name) came through the online store and maps to `website`.
- Older orders with neither a source nor a channel are reported separately as **unattributed**; they are never guessed
  into a website total.

### Ad spend

Ad spend is entered per day, platform, campaign, ad set and ad, or imported from CSV. It is a period-level cost: it is
deducted once from the KPI totals and the daily profit trend, never split per channel row. The Facebook and Instagram
filters include combined `meta` rows so spend is not understated. Shop and unattributed views do not consume online ad
spend. Ad spend is stored in `app_ad_spend`; writes require Accounting create/edit permission.

### COD pending and ageing

COD pending is derived from the settlement ledger, not only from each order's legacy `delivery.settlementStatus` flag.
Per delivered or partial order, expected COD follows the saved settlement policy (COD charge %, risk-management %,
courier costs, manual overrides). Recorded payout allocations reduce the outstanding amount. The KPI splits the
remainder into **0–7**, **8–14** and **15+** day buckets. A legacy order marked settled with no allocation is treated as
paid instead of outstanding forever. The figure follows the selected channel filter.

### Sync health (R12)

`app_sync_failures` records website order ingestion failures with the external order id, source, API key id/name,
payload, error and retry count. There is at most one **pending** row per `(external_id, source)`; repeated deliveries
update that row instead of flooding the queue. Retry reuses the original API key identity so the created order keeps
its channel and the storefront's own `external_id` retries still resolve to the same order. Success marks the row
resolved and is audited; failure increments the retry count and updates the error. The page also shows today's
successful website orders and today's failure count.


## Sales & COD and courier profit/loss (Phase 2)

These two screens read compact rows from dedicated, permission-checked endpoints:
`GET /api/reports/sales-cod` and `GET /api/reports/courier`. Both require an authenticated session and read
access to the Orders collection. They share the broad candidate query in
`src/server/reports/order-candidates.ts` and the Asia/Dhaka day resolver in
`src/server/reports/order-days.ts`; the browser only renders the rows and derives the chart trend from each
row's `reportDay`. Filter changes (date range, date type, status, courier, settlement status) re-query the
endpoint instead of loading the full order collection into the browser.

- Report days use the same fixed **Asia/Dhaka** calendar-day rule as Phase 1. Date-only fields
  (`deliveryDate`, `dispatchDate`) keep their stored day; timestamps (`createdAt`, activity entries) are
  converted to Asia/Dhaka. A timestamp near midnight therefore cannot land on a different day on a
  different machine.
- **Sales & COD** includes Delivered orders only. Net revenue is still `salesRevenue()`; Product Sales,
  Gross Revenue, Expected COD, Collected Amount, Delivery Charge and Courier Cost keep the formulas from
  `src/lib/orders/utils.ts`. Settlement status comes from the saved settlement policy and payout ledger.
  A role that cannot read the settlement ledger still gets the sales figures, but no allocation data.
- **Courier Cost & Profit/Loss** includes Delivered, Partial Delivered and Refuse Return. Delivered adds
  courier cost only; Partial adds customer paid − courier cost as profit/loss; Refuse adds the full
  courier cost as a loss. Cancelled orders never appear.

The **Settlement Report** stays client-side for now. It is a transactional ledger screen: it needs the
complete order set to allocate a payout across orders and it writes through `/api/sync`. Serverising it
would require a server-side settlement reconciliation step in addition to the read model. Its per-order
position is still mirrored by `src/server/reports/settlement-summary.ts` for the two server reports above.


## Order Status and Product Sales (Phase 3)

Both screens read compact rows from dedicated, permission-checked endpoints:
`GET /api/reports/order-status` and `GET /api/reports/product-sales`. They require an authenticated
session and read access to Orders (Product Sales also checks Returns and Products). The browser renders
the rows and derives the charts from each row's `reportDay`; it no longer downloads whole order records
or the product catalog for these two screens.

- Report days use the same fixed **Asia/Dhaka** calendar-day rule as Phases 1 and 2. Before Phase 3 these
  two screens filtered on the browser's own local day; they now use the shop's business day like every
  other server-backed report.
- **Order Status** returns every order in the date range, courier filter included. The status filter stays
  in the browser and applies to the table only, so the status distribution and the status trend keep
  showing the whole mix — exactly like before.
- **Product Sales** counts Delivered orders only. Revenue per variant is the line total after the line
  discount (`price × qty − discount`). Returned quantity comes from customer returns that were physically
  received inside the period; supplier returns are left out. Category and brand come from a narrow server
  read of the product catalog (id, category, brand) instead of the whole catalog.


## Purchase, supplier and inventory reports (Phase 4)

`GET /api/reports/purchases`, `GET /api/reports/suppliers`, `GET /api/reports/inventory-stock` and
`GET /api/reports/inventory-valuation` return compact rows and KPIs. They require an authenticated
session plus read access to purchase orders and suppliers (returns for the supplier report, products for
the inventory reports). The browser renders the rows; it no longer downloads whole purchase orders,
returns or product records for these screens.

- **Purchase Report** keeps the existing rules: draft and cancelled purchase orders are excluded, the
  product filters narrow the lines, and shipping and discount are only added when no product filter is on.
  With **GRN date** only receipts inside the period are listed; with **PO created date** every receipt
  against a purchase order created in the period is listed.
- **Supplier Report** values a supplier's purchases the same way (stock received in the period in GRN
  mode, the purchase-order total otherwise) and adds supplier returns received in the period, valued at
  the product cost of the returned variant. **A role without the products *financial* permission sees a
  return value of 0**, because product cost prices are stripped for them — the same rule the sync API
  applies.
- **Inventory Stock** is a snapshot: available = on hand − reserved, the low-stock band comes from the
  notification settings (reorder point × monitor multiplier) and the alert column comes from the tracked
  notification state.
- **Inventory Valuation** is a snapshot too: value = on-hand quantity × unit cost. **Unit cost and the
  value columns are only sent to roles that may see product cost prices**; other roles get quantities and
  dead-stock flags without any money figures. Dead stock means units on hand and no delivered sale in the
  last N days (default 60), measured in Asia/Dhaka business days.


## Profit & Loss, layouts and the report builder (Phase 6)

Three new screens in the Reports area.

### `Reports → Profit & Loss` — one profit number

The app used to show **two different profit numbers**: the Owner Dashboard (orders + POS +
ad spend, before fixed overheads) and the Accounting P&L (posted journal entries). They disagreed
because **ad spend and COD service fees never become journal entries**, while rent and salaries
only ever reached the ledger.

The new report is built on the **books** (posted journal entries and the chart of accounts) and adds
the two missing real costs as their own lines:

| Line | Source |
| --- | --- |
| **Sales** | booked in the ledger: product sales plus the delivery charge billed, less discounts and returns |
| Cost of goods sold | posted journal entries (FIFO cost) |
| **Gross profit** | Sales − cost of goods sold |
| Courier & delivery expense | posted journal entries |
| **COD service fees** | the courier charge on delivered orders — *not in the ledger* |
| **Ad spend** | `app_ad_spend` — *not in the ledger* |
| Operating expenses | posted journal entries (rent, salaries…) |
| Other expenses | posted journal entries |
| Other income | posted journal entries |
| **Net profit**, Net margin | calculated |

Nothing in the ledger changes: no journal entry is written, so the balance sheet and the trial
balance are untouched. The report simply shows the two costs the books cannot see, and says so
under **Not in the ledger**. `npm run check:profit` prints the gap between the two views;
`npm run check:profit-loss` prints the statement and proves it adds up.

A role without the products *financial* permission (or accounting access) sees the sales side but
not the cost, the profit or the money behind them — the same rule the Owner Dashboard uses.

The **Accounting → Profit & Loss** screen reads the *same* engine (it passes its own periods), so the
two screens can never disagree. The Accounting screen keeps its month columns (3 / 6 / 12 months or a
custom range) and the CSV export.

The **dashboard's money cards** (Expenses, Net Profit, Biggest expense, Money in accounts) read the same
posted ledger, so they agree with the Accounting screens too. They used to read the old `ledger`
collection, which the accounting module no longer writes to — every expense showed as zero and the
dashboard reported a profit that ignored rent and salaries. The cards now carry a reconciliation line
(revenue − cost − expenses = net profit).

> **Naming:** the ledger's top line is **Sales**. The dashboard's trading card is **Net revenue**
> (delivered orders, after courier costs) and shows the ledger's Sales next to it, so the two are
> never confused. The Owner Dashboard (R1) keeps its own management labels — *Realized revenue* and
> *Net operating profit* — because they deliberately stop before rent and salaries.

### Recording expenses

`Accounting → Expenses` is the screen for the running costs — rent, salaries, marketing, packaging.
It reads the **expense lines of the posted journal entries**, so what you see there is exactly what the
Profit & Loss, the dashboard and the trial balance use (courier and delivery included; cost of goods
sold is not, because it is posted from the sales themselves).

**Add expense** writes a balanced journal entry — the expense account is debited and cash (or a
receivable) is credited — so the amount reaches every profit figure at once. A role without approval
rights saves it as a draft; it counts once someone posts it.

The old cash-ledger list is still at `Accounting → All transactions` (`/accounting/ledger`) for the
repeating-entry reminders. It is legacy: **it does not change the profit figures.**

### Customising it (the "row definition × column definition" idea)

Like the account schedules in the big ERPs, the report is a **layout**, not a fixed screen:

- **Columns** — the periods to compare: Current period, Previous period (the same number of days,
  ending the day before), Year to date, Same period last year.
- **Rows** — toggle the lines on and off and reorder them.
- **Breakdown** — slice the revenue by **channel**, **campaign**, **product category** or **courier**.

Layouts are saved as named presets in the `report_presets` document (no new table, no migration) and
are shared by everyone. A layout changes what the report *shows* — never what it counts.

### `Reports → Report Builder` — ask your own question

The ad-hoc builder, like the pivot and analysis views in modern ERPs. Pick a dataset (Orders,
Products, Purchase orders, Returns), what to group by and what to total, plus a date range and the
filters that dataset understands.

Every dataset, field, dimension and measure is a **fixed, named entry** and every value travels as a
query parameter — the builder never runs a query you wrote. `npm run check:query` runs every dataset
with every dimension and measure against the live database so a broken expression shows up there
rather than in the browser.

## Returns and warranty (Phase 5)

`GET /api/reports/returns` and `GET /api/reports/warranties` keep returning the raw records they always
returned, but the pages now load them through the shared report hook (`src/lib/reports/use-report.ts`)
instead of a hand-rolled fetch inside an effect. Both still apply the browser-local inclusive date filter
in the page, so their totals and boundaries are unchanged.

The **Settlement Report** stays client-side: it needs the complete order set to allocate a payout across
orders and it writes through `/api/sync`.


## Code map

| Path | Role |
| --- | --- |
| `src/lib/reports/dates.ts` | Presets, date types, filter model, Daily/Weekly/Monthly buckets |
| `src/lib/reports/orders.ts` | Per-order dates (created, delivered, dispatch, final status, return received) and filtering |
| `src/lib/reports/period.ts` | Previous-period comparison helper |
| `src/lib/reports/types.ts` | Shared report row/KPI types for server and client |
| `src/server/reports/daily-summary.ts` | R1/R2 live aggregation, channel attribution, ad spend, pipeline and COD |
| `src/server/reports/business-day.ts` | Fixed Asia/Dhaka calendar-day helpers |
| `src/server/reports/order-candidates.ts` | Broad, index-friendly candidate order query for order-level reports |
| `src/server/reports/order-days.ts` | Per-order Asia/Dhaka report days (mirrors `orderDateFor`) |
| `src/server/reports/order-report-data.ts` | Loads candidates plus settings/settlement documents for a report request |
| `src/server/reports/sales-cod.ts` | Sales & COD rows and KPIs |
| `src/server/reports/courier.ts` | Courier Cost & Profit/Loss rows and KPIs |
| `src/server/reports/order-status.ts` | Order Status rows (every status in the range) |
| `src/server/reports/product-sales.ts` | Product Sales variant rows and KPIs |
| `src/server/reports/product-meta.ts` | Narrow product read (id, category, brand) for report filters |
| `src/server/reports/return-candidates.ts` | Date-bounded return candidates for report screens |
| `src/server/reports/purchases.ts` | Purchase order rows, receiving lines and KPIs |
| `src/server/reports/suppliers.ts` | Supplier purchase and return rows and KPIs |
| `src/server/reports/purchase-candidates.ts` | Purchase order candidates, supplier names, variant costs |
| `src/server/reports/inventory.ts` | Inventory stock and valuation rows and KPIs |
| `src/server/reports/inventory-data.ts` | Narrow product, purchase-order, notification and last-sold reads |
| `src/lib/reports/profit-loss.ts` | The Profit & Loss statement: lines, columns, layouts (pure) |
| `src/server/reports/profit-loss.ts` | Loads the ledger, ad spend and COD fees for the statement |
| `src/server/reports/profit-loss-presets.ts` | Saved layouts in the `report_presets` document |
| `src/lib/reports/query-builder.ts` | Report builder catalogue: datasets, fields, dimensions, measures |
| `src/server/reports/query-builder.ts` | Runs a builder request (fixed SQL, parameterised values) |
| `src/server/reports/settlement-summary.ts` | Saved-policy settlement position used by server reports |
| `src/server/reports/cod.ts` | COD pending/ageing maths against the settlement ledger |
| `src/lib/reports/use-report.ts` | Client hook for the server-backed report endpoints |
| `src/lib/reports/aggregate.ts` | `trendBuckets()` for charts |
| `src/lib/reports/export.ts` | CSV and a dependency-light `.xlsx` writer |
| `src/lib/settlements/` | Courier payout ledger, per-order settlement maths, store |
| `src/components/reports/` | Filter bar, export-capable table, KPI tiles, charts, settlement modals |

## Global filter bar

Presets (Today … Last Month), From/To, Date type, and only the filters that make sense for that report (status, courier, supplier, category/brand/product/SKU, settlement status), Group by, then **Apply**, **Reset**, **Print**. Presets apply immediately; other edits wait for **Apply**.

Every table has its own **Export** (CSV or Excel, all filtered rows or the current page) and a **Columns** chooser. Exports contain only the visible columns. Text that starts with `= + - @` is prefixed with `'` so a spreadsheet can't run it as a formula.

## Consistency rules

- **Delivered** → counts as sales.
- **Cancelled** → no sales, courier cost 0, no settlement.
- **Refuse Return** → no sales; the whole courier cost is a loss; settlement expected 0.
- **Partial Delivered** → no sales; courier profit or loss = customer paid − courier cost; settlement expected = customer paid − courier cost.

## Date types

`orderDateFor()` maps a date type to a date for each order:

- **Delivered Date**: `delivery.deliveryDate`, else the "Marked Delivered" log entry.
- **Final Status Date**: Delivered date; for Partial and Refuse, the time of the status change from the order's activity log (they don't store a separate date); for Cancelled, the cancel time.
- **Dispatch Date**: `courier.dispatchDate`, else the "Dispatched via…" log entry.
- **Return Received Date**: `returnInfo.returnDate`.

## Settlement tracking

Per order (computed, in `src/lib/settlements/compute.ts`):

- **Expected**: Delivered → collected − courier cost; Partial → customer paid − courier cost; never below 0. Editable per order (pencil on the Settlement report), with a note.
- **Received**: sum of payout allocations to the order.
- **Status**: Unsettled (received 0), Partially Settled (0 < received < expected), Settled (received ≥ expected).
- **Last paid date**: latest payout date allocated to the order.

**Record payout** (Settlement report) takes courier, paid amount, paid date and a reference, then allocates the amount to that courier's orders (oldest first with one click). Payouts can be deleted; the allocations are taken back.

Orders that were marked "settled" on the order itself before the ledger existed count as Settled (marked with `*`) until a payout is recorded against them. The order's own Settled/Pending flag (used by the Orders list filter) is kept in step with the ledger. New deliveries now default to **Pending** in the status dialog, since payouts arrive later.

A Partial Delivered order the courier owes nothing for (the customer paid less than the courier's charges) has an Expected of ৳0 and is not tracked at all — the Orders list shows it as **Nothing due**, and **Mark as Settled** closes it on the order itself instead of recording a payout. Marking such an order settled by hand (Edit Order → Settlement Status) also counts as Settled, with or without an expected amount. A Partial Delivered order is never settled for its full COD: only what the customer actually paid is ever recorded as received.

With **Settlement Paid Date**, only orders that received a payout in the period appear. Use **Delivered Date** to see unsettled orders.

## Purchases and suppliers

Draft and cancelled purchase orders are excluded. With **GRN date**, a PO is included if it received stock in the period and the receiving table lists only those receipts; supplier purchase value is the cost of stock received in the period. With **PO created date**, POs created in the period are included with all their receipts, and supplier purchase value is the PO total.

## Inventory reports

Both are snapshots ("as of now"). Low stock uses the notification module's monitor band (default 10 or fewer available); reorder level is the notification reorder point. Valuation is on-hand quantity × unit cost; dead stock has units on hand and no delivered sale in the last N days (default 60).
