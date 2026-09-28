import "server-only";
import type { PoolClient } from "pg";
import { SEED_PRODUCTS } from "@/lib/products/seed-data";
import { SEED_ORDERS } from "@/lib/orders/seed-data";
import { SEED_SUPPLIERS } from "@/lib/suppliers/seed-data";
import { SEED_PURCHASE_ORDERS } from "@/lib/purchase-orders/seed-data";
import { PRESET_ROLES } from "@/lib/settings/permissions";
import { COUNTER_START } from "./collections";

export async function ensurePresetRoles(client: Pick<PoolClient, "query">) {
  for (const r of PRESET_ROLES) {
    await client.query(
      `insert into app_roles (id, name, description, built_in, locked, permissions)
       values ($1,$2,$3,true,$4,$5::jsonb)
       on conflict (id) do nothing`,
      [r.id, r.name, r.description, !!r.locked, JSON.stringify(r.permissions)]
    );
  }
}

export async function bumpRev(client: Pick<PoolClient, "query">, name: string): Promise<number> {
  const { rows } = await client.query("insert into app_revs (name, rev) values ($1, 1) on conflict (name) do update set rev = app_revs.rev + 1 returning rev", [name]);
  return Number(rows[0].rev);
}

/** Inserts rows so that the first array item ends up newest (highest seq) — matching how the stores order their lists. */
export async function insertRecords(client: Pick<PoolClient, "query">, collection: string, items: { id: string }[], updatedBy: string | null) {
  for (const item of [...items].reverse()) {
    await client.query(
      `insert into app_records (collection, id, data, updated_by) values ($1,$2,$3::jsonb,$4)
       on conflict (collection, id) do update set data = excluded.data, version = app_records.version + 1, updated_at = now(), updated_by = excluded.updated_by`,
      [collection, item.id, JSON.stringify(item), updatedBy]
    );
  }
  await bumpRev(client, collection);
}

export async function setCounterAtLeast(client: Pick<PoolClient, "query">, name: string, value: number) {
  await client.query(
    `insert into app_counters (name, value) values ($1,$2)
     on conflict (name) do update set value = greatest(app_counters.value, excluded.value)`,
    [name, value]
  );
}

/** Optional demo data (the same products / orders / suppliers / POs the app used to ship with). */
export async function seedSampleData(client: Pick<PoolClient, "query">, updatedBy: string | null) {
  await insertRecords(client, "products", SEED_PRODUCTS, updatedBy);
  await insertRecords(client, "suppliers", SEED_SUPPLIERS, updatedBy);
  await insertRecords(client, "orders", SEED_ORDERS, updatedBy);
  await insertRecords(client, "purchase_orders", SEED_PURCHASE_ORDERS, updatedBy);
  for (const [name, start] of Object.entries(COUNTER_START)) await setCounterAtLeast(client, name, start);
  return { products: SEED_PRODUCTS.length, suppliers: SEED_SUPPLIERS.length, orders: SEED_ORDERS.length, purchaseOrders: SEED_PURCHASE_ORDERS.length };
}
