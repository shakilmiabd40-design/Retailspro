import type { ReturnRecord } from "@/lib/returns/types";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

export const dynamic = "force-dynamic";
const returnsCache = new RevisionCache<ReturnRecord[]>(8);

const validDay = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.returns)) throw new ApiError(403, "forbidden", "You do not have access to returns.");
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const type = sp.get("type");
  if (!validDay(from) || !validDay(to) || from > to) throw new ApiError(400, "invalid_date_range", "Choose a valid return report date range.");
  if (type !== "customer" && type !== "supplier") throw new ApiError(400, "invalid_type", "Choose customer or supplier returns.");

  // Include a two-day timezone margin, then let the existing client date helper apply the exact
  // browser-local inclusive range. Both stored values are ISO timestamps.
  const lower = new Date(`${from}T00:00:00.000Z`);
  lower.setUTCDate(lower.getUTCDate() - 1);
  const upper = new Date(`${to}T00:00:00.000Z`);
  upper.setUTCDate(upper.getUTCDate() + 2);
  const rev = await revisionKey(["returns"]);
  const returns = await returnsCache.get(`${rev}|${type}|${from}|${to}`, async () => {
    const { rows } = await query<{ data: ReturnRecord }>(
      `select data from app_records
        where collection='returns' and data->>'type'=$1
          and (
            ((data->>'createdAt') >= $2 and (data->>'createdAt') < $3)
            or ((data->>'returnReceivedAt') >= $2 and (data->>'returnReceivedAt') < $3)
          )
        order by seq desc`,
      [type, lower.toISOString(), upper.toISOString()],
    );
    return rows.map((row) => row.data);
  });
  if (returns.length > 1500) returnsCache.delete(`${rev}|${type}|${from}|${to}`);
  return json({ returns });
});
