import type { JournalEntry, JournalStatus } from "@/lib/accounting/gl-types";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { requireAuth } from "@/server/auth";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";

export const dynamic = "force-dynamic";
const STATUSES: JournalStatus[] = ["draft", "posted", "reversed"];

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.journal_entries)) throw new ApiError(403, "forbidden", "You do not have access to accounting reports.");
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number.parseInt(sp.get("page") || "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(sp.get("limit") || "25", 10) || 25));
  const status = sp.get("status") || "all";
  if (status !== "all" && !STATUSES.includes(status as JournalStatus)) throw new ApiError(400, "invalid_status", "Invalid journal status.");

  const params: unknown[] = [];
  const where = ["collection='journal_entries'"];
  if (status !== "all") { params.push(status); where.push(`data->>'status'=$${params.length}`); }
  const whereSql = where.join(" AND ");
  const [{ rows: counts }, { rows }] = await Promise.all([
    query<{ total: string }>(`select count(*)::text as total from app_records where ${whereSql}`, params),
    query<{ id: string; data: JournalEntry; version: number }>(
      `select id,data,version from app_records where ${whereSql} order by data->>'date' desc, data->>'createdAt' desc, seq desc limit $${params.length + 1} offset $${params.length + 2}`,
      [...params, limit, (page - 1) * limit],
    ),
  ]);
  const total = Number(counts[0]?.total ?? 0);
  return json({ rows, total, page, limit, pages: Math.ceil(total / limit) });
});
