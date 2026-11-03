import type { OrderStatus } from "@/lib/orders/types";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";

export const dynamic = "force-dynamic";

const STATUSES: OrderStatus[] = ["pending", "processing", "in_transit", "delivered", "partial_delivered", "refuse_return", "cancelled"];
const validDay = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
};

export const GET = route(async (req) => {
  await requireAuth(req, { passive: true });
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(sp.get("limit") || "20", 10) || 20));
  const offset = (page - 1) * limit;
  const status = sp.get("status");
  const from = validDay(sp.get("from"));
  const to = validDay(sp.get("to"));
  const courier = sp.get("courier")?.trim() ?? "";
  const settlement = sp.get("settlement") ?? "all";
  const search = (sp.get("search") ?? "").trim().toLowerCase().replace(/[\\%_]/g, "\\$&").slice(0, 120);

  if (status && status !== "all" && !STATUSES.includes(status as OrderStatus)) throw new ApiError(400, "invalid_status", "Invalid order status.");
  if (sp.has("from") && !from) throw new ApiError(400, "invalid_date", "Invalid start date.");
  if (sp.has("to") && !to) throw new ApiError(400, "invalid_date", "Invalid end date.");
  if (from && to && from > to) throw new ApiError(400, "invalid_date_range", "Start date must be before end date.");
  if (settlement !== "all" && settlement !== "settled" && settlement !== "pending") throw new ApiError(400, "invalid_settlement", "Invalid settlement status.");

  const conditions = ["collection = 'orders'"];
  const params: unknown[] = [];
  const add = (condition: (position: number) => string, value: unknown) => {
    params.push(value);
    conditions.push(condition(params.length));
  };
  if (status && status !== "all") add((p) => `data->>'status' = $${p}`, status);
  if (from) add((p) => `(data->>'createdAt') >= ($${p}::date)::text || 'T00:00:00.000Z'`, from);
  if (to) add((p) => `(data->>'createdAt') < (($${p}::date + 1)::text || 'T00:00:00.000Z')`, to);
  if (courier && courier !== "all") add((p) => `data #>> '{courier,company}' = $${p}`, courier);
  if (settlement !== "all") add((p) => `data #>> '{delivery,settlementStatus}' = $${p}`, settlement);
  if (search) add((p) => `(
    lower(coalesce(data->>'orderNumber','')) like $${p} escape '\\' or
    lower(coalesce(data->>'customerName','')) like $${p} escape '\\' or
    lower(coalesce(data->>'phone','')) like $${p} escape '\\' or
    lower(coalesce(data #>> '{courier,trackingId}','')) like $${p} escape '\\'
  )`, `%${search}%`);

  const where = conditions.join(" AND ");
  const countPromise = query<{ total: string }>(`SELECT COUNT(*)::text as total FROM app_records WHERE ${where}`, params);
  const rowsPromise = query<{ id: string; data: unknown; version: number }>(
    `SELECT id, data, version FROM app_records WHERE ${where} ORDER BY seq DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );

  // Keep order totals independent of the list's search/status/page filters. These formulas mirror
  // expectedCod, collectedAmount, courierProfit, and courierLoss in lib/orders/utils.ts.
  const summaryParams: unknown[] = [];
  const summaryConditions = ["collection = 'orders'"];
  if (from) { summaryParams.push(from); summaryConditions.push(`(data->>'createdAt') >= ($${summaryParams.length}::date)::text || 'T00:00:00.000Z'`); }
  if (to) { summaryParams.push(to); summaryConditions.push(`(data->>'createdAt') < (($${summaryParams.length}::date + 1)::text || 'T00:00:00.000Z')`); }
  const summaryPromise = query<Record<string, string>>(
    `WITH base AS (
       SELECT data, data->>'status' AS status,
         coalesce((SELECT sum((i->>'price')::numeric * (i->>'qty')::numeric) FROM jsonb_array_elements(coalesce(data->'items','[]'::jsonb)) i), 0)
           - coalesce((SELECT sum((i->>'discount')::numeric) FROM jsonb_array_elements(coalesce(data->'items','[]'::jsonb)) i), 0)
           + coalesce((data->>'deliveryCharge')::numeric, 0) AS expected_cod,
         coalesce((data #>> '{delivery,customerPaid}')::numeric, 0) AS customer_paid,
         coalesce((data #>> '{courier,forwardCost}')::numeric, 0)
           + coalesce((data #>> '{courier,returnCost}')::numeric, 0)
           + coalesce((data #>> '{courier,otherCost}')::numeric, 0) AS courier_cost
       FROM app_records WHERE ${summaryConditions.join(" AND ")}
     )
     SELECT count(*)::text AS total,
       count(*) FILTER (WHERE status='pending')::text AS pending,
       count(*) FILTER (WHERE status='processing')::text AS processing,
       count(*) FILTER (WHERE status='in_transit')::text AS in_transit,
       count(*) FILTER (WHERE status='delivered')::text AS delivered,
       count(*) FILTER (WHERE status='partial_delivered')::text AS partial_delivered,
       count(*) FILTER (WHERE status='refuse_return')::text AS refuse_return,
       count(*) FILTER (WHERE status='cancelled')::text AS cancelled,
       coalesce(sum(expected_cod) FILTER (WHERE status <> 'cancelled'),0)::text AS total_cod,
       coalesce(sum(CASE WHEN status='delivered' THEN coalesce(nullif(customer_paid,0),expected_cod) WHEN status='partial_delivered' THEN customer_paid ELSE 0 END),0)::text AS collected,
       coalesce(sum(courier_cost) FILTER (WHERE status <> 'cancelled'),0)::text AS courier_cost,
       coalesce(sum(CASE WHEN status='partial_delivered' THEN greatest(0,customer_paid-courier_cost) ELSE 0 END),0)::text AS courier_profit,
       coalesce(sum(CASE WHEN status='refuse_return' THEN courier_cost WHEN status='partial_delivered' THEN greatest(0,courier_cost-customer_paid) ELSE 0 END),0)::text AS courier_loss
     FROM base`,
    summaryParams,
  );

  const [{ rows: countRows }, { rows }, { rows: summaryRows }] = await Promise.all([countPromise, rowsPromise, summaryPromise]);
  const total = Number(countRows[0]?.total || 0);
  const summary = Object.fromEntries(Object.entries(summaryRows[0] ?? {}).map(([key, value]) => [key, Number(value)]));
  return json({ rows, total, page, limit, pages: Math.ceil(total / limit), summary });
});
