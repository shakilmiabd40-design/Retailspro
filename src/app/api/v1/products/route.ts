import { query } from "@/server/db";
import { apiRoute, encodeCursor, ok, pageParams, parseSince } from "@/server/publicapi/http";
import { authenticateApiKey } from "@/server/publicapi/apikeys";
import { toApiProduct } from "@/server/publicapi/serialize";
import type { Product } from "@/lib/products/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/products
 *   ?status=active|inactive|all (default active)  &q=<name / sku search>  &category=  &brand=
 *   &updated_since=<ISO time>  &limit=1..100  &cursor=<from previous page>
 */
export const GET = apiRoute(async (req) => {
  await authenticateApiKey(req, "products:read");
  const sp = req.nextUrl.searchParams;
  const { limit, cursor } = pageParams(req);
  const since = parseSince(req);
  const status = sp.get("status") ?? "active";
  const q = (sp.get("q") ?? "").trim().slice(0, 100);
  const category = (sp.get("category") ?? "").trim();
  const brand = (sp.get("brand") ?? "").trim();

  const params: unknown[] = [];
  const where: string[] = ["collection = 'products'"];
  /** Adds a condition; `?` is replaced by the next $n placeholder. */
  const add = (sql: string, ...values: unknown[]) => {
    let out = sql;
    for (const v of values) {
      params.push(v);
      out = out.replace("?", `$${params.length}`);
    }
    where.push(out);
  };

  if (cursor) add("seq < ?::bigint", cursor);
  if (since) add("updated_at >= ?::timestamptz", since);
  if (status === "active" || status === "inactive") add("data->>'status' = ?", status);
  if (category) add("lower(data->>'category') = lower(?)", category);
  if (brand) add("lower(data->>'brand') = lower(?)", brand);
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    add("(data->>'name' ilike ? or data->>'sku' ilike ? or data @> jsonb_build_object('variants', jsonb_build_array(jsonb_build_object('sku', ?::text))))", like, like, q);
  }

  params.push(limit + 1);
  const { rows } = await query<{ seq: string; data: Product }>(`select seq::text, data from app_records where ${where.join(" and ")} order by seq desc limit $${params.length}`, params);
  const page = rows.slice(0, limit);
  return ok(
    page.map((r) => toApiProduct(r.data)),
    { has_more: rows.length > limit, next_cursor: rows.length > limit ? encodeCursor(page[page.length - 1].seq) : null }
  );
});
