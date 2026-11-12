import type { DateTypeKey } from "@/lib/reports/dates";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { loadOrderCandidates, ORDER_REPORT_DATE_TYPES } from "@/server/reports/order-candidates";

export const dynamic = "force-dynamic";

const validDay = (value: string | null): value is string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) throw new ApiError(403, "forbidden", "You do not have access to orders.");
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const dateType = sp.get("dateType") as DateTypeKey | null;
  const includeCreated = sp.get("includeCreated") === "1";
  if (!validDay(from) || !validDay(to) || from > to) throw new ApiError(400, "invalid_date_range", "Choose a valid order report date range.");
  if (!dateType || !ORDER_REPORT_DATE_TYPES.includes(dateType)) throw new ApiError(400, "invalid_date_type", "Choose a valid order report date type.");

  const orders = await loadOrderCandidates(from, to, dateType, includeCreated);
  return json({ orders });
});
