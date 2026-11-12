import type { DateTypeKey } from "@/lib/reports/dates";
import { isIsoDay } from "@/lib/reports/period";
import { ORDER_STATUS_DATE_TYPES } from "@/lib/reports/orders";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { loadOrderCandidates } from "@/server/reports/order-candidates";
import { buildOrderStatusReport } from "@/server/reports/order-status";

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
  if (!dateType || !(ORDER_STATUS_DATE_TYPES as string[]).includes(dateType)) {
    throw new ApiError(400, "invalid_date_type", "Choose a valid date type for this report.");
  }

  const courier = sp.get("courier") ?? "all";
  if (courier.length > 120) throw new ApiError(400, "invalid_courier", "Choose a valid courier company.");

  const orders = await loadOrderCandidates(from, to, dateType as DateTypeKey);

  // Every status is returned: the page filters the table by status but keeps the
  // distribution and the trend on the full set.
  return json(buildOrderStatusReport(orders, { from, to, dateType: dateType as DateTypeKey, courier }));
});
