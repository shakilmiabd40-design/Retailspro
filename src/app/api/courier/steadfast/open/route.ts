import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

/** Lightweight candidate list for the missed-webhook fallback (parcels still with the courier: Processing and In Transit); full orders stay in the database. */
export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) throw new ApiError(403, "forbidden", "You do not have access to orders.");
  const { rows } = await query<{ id: string; orderNumber: string; company: string }>(
    `select id, data->>'orderNumber' as "orderNumber", data #>> '{courier,company}' as company
     from app_records where collection='orders' and data->>'status' in ('processing','in_transit')
       and coalesce(data #>> '{courier,trackingId}','') <> '' order by seq desc limit 30`,
  );
  return json({ rows });
});
