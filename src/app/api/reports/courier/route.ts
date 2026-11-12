import type { DateTypeKey } from "@/lib/reports/dates";
import { isIsoDay } from "@/lib/reports/period";
import { COURIER_REPORT_DATE_TYPES, COURIER_RESULT_STATUSES } from "@/lib/reports/orders";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { buildCourierReport } from "@/server/reports/courier";
import { loadOrderCandidates } from "@/server/reports/order-candidates";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) throw new ApiError(403, "forbidden", "You do not have access to orders.");

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!isIsoDay(from) || !isIsoDay(to) || from > to) {
    throw new ApiError(400, "invalid_date_range", "Choose a valid report date range.");
  }

  const dateType = sp.get("dateType");
  if (!dateType || !(COURIER_REPORT_DATE_TYPES as string[]).includes(dateType)) {
    throw new ApiError(400, "invalid_date_type", "Choose a valid date type for this report.");
  }

  const courier = sp.get("courier") ?? "all";
  if (courier.length > 120) throw new ApiError(400, "invalid_courier", "Choose a valid courier company.");

  const status = sp.get("status") ?? "all";
  if (status !== "all" && !(COURIER_RESULT_STATUSES as string[]).includes(status)) {
    throw new ApiError(400, "invalid_status", "Choose a courier result status.");
  }

  const orders = await loadOrderCandidates(from, to, dateType as DateTypeKey);
  return json(buildCourierReport(orders, { from, to, dateType: dateType as DateTypeKey, courier, status }));
});
