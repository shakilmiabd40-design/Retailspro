import "server-only";
import type { Order } from "@/lib/orders/types";
import type { Product } from "@/lib/products/types";
import { query } from "@/server/db";

/**
 * Narrow reads for the dashboard and the finance (P&L) read models.
 *
 * A stored order also carries its whole activity trail, the customer's address
 * and notes; a product carries its description, barcode and colour/size lists.
 * The dashboard and the P&L never look at those, so dropping them in SQL keeps
 * the transfer — and the memory the route holds while it aggregates — sized to
 * what is actually read.
 *
 * The field lists below are verified against `src/lib/dashboard.ts` and
 * `src/lib/accounting/utils.ts`; anything those files start reading must be
 * added back here.
 */

/** Never read by the dashboard or the P&L. */
export const UNUSED_ORDER_FIELDS = ["activity", "notes", "address", "altPhone", "utm"] as const;

/** Never read by the dashboard or the P&L. */
export const UNUSED_PRODUCT_FIELDS = ["description", "sku", "barcode", "colors", "sizes", "createdAt"] as const;

/** `data - 'a' - 'b'` — Postgres drops the listed keys from the JSON object. */
const minus = (fields: readonly string[]) => fields.map((field) => `'${field}'`).join(" - ");

export async function loadDashboardOrders(): Promise<Order[]> {
  const { rows } = await query<{ data: Order }>(
    `select data - ${minus(UNUSED_ORDER_FIELDS)} as data
       from app_records where collection='orders'`,
  );
  return rows.map((row) => row.data);
}

export async function loadDashboardProducts(): Promise<Product[]> {
  const { rows } = await query<{ data: Product }>(
    `select data - ${minus(UNUSED_PRODUCT_FIELDS)} as data
       from app_records where collection='products'`,
  );
  return rows.map((row) => row.data);
}
