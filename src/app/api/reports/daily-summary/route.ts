import { requireAuth, roleHas } from "@/server/auth";
import { ApiError, json, route } from "@/server/http";
import { isIsoDay } from "@/lib/reports/period";
import { isReportChannel, type ReportBundle } from "@/lib/reports/types";
import { getReportBundle } from "@/server/reports/daily-summary";

export const dynamic = "force-dynamic";

/** Copy only what is safe to return; never mutate the cached bundle in place. */
function redactCosts(bundle: ReportBundle): ReportBundle {
  return {
    rows: bundle.rows.map((row) => ({
      ...row,
      productCost: 0,
      adSpend: 0,
      grossProfit: 0,
      netProfit: 0,
      partialCourierNet: 0,
      refusedCourierCost: 0,
    })),
    kpis: {
      ...bundle.kpis,
      grossProfit: 0,
      prevGrossProfit: 0,
      netProfit: 0,
      prevNetProfit: 0,
      adSpend: 0,
      prevAdSpend: 0,
      expectedProfit: 0,
      channelBreakdown: bundle.kpis.channelBreakdown.map((channel) => ({
        ...channel,
        productCost: 0,
        grossProfit: 0,
        marginPct: 0,
      })),
      dailyTrends: bundle.kpis.dailyTrends.map((day) => ({
        ...day,
        grossProfit: 0,
        netProfit: 0,
        adSpend: 0,
      })),
    },
  };
}

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  const canViewReports = auth.role.locked || roleHas(auth.role, "reports", "view");
  if (!canViewReports) {
    throw new ApiError(403, "forbidden", "You do not have access to reports.");
  }

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const channel = sp.get("channel") || "all";

  if (!isIsoDay(from) || !isIsoDay(to)) {
    throw new ApiError(400, "invalid_date_range", "Provide valid from and to dates (YYYY-MM-DD).");
  }
  if (from > to) {
    throw new ApiError(400, "invalid_date_range", "The from date must be on or before the to date.");
  }
  if (!isReportChannel(channel)) {
    throw new ApiError(400, "invalid_channel", "Unknown channel filter.");
  }

  const canSeeCostAndProfit =
    auth.role.locked ||
    roleHas(auth.role, "accounting", "view") ||
    roleHas(auth.role, "reports", "financial");

  const canManageAdSpend =
    auth.role.locked ||
    roleHas(auth.role, "accounting", "create") ||
    roleHas(auth.role, "accounting", "edit");

  const bundle = await getReportBundle(from, to, channel);
  const report = canSeeCostAndProfit ? bundle : redactCosts(bundle);

  return json({
    canSeeCostAndProfit,
    canManageAdSpend,
    kpis: report.kpis,
    rows: report.rows,
  });
});
