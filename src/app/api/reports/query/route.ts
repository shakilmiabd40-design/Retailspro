import { normaliseQueryRequest } from "@/lib/reports/query-builder";
import { requireAuth, roleHas } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { canSeeProductCost } from "@/server/redact";
import { runQuery } from "@/server/reports/query-builder";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) throw new ApiError(403, "forbidden", "You do not have access to this data.");
  if (!canRead(auth.role, COLLECTION_ACCESS.products)) throw new ApiError(403, "forbidden", "You do not have access to this data.");

  const sp = req.nextUrl.searchParams;
  const filters: Record<string, string> = {};
  for (const [key, value] of sp.entries()) {
    if (key === "dataset" || key === "dimension" || key === "measure" || key === "aggregation" || key === "from" || key === "to") continue;
    filters[key] = value;
  }

  const request = normaliseQueryRequest({
    dataset: sp.get("dataset") ?? "",
    dimension: sp.get("dimension") ?? "",
    measure: sp.get("measure") ?? "",
    aggregation: (sp.get("aggregation") ?? "sum") as never,
    from: sp.get("from") ?? "",
    to: sp.get("to") ?? "",
    filters,
  });
  if (!request) throw new ApiError(400, "invalid_query", "Choose a dataset, a date range and what to total.");

  const result = await runQuery(request);

  // Cost-priced measures stay hidden from a role without the financial permission.
  const seesCost = canSeeProductCost(auth.role) || roleHas(auth.role, "reports", "financial") || roleHas(auth.role, "accounting", "view");
  const costMeasures = new Set(["productCost", "netRevenue", "stockValue", "cost", "pendingValue", "value"]);

  return json({ ...result, canSeeCost: seesCost, costHidden: !seesCost && costMeasures.has(request.measure) });
});
