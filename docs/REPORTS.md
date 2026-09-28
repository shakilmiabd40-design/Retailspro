# Reports module

Twelve reports under **Reports** in the sidebar, all built from the same live data as the rest of the app.

| Report | Route | Default date type |
| --- | --- | --- |
| Dashboard (Summary) | `/reports` | Final Status Date |
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

## Code map

| Path | Role |
| --- | --- |
| `src/lib/reports/dates.ts` | Presets, date types, filter model, Daily/Weekly/Monthly buckets |
| `src/lib/reports/orders.ts` | Per-order dates (created, delivered, dispatch, final status, return received) and filtering |
| `src/lib/reports/purchases.ts` | Purchase-order set + receiving lines for a period |
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

With **Settlement Paid Date**, only orders that received a payout in the period appear. Use **Delivered Date** to see unsettled orders.

## Purchases and suppliers

Draft and cancelled purchase orders are excluded. With **GRN date**, a PO is included if it received stock in the period and the receiving table lists only those receipts; supplier purchase value is the cost of stock received in the period. With **PO created date**, POs created in the period are included with all their receipts, and supplier purchase value is the PO total.

## Inventory reports

Both are snapshots ("as of now"). Low stock uses the notification module's monitor band (default 10 or fewer available); reorder level is the notification reorder point. Valuation is on-hand quantity × unit cost; dead stock has units on hand and no delivered sale in the last N days (default 60).
