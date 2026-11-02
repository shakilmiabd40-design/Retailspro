import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get("page") || "1"));
  const limit = Math.min(100, Math.max(1, parseInt(sp.get("limit") || "20")));
  const offset = (page - 1) * limit;

  const status = sp.get("status");

  const conditions: string[] = ["collection = 'orders'"];
  const params: unknown[] = [];
  if (status && status !== "all") {
    params.push(status);
    conditions.push(`data->>'status' = $${params.length}`);
  }
  const where = conditions.join(" AND ");

  const countSql = `SELECT COUNT(*)::text as total FROM app_records WHERE ${where}`;
  const { rows: countRows } = await query(countSql, params);
  const total = Number(countRows[0]?.total || 0);

  params.push(limit);
  params.push(offset);
  const sql = `
    SELECT id, data, version
    FROM app_records
    WHERE ${where}
    ORDER BY seq DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows } = await query(sql, params);

  return json({
    rows,
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  });
});
