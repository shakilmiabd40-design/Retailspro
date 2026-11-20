import type { OrderStatus } from "@/lib/orders/types";
import { buildPhoneVariants } from "@/lib/customers/phone";
import type { LookupOrder } from "@/lib/customers/types";
import { query } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { json, route } from "@/server/http";
import { aggregateCustomerHistory, emptyCustomerLookup, mapPosHistoryRows, type PosHistoryRow } from "@/server/customers/lookup";

export const dynamic = "force-dynamic";

interface LookupRow {
  id: string;
  order_number: string | null;
  status: string | null;
  created_at: string | null;
  total: string | null;
  refusal_reason: string | null;
}

// The order query is narrow (phone index via `= any($1::text[])`); POS history uses the same exact
// variants against its collection-scoped records. All counting, ranking and summing happens in the
// pure aggregateCustomerHistory() helper.
//
// Known limitation: only the three exact variants above are matched. Orders or POS records saved with
// spaces, dashes or Bangla digits will not be found here. Deliberately no full-table fuzzy scan; an
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

/**
 * POS rows use the same compact shape as orders so the existing aggregation and warning work unchanged.
 * Delivery invoices are skipped: their linked order is already returned by LOOKUP_SQL, so counting both
 * would double-count the same sale. Void invoices and exchange returns are excluded as well.
 *
 * `pos_invoices` / `pos_returns` have no phone index; this stays collection-scoped and exact-match only.
 */
function posHistorySql(includeInvoices: boolean, includeReturns: boolean): string | null {
  const parts: string[] = [];
  if (includeInvoices) {
    parts.push(`
      select id,
        data->>'invoiceNumber' as order_number,
        'completed'::text as status,
        data->>'createdAt' as created_at,
        data->>'total' as total,
        null::text as refusal_reason
      from app_records
      where collection = 'pos_invoices'
        and data #>> '{customer,phone}' = any($1::text[])
        and data->>'status' = 'completed'
        and coalesce(data->>'saleType', '') <> 'delivery'
        and coalesce(data->>'orderId', '') = ''
    `);
  }
  if (includeReturns) {
    parts.push(`
      select id,
        data->>'returnNumber' as order_number,
        'return'::text as status,
        data->>'createdAt' as created_at,
        '0'::text as total,
        coalesce(
          nullif(btrim(data->'items'->0->>'reason'), ''),
          nullif(btrim(data->>'notes'), '')
        ) as refusal_reason
      from app_records
      where collection = 'pos_returns'
        and data->>'customerPhone' = any($1::text[])
        and coalesce(data->>'type', '') = 'return'
    `);
  }
  return parts.length ? parts.join(" union all ") : null;
}

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) return json(emptyCustomerLookup(false));

  const { valid, variants } = buildPhoneVariants(req.nextUrl.searchParams.get("phone"));
  if (!valid) return json(emptyCustomerLookup(false));

  // Read-only: the edit form passes its own order id so that order isn't shown as a duplicate.
  const excludeOrderId = req.nextUrl.searchParams.get("exclude")?.trim().slice(0, 100) || null;

  // POS data is permission-gated; orders remain visible to every role that can read this endpoint.
  const posSql = posHistorySql(
    canRead(auth.role, COLLECTION_ACCESS.pos_invoices),
    canRead(auth.role, COLLECTION_ACCESS.pos_returns),
  );
  const [{ rows: orderRows }, { rows: posRows }] = await Promise.all([
    query<LookupRow>(LOOKUP_SQL, [variants]),
    posSql ? query<PosHistoryRow>(posSql, [variants]) : Promise.resolve({ rows: [] as PosHistoryRow[] }),
  ]);

  const orders: LookupOrder[] = orderRows.map((r) => ({
    id: String(r.id),
    orderNumber: String(r.order_number ?? ""),
    status: (r.status ?? "pending") as OrderStatus,
    createdAt: String(r.created_at ?? ""),
    total: Number(r.total) || 0,
    refusalReason: r.refusal_reason,
  }));
  orders.push(...mapPosHistoryRows(posRows));

  return json(aggregateCustomerHistory(orders, excludeOrderId));
});
