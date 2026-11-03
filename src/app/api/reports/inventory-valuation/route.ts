import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

export const dynamic = "force-dynamic";
type LastSoldLine = { variantId: string; date: string };
const salesCache = new RevisionCache<LastSoldLine[]>(4);

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) throw new ApiError(403, "forbidden", "You do not have access to order data for this report.");
  const timeZone = req.nextUrl.searchParams.get("timeZone") || "UTC";
  try { new Intl.DateTimeFormat("en", { timeZone }).format(0); }
  catch { throw new ApiError(400, "invalid_timezone", "Choose a valid time zone."); }
  const revision = await revisionKey(["orders"]);
  const sales = await salesCache.get(`${revision}|${timeZone}`, async () => {
    const { rows } = await query<LastSoldLine>(
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
             when sold_at ~ '^\\d{4}-\\d{2}-\\d{2}$' then (sold_at::date::timestamp at time zone $1)
             when sold_at ~ '^\\d{4}-\\d{2}-\\d{2}T' then sold_at::timestamptz
             else null
           end as sold_at
         from delivered
       )
       select variant_id as "variantId",
         to_char(max(sold_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as date
       from normalized where sold_at is not null group by variant_id`,
      [timeZone],
    );
    return rows.filter((row) => !!row.variantId && !!row.date);
  });
  return json({ sales });
});
