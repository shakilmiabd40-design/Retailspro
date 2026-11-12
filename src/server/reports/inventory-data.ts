import "server-only";
import type { NotificationSettings, NotificationsData, TrackedState } from "@/lib/notifications/types";
import { DEFAULT_SETTINGS, clampSettings } from "@/lib/notifications/engine";
import type { PurchaseOrder } from "@/lib/purchase-orders/types";
import { query } from "@/server/db";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

/**
 * Narrow reads for the inventory snapshot reports.
 *
 * Only the fields the reports need are selected, so a report never pulls the
 * whole catalog (descriptions, images, selling prices…) into the browser.
 */

export interface StockVariant {
  id: string;
  sku: string;
  color: string;
  size: string;
  stock: number;
  reserved: number;
  status: string;
  /** Only read when the caller may see cost prices. */
  cost: number;
}

export interface StockProduct {
  id: string;
  name: string;
  brand: string;
  category: string;
  status: string;
  shoeType?: string;
  material?: string;
  variants: StockVariant[];
}

const productCache = new RevisionCache<StockProduct[]>(4);

export async function loadStockProducts(withCost: boolean): Promise<StockProduct[]> {
  const rev = await revisionKey(["products"]);
  return productCache.get(`${rev}|cost:${withCost ? 1 : 0}`, async () => {
    const { rows } = await query<{ data: { id?: string; name?: string; brand?: string; category?: string; status?: string; shoeType?: string; material?: string; variants?: { id?: string; sku?: string; color?: string; size?: string; stock?: number; reserved?: number; status?: string; cost?: number }[] } }>(
      `select data from app_records where collection='products'`,
    );
    return rows.map((row) => {
      const data = row.data;
      return {
        id: String(data.id ?? ""),
        name: String(data.name ?? ""),
        brand: String(data.brand ?? ""),
        category: String(data.category ?? ""),
        status: String(data.status ?? "active"),
        shoeType: data.shoeType,
        material: data.material,
        variants: (data.variants ?? []).map((variant) => ({
          id: String(variant.id ?? ""),
          sku: String(variant.sku ?? ""),
          color: String(variant.color ?? ""),
          size: String(variant.size ?? ""),
          stock: Number(variant.stock) || 0,
          reserved: Number(variant.reserved) || 0,
          status: String(variant.status ?? "active"),
          cost: withCost ? Number(variant.cost) || 0 : 0,
        })),
      };
    });
  });
}

/** Purchase orders that are still open, reduced to what the stock board needs. */
const openPoCache = new RevisionCache<PurchaseOrder[]>(4);

export async function loadOpenPurchaseOrders(): Promise<PurchaseOrder[]> {
  const rev = await revisionKey(["purchase_orders"]);
  return openPoCache.get(rev, async () => {
    const { rows } = await query<{ data: PurchaseOrder }>(
      `select data from app_records where collection='purchase_orders' and coalesce(data->>'status','') <> 'cancelled'`,
    );
    return rows.map((row) => row.data);
  });
}

/** Notification thresholds and the tracked state per variant (the alert column). */
export interface NotificationState {
  settings: NotificationSettings;
  states: Record<string, TrackedState>;
}

const notificationCache = new RevisionCache<NotificationState>(4);

export async function loadNotificationState(): Promise<NotificationState> {
  const rev = await revisionKey(["notifications_settings", "notifications_data"]);
  return notificationCache.get(rev, async () => {
    const { rows } = await query<{ key: string; data: unknown }>(
      "select key, data from app_documents where key in ('notifications_settings','notifications_data')",
    );
    const settingsDoc = rows.find((row) => row.key === "notifications_settings")?.data as Partial<NotificationSettings> | undefined;
    const dataDoc = rows.find((row) => row.key === "notifications_data")?.data as Partial<NotificationsData> | undefined;
    return {
      settings: clampSettings({ ...DEFAULT_SETTINGS, ...(settingsDoc ?? {}) }),
      states: dataDoc?.states ?? {},
    };
  });
}

/** The last day a variant was sold, per the Asia/Dhaka business day. */
const lastSoldCache = new RevisionCache<Map<string, string>>(4);

export async function loadLastSoldDays(): Promise<Map<string, string>> {
  const rev = await revisionKey(["orders"]);
  return lastSoldCache.get(rev, async () => {
    const { rows } = await query<{ variant_id: string | null; day: string | null }>(
      `with delivered as (
         select i->>'variantId' as variant_id,
           coalesce(
             nullif(data #>> '{delivery,deliveryDate}',''),
             (select a.value->>'at'
                from jsonb_array_elements(coalesce(data->'activity','[]'::jsonb)) with ordinality as a(value, ord)
               where a.value->>'label'='Marked Delivered'
               order by a.ord desc limit 1),
             (select a.value->>'at'
                from jsonb_array_elements(coalesce(data->'activity','[]'::jsonb)) with ordinality as a(value, ord)
               where a.value->>'label'='Edited by Super Admin'
                 and coalesce(a.value->>'detail','') like '%→ Delivered%'
               order by a.ord desc limit 1),
             data->>'updatedAt'
           ) as sold_at
         from app_records
         cross join lateral jsonb_array_elements(coalesce(data->'items','[]'::jsonb)) i
         where collection='orders' and data->>'status'='delivered' and i->>'variantId' is not null
       ), normalized as (
         select variant_id,
           case
             when sold_at ~ '^\\d{4}-\\d{2}-\\d{2}$' then (sold_at::date::timestamp at time zone 'Asia/Dhaka')
             when sold_at ~ '^\\d{4}-\\d{2}-\\d{2}T' then sold_at::timestamptz
             else null
           end as sold_at
         from delivered
       )
       select variant_id,
         to_char(max(sold_at) at time zone 'Asia/Dhaka', 'YYYY-MM-DD') as day
       from normalized where sold_at is not null group by variant_id`,
    );
    return new Map(rows.filter((row): row is { variant_id: string; day: string } => !!row.variant_id && !!row.day).map((row) => [row.variant_id, row.day]));
  });
}
