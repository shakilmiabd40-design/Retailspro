import type { DateTypeKey } from "@/lib/reports/dates";
import { isIsoDay } from "@/lib/reports/period";
import { PRODUCT_SALES_DATE_TYPES } from "@/lib/reports/orders";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { loadOrderCandidates } from "@/server/reports/order-candidates";
import { loadProductMeta } from "@/server/reports/product-meta";
import { buildProductSalesReport } from "@/server/reports/product-sales";
import { loadReturnCandidates } from "@/server/reports/return-candidates";

export const dynamic = "force-dynamic";

const TEXT_LIMIT = 120;

const textParam = (value: string | null, fallback: string, label: string): string => {
  const text = value ?? fallback;
  if (text.length > TEXT_LIMIT) throw new ApiError(400, "invalid_filter", `The ${label} filter is too long.`);
  return text;
};

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) throw new ApiError(403, "forbidden", "You do not have access to orders.");
  if (!canRead(auth.role, COLLECTION_ACCESS.returns)) throw new ApiError(403, "forbidden", "You do not have access to returns.");
  if (!canRead(auth.role, COLLECTION_ACCESS.products)) throw new ApiError(403, "forbidden", "You do not have access to products.");

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!isIsoDay(from) || !isIsoDay(to) || from > to) {
    throw new ApiError(400, "invalid_date_range", "Choose a valid report date range.");
  }

  const dateType = sp.get("dateType");
  if (!dateType || !(PRODUCT_SALES_DATE_TYPES as string[]).includes(dateType)) {
    throw new ApiError(400, "invalid_date_type", "Choose a valid date type for this report.");
  }

  const category = textParam(sp.get("category"), "all", "category");
  const brand = textParam(sp.get("brand"), "all", "brand");
  const productId = textParam(sp.get("productId"), "all", "product");
  const sku = textParam(sp.get("sku"), "", "SKU");

  const [orders, returns, meta] = await Promise.all([
    loadOrderCandidates(from, to, dateType as DateTypeKey),
    loadReturnCandidates(from, to, "customer"),
    loadProductMeta(),
  ]);

  return json(
    buildProductSalesReport(orders, returns, meta, {
      from,
      to,
      dateType: dateType as DateTypeKey,
      category,
      brand,
      productId,
      sku,
    }),
  );
});
