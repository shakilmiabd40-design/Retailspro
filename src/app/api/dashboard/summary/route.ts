import { query } from "@/server/db";
import { json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";

export const dynamic = "force-dynamic";

function toDate(s: string | null) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  const sp = req.nextUrl.searchParams;
  const from = toDate(sp.get("from"));
  const to = toDate(sp.get("to"));

  // Build filters
  const conditions: string[] = ["collection = 'orders'"];
  const params: unknown[] = [];
  if (from) {
    params.push(from.toISOString());
    conditions.push(`(data->>'createdAt')::timestamptz >= $${params.length}`);
  }
  if (to) {
    params.push(to.toISOString());
    conditions.push(`(data->>'createdAt')::timestamptz < $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // Aggregate orders
  const sql = `
    SELECT
      COUNT(*) FILTER (WHERE data->>'status' <> 'cancelled' AND data->>'status' <> 'refuse_return') AS net_orders,
      COUNT(*) FILTER (WHERE data->>'status' = 'delivered') AS delivered_orders,
      COUNT(*) FILTER (WHERE data->>'status' = 'cancelled') AS cancelled_orders,
      COUNT(*) FILTER (WHERE data->>'status' = 'pending') AS pending_orders,
      COUNT(*) FILTER (WHERE data->>'status' = 'processing') AS processing_orders,
      COUNT(*) FILTER (WHERE data->>'status' = 'in_transit') AS in_transit_orders,
      COALESCE(SUM((COALESCE((data->>'codAmount')::numeric, (data->>'total')::numeric, 0))) FILTER (WHERE data->>'status' = 'delivered'), 0) AS delivered_cod_total,
      COALESCE(SUM((COALESCE((data->>'total')::numeric, 0))) FILTER (WHERE data->>'status' <> 'cancelled' AND data->>'status' <> 'refuse_return'), 0) AS net_total
    FROM app_records
    ${where}
  `;

  const { rows } = await query(sql, params);
  const r = rows[0] || {};

  return json({
    from: from?.toISOString() ?? null,
    to: to?.toISOString() ?? null,
    netOrders: Number(r.net_orders || 0),
    deliveredOrders: Number(r.delivered_orders || 0),
    cancelledOrders: Number(r.cancelled_orders || 0),
    pendingOrders: Number(r.pending_orders || 0),
    processingOrders: Number(r.processing_orders || 0),
    inTransitOrders: Number(r.in_transit_orders || 0),
    deliveredCodTotal: Number(r.delivered_cod_total || 0),
    netTotal: Number(r.net_total || 0),
  });
});
