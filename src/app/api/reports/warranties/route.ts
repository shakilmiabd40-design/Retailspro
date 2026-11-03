import type { Warranty } from "@/lib/warranty/types";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

export const dynamic = "force-dynamic";
const warrantyCache = new RevisionCache<Warranty[]>(8);

const validDay = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.warranties)) throw new ApiError(403, "forbidden", "You do not have access to warranties.");
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const dateType = sp.get("dateType");
  if (!validDay(from) || !validDay(to) || from > to) throw new ApiError(400, "invalid_date_range", "Choose a valid warranty report date range.");
  if (dateType !== "warranty_start" && dateType !== "claim_submitted") throw new ApiError(400, "invalid_date_type", "Choose a valid warranty report date type.");

  const lower = new Date(`${from}T00:00:00.000Z`);
  lower.setUTCDate(lower.getUTCDate() - 1);
  const upper = new Date(`${to}T00:00:00.000Z`);
  upper.setUTCDate(upper.getUTCDate() + 2);
  const rev = await revisionKey(["warranties"]);
  const warranties = await warrantyCache.get(`${rev}|${dateType}|${from}|${to}`, async () => {
    let rows: { data: Warranty }[];
    if (dateType === "warranty_start") {
      rows = (await query<{ data: Warranty }>(
        `select data from app_records
          where collection='warranties'
            and data->>'startDate' >= $1 and data->>'startDate' < $2
          order by seq desc`,
        [lower.toISOString(), upper.toISOString()],
      )).rows;
    } else {
      rows = (await query<{ data: Warranty }>(
        `select data from app_records w
          where collection='warranties'
            and exists (
              select 1 from jsonb_array_elements(coalesce(w.data->'claims','[]'::jsonb)) c
               where c->>'submittedAt' >= $1 and c->>'submittedAt' < $2
            )
          order by seq desc`,
        [lower.toISOString(), upper.toISOString()],
      )).rows;
    }
    return rows.map((row) => row.data);
  });
  if (warranties.length > 1500) warrantyCache.delete(`${rev}|${dateType}|${from}|${to}`);
  return json({ warranties });
});
