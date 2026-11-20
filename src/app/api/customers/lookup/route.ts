import type { OrderStatus } from "@/lib/orders/types";
import { buildPhoneVariants } from "@/lib/customers/phone";
import type { LookupOrder } from "@/lib/customers/types";
import { query } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { json, route } from "@/server/http";
import { aggregateCustomerHistory, emptyCustomerLookup } from "@/server/customers/lookup";

export const dynamic = "force-dynamic";

interface LookupRow {
  id: string;
  order_number: string | null;
  status: string | null;
  created_at: string | null;
  total: string | null;
  refusal_reason: string | null;
}

// One narrow query (phone index via `= any($1::text[])`) fetches the compact history; all counting,
// ranking and summing happens in the pure aggregateCustomerHistory() helper.
//
// Known limitation: only the three exact variants above are matched. Orders saved with spaces, dashes
// or Bangla digits in `data->>'phone'` will not be found here. Deliberately no full-table scan; an
// expression index on a normalized phone could be added later as a migration in db/migrations.
const LOOKUP_SQL = `
  with matched as (
    select id, seq, data,
      coalesce((select sum((i->>'price')::numeric * (i->>'qty')::numeric)
                from jsonb_array_elements(coalesce(data->'items', '[]'::jsonb)) i), 0)
      - coalesce((select sum((i->>'discount')::numeric)
                  from jsonb_array_elements(coalesce(data->'items', '[]'::jsonb)) i), 0)
      + coalesce((data->>'deliveryCharge')::numeric, 0) as cod
    from app_records
    where collection = 'orders' and data->>'phone' = any($1::text[])
  )
  select id,
         data->>'orderNumber' as order_number,
         data->>'status' as status,
         data->>'createdAt' as created_at,
         (case when data->'exchange' is null then cod
               else greatest(0, cod - coalesce((data #>> '{exchange,credit}')::numeric, 0))
          end)::text as total,
         data #>> '{cancellation,refusalReason}' as refusal_reason
  from matched
  order by (data->>'createdAt') desc nulls last, seq desc
`;

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) return json(emptyCustomerLookup(false));

  const { valid, variants } = buildPhoneVariants(req.nextUrl.searchParams.get("phone"));
  if (!valid) return json(emptyCustomerLookup(false));

  // Read-only: the edit form passes its own order id so that order isn't shown as a duplicate.
  const excludeOrderId = req.nextUrl.searchParams.get("exclude")?.trim().slice(0, 100) || null;

  const { rows } = await query<LookupRow>(LOOKUP_SQL, [variants]);
  const orders: LookupOrder[] = rows.map((r) => ({
    id: String(r.id),
    orderNumber: String(r.order_number ?? ""),
    status: (r.status ?? "pending") as OrderStatus,
    createdAt: String(r.created_at ?? ""),
    total: Number(r.total) || 0,
    refusalReason: r.refusal_reason,
  }));

  return json(aggregateCustomerHistory(orders, excludeOrderId));
});
