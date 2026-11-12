import "server-only";
import type { PurchaseOrder } from "@/lib/purchase-orders/types";
import { query } from "@/server/db";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

/**
 * Purchase orders that *might* belong to a report period.
 *
 * The SQL window is deliberately wider than the exact report window (two days
 * before, two days after) because a purchase order carries both a calendar day
 * (`poDate`) and instants (`createdAt`, receipt dates). The caller applies the
 * exact Asia/Dhaka day comparison afterwards.
 */

const poCache = new RevisionCache<PurchaseOrder[]>(8);

function shiftedDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export async function loadPurchaseOrderCandidates(from: string, to: string): Promise<PurchaseOrder[]> {
  const lower = shiftedDay(from, -2);
  const upper = shiftedDay(to, 3);
  const rev = await revisionKey(["purchase_orders"]);
  const key = `${rev}|${from}|${to}`;
  const orders = await poCache.get(key, async () => {
    const { rows } = await query<{ data: PurchaseOrder }>(
      `select data from app_records
        where collection='purchase_orders'
          and (
            ((data->>'poDate') >= $1 and (data->>'poDate') < $2)
            or ((data->>'createdAt') >= $1 and (data->>'createdAt') < $2)
            or exists (
              select 1 from jsonb_array_elements(coalesce(data->'receivings','[]'::jsonb)) r
               where (r->>'date') >= $1 and (r->>'date') < $2
            )
          )
        order by seq desc`,
      [lower, upper],
    );
    return rows.map((row) => row.data);
  });
  if (orders.length > 2000) poCache.delete(key);
  return orders;
}

/** Supplier id → name, for the report rows. */
const supplierNameCache = new RevisionCache<Map<string, string>>(4);

export async function loadSupplierNames(): Promise<Map<string, string>> {
  const rev = await revisionKey(["suppliers"]);
  return supplierNameCache.get(rev, async () => {
    const { rows } = await query<{ id: string | null; name: string | null }>(
      `select data->>'id' as id, coalesce(data->>'name','') as name
         from app_records where collection='suppliers'`,
    );
    return new Map(rows.filter((row): row is { id: string; name: string } => !!row.id).map((row) => [row.id, row.name]));
  });
}

/** Purchase-order id → supplier id, for supplier returns that reference a purchase order. */
export async function loadPurchaseOrderSuppliers(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter((id) => id.length > 0);
  if (!unique.length) return new Map();
  const { rows } = await query<{ id: string | null; supplier_id: string | null }>(
    `select data->>'id' as id, data->>'supplierId' as supplier_id
       from app_records where collection='purchase_orders' and id = any($1::text[])`,
    [unique],
  );
  return new Map(rows.filter((row): row is { id: string; supplier_id: string } => !!row.id && !!row.supplier_id).map((row) => [row.id, row.supplier_id]));
}

/** Variant id → cost price. Only used when the caller is allowed to see cost. */
const variantCostCache = new RevisionCache<Map<string, number>>(4);

export async function loadVariantCosts(): Promise<Map<string, number>> {
  const rev = await revisionKey(["products"]);
  return variantCostCache.get(rev, async () => {
    const { rows } = await query<{ data: { variants?: { id?: string; cost?: number }[] } }>(
      `select data from app_records where collection='products'`,
    );
    const costs = new Map<string, number>();
    for (const row of rows) {
      for (const variant of row.data.variants ?? []) {
        if (variant?.id) costs.set(variant.id, Number(variant.cost) || 0);
      }
    }
    return costs;
  });
}
