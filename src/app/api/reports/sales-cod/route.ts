import type { DateTypeKey, SettlementLabel } from "@/lib/reports/dates";
import { isIsoDay } from "@/lib/reports/period";
import { SALES_COD_DATE_TYPES } from "@/lib/reports/orders";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS, DOCUMENT_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { loadOrderReportData } from "@/server/reports/order-report-data";
import { buildSalesCodReport } from "@/server/reports/sales-cod";

export const dynamic = "force-dynamic";

const SETTLEMENT_LABELS: SettlementLabel[] = ["Unsettled", "Partially Settled", "Settled"];

function settlementLabel(value: string): value is SettlementLabel {
  return (SETTLEMENT_LABELS as string[]).includes(value);
}

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
  if (!dateType || !(SALES_COD_DATE_TYPES as string[]).includes(dateType)) {
    throw new ApiError(400, "invalid_date_type", "Choose a valid date type for this report.");
  }

  const courier = sp.get("courier") ?? "all";
  if (courier.length > 120) throw new ApiError(400, "invalid_courier", "Choose a valid courier company.");

  const settlementStatus = sp.get("settlementStatus") ?? "all";
  if (settlementStatus !== "all" && !settlementLabel(settlementStatus)) {
    throw new ApiError(400, "invalid_settlement_status", "Choose a valid settlement status.");
  }

  const status = sp.get("status") ?? "all";
  // Only Delivered orders are sales, so any other explicit status would return nothing.
  if (status !== "all" && status !== "delivered") {
    throw new ApiError(400, "invalid_status", "Sales & COD only includes Delivered orders.");
  }

  // The settlement ledger is role-gated. Without read access the report still works,
  // but every order reads as untracked instead of exposing payout allocations.
  const data = await loadOrderReportData(from, to, dateType as DateTypeKey, {
    includeSettlements: canRead(auth.role, DOCUMENT_ACCESS.settlements),
  });

  return json(
    buildSalesCodReport(data.orders, {
      from,
      to,
      dateType: dateType as DateTypeKey,
      receivedByOrder: data.receivedByOrder,
      settings: data.settings,
      overrides: data.overrides,
      courier,
      settlementStatus,
      status,
    }),
  );
});
