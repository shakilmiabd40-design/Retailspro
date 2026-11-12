import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { canSeeProductCost } from "@/server/redact";
import { dhakaDay } from "@/server/reports/business-day";
import { buildInventoryValueReport } from "@/server/reports/inventory";
import { loadLastSoldDays, loadStockProducts } from "@/server/reports/inventory-data";

export const dynamic = "force-dynamic";

const TEXT_LIMIT = 120;

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.products)) throw new ApiError(403, "forbidden", "You do not have access to the product catalog.");
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) throw new ApiError(403, "forbidden", "You do not have access to order data for this report.");

  const sp = req.nextUrl.searchParams;
  const category = (sp.get("category") ?? "all").slice(0, TEXT_LIMIT);
  const brand = (sp.get("brand") ?? "all").slice(0, TEXT_LIMIT);
  const productId = (sp.get("productId") ?? "all").slice(0, TEXT_LIMIT);
  const sku = (sp.get("sku") ?? "").slice(0, TEXT_LIMIT);
  const deadDays = Math.min(3650, Math.max(1, Number(sp.get("deadDays") ?? 60) || 60));

  // Unit cost and stock value are cost prices: only roles with the products "financial"
  // permission may see them.
  const seesCost = canSeeProductCost(auth.role);
  const [products, lastSoldDays] = await Promise.all([loadStockProducts(seesCost), loadLastSoldDays()]);

  const today = dhakaDay(new Date()) ?? "";
  const report = buildInventoryValueReport(products, {
    category,
    brand,
    productId,
    sku,
    lastSoldDays,
    today,
    deadDays,
    seesCost,
  });

  return json({ ...report, canSeeCost: seesCost });
});
