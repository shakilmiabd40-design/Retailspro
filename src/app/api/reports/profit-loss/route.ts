import { buildPnlPeriods, redactPnlStatement, type PnlColumnKey, type PnlDimension, type PnlPeriod } from "@/lib/reports/profit-loss";
import { isIsoDay } from "@/lib/reports/period";
import { requireAuth, roleHas } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { canSeeProductCost } from "@/server/redact";
import { getProfitLossReport } from "@/server/reports/profit-loss";

export const dynamic = "force-dynamic";

const COLUMN_KEYS: PnlColumnKey[] = ["current", "previous", "ytd", "lastYear"];
const DIMENSIONS: PnlDimension[] = ["none", "channel", "campaign", "category", "courier"];
const MAX_PERIODS = 12;

/**
 * The periods to report on. Either explicit periods (the Accounting screen picks
 * its own months) or the named columns (the Reports screen compares the current
 * period with the previous one, year to date, and the same period last year).
 */
function periodsFrom(sp: URLSearchParams): PnlPeriod[] {
  const explicit = sp.get("periods");
  if (explicit) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(explicit);
    } catch {
      throw new ApiError(400, "invalid_periods", "Invalid report periods.");
    }
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_PERIODS) {
      throw new ApiError(400, "invalid_periods", "Choose valid report periods.");
    }
    const periods: PnlPeriod[] = [];
    for (const item of parsed) {
      const row = (item ?? {}) as Record<string, unknown>;
      const key = typeof row.key === "string" ? row.key.slice(0, 40) : "";
      const label = typeof row.label === "string" ? row.label.slice(0, 60) : key;
      const from = typeof row.from === "string" ? row.from : "";
      const to = typeof row.to === "string" ? row.to : "";
      if (!key || !isIsoDay(from) || !isIsoDay(to) || from > to) {
        throw new ApiError(400, "invalid_periods", "Choose valid report periods.");
      }
      periods.push({ key, label, from, to });
    }
    return periods;
  }

  const from = sp.get("from");
  const to = sp.get("to");
  if (!isIsoDay(from) || !isIsoDay(to) || from > to) {
    throw new ApiError(400, "invalid_date_range", "Choose a valid report date range.");
  }
  const columns = (sp.get("columns") ?? "current,previous")
    .split(",")
    .map((value) => value.trim())
    .filter((value): value is PnlColumnKey => (COLUMN_KEYS as string[]).includes(value));
  if (!columns.length) throw new ApiError(400, "invalid_columns", "Choose at least one period to compare.");
  return buildPnlPeriods(from, to, columns);
}

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.journal_entries)) throw new ApiError(403, "forbidden", "You do not have access to profit and loss figures.");

  const sp = req.nextUrl.searchParams;
  const periods = periodsFrom(sp);

  const dimension = (sp.get("dimension") ?? "none") as PnlDimension;
  if (!(DIMENSIONS as string[]).includes(dimension)) throw new ApiError(400, "invalid_dimension", "Choose a valid breakdown.");

  const report = await getProfitLossReport({ periods, lines: [], dimension });

  // Cost and profit are financial figures: a role without the financial permission
  // keeps the sales side but not the money behind it — the same rule the Owner
  // Dashboard uses.
  const seesCost = canSeeProductCost(auth.role) || roleHas(auth.role, "reports", "financial") || roleHas(auth.role, "accounting", "view");
  if (!seesCost) {
    report.lines = redactPnlStatement({ periods: report.periods, lines: report.lines }).lines;
    report.accounts = report.accounts.filter((account) => account.type === "revenue");
    if (report.breakdown) report.breakdown = report.breakdown.map((row) => ({ ...row, productCost: 0, grossProfit: 0 }));
    report.unposted = [];
  }

  return json({ ...report, canSeeCost: seesCost });
});
