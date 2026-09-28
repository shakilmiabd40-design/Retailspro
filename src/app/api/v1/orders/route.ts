import { after } from "next/server";
import { query } from "@/server/db";
import { apiRoute, encodeCursor, ok, pageParams, parseSince, readBody } from "@/server/publicapi/http";
import { authenticateApiKey } from "@/server/publicapi/apikeys";
import { createApiOrder, normalizeBdPhone, parseCreateOrder } from "@/server/publicapi/orders";
import { toApiOrder } from "@/server/publicapi/serialize";
import { deliverDue } from "@/server/publicapi/webhooks";
import type { Order } from "@/lib/orders/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/orders — the orders THIS key created.
 *   ?status=  &external_id=  &phone=  &updated_since=  &limit=1..100  &cursor=
 */
export const GET = apiRoute(async (req) => {
  const key = await authenticateApiKey(req, "orders:read");
  const sp = req.nextUrl.searchParams;
  const { limit, cursor } = pageParams(req);
  const since = parseSince(req);

  const params: unknown[] = [key.name];
  const where = ["collection = 'orders'", "data->>'channel' = $1"];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (cursor) add("seq < ?::bigint", cursor);
  if (since) add("updated_at >= ?::timestamptz", since);
  const status = sp.get("status");
  if (status) add("data->>'status' = ?", status);
  const ext = sp.get("external_id");
  if (ext) add("data->>'externalId' = ?", ext.slice(0, 100));
  const phone = sp.get("phone");
  if (phone) add("data->>'phone' = ?", normalizeBdPhone(phone) ?? phone.slice(0, 30));

  params.push(limit + 1);
  const { rows } = await query<{ seq: string; data: Order }>(`select seq::text, data from app_records where ${where.join(" and ")} order by seq desc limit $${params.length}`, params);
  const page = rows.slice(0, limit);
  return ok(page.map((r) => toApiOrder(r.data)), { has_more: rows.length > limit, next_cursor: rows.length > limit ? encodeCursor(page[page.length - 1].seq) : null });
});

/**
 * POST /api/v1/orders — place an order (cash on delivery). Reserves stock, exactly like a staff-created order.
 * Sending the same external_id again returns the original order instead of creating a duplicate.
 */
export const POST = apiRoute(async (req) => {
  const key = await authenticateApiKey(req, "orders:write");
  const input = parseCreateOrder(await readBody(req));
  const { order, duplicate } = await createApiOrder(req, key, input);
  if (!duplicate) after(() => deliverDue().catch((e) => console.error("[webhooks] deliver failed", e)));
  return ok(toApiOrder(order), { duplicate }, { status: duplicate ? 200 : 201, headers: duplicate ? { "Idempotent-Replayed": "true" } : undefined });
});
