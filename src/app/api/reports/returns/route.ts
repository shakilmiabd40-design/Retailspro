import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { loadReturnCandidates } from "@/server/reports/return-candidates";

export const dynamic = "force-dynamic";

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

  // Includes a two-day timezone margin, then the caller applies the exact
  // browser-local inclusive range. Both stored values are ISO timestamps.
  const returns = await loadReturnCandidates(from, to, type);
  return json({ returns });
});
