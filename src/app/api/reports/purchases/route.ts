import { isIsoDay } from "@/lib/reports/period";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { loadProductMeta } from "@/server/reports/product-meta";
import { loadPurchaseOrderCandidates, loadSupplierNames } from "@/server/reports/purchase-candidates";
import { buildPurchaseReport, type PurchaseDateType } from "@/server/reports/purchases";

export const dynamic = "force-dynamic";

const DATE_TYPES: PurchaseDateType[] = ["grn", "po_created"];
const TEXT_LIMIT = 120;

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.purchase_orders)) throw new ApiError(403, "forbidden", "You do not have access to purchase orders.");
  if (!canRead(auth.role, COLLECTION_ACCESS.suppliers)) throw new ApiError(403, "forbidden", "You do not have access to suppliers.");

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  if (!isIsoDay(from) || !isIsoDay(to) || from > to) {
    throw new ApiError(400, "invalid_date_range", "Choose a valid report date range.");
  }

  const dateType = sp.get("dateType");
  if (!dateType || !(DATE_TYPES as string[]).includes(dateType)) {
    throw new ApiError(400, "invalid_date_type", "Choose a valid date type for this report.");
  }

  const supplierId = (sp.get("supplierId") ?? "all").slice(0, TEXT_LIMIT);
  const category = (sp.get("category") ?? "all").slice(0, TEXT_LIMIT);
  const brand = (sp.get("brand") ?? "all").slice(0, TEXT_LIMIT);
  const productId = (sp.get("productId") ?? "all").slice(0, TEXT_LIMIT);
  const sku = (sp.get("sku") ?? "").slice(0, TEXT_LIMIT);
  const productFilterOn = category !== "all" || brand !== "all" || productId !== "all" || !!sku.trim();

  const [purchaseOrders, supplierNames, meta] = await Promise.all([
    loadPurchaseOrderCandidates(from, to),
    loadSupplierNames(),
    loadProductMeta(),
  ]);

  return json(
    buildPurchaseReport(purchaseOrders, {
      from,
      to,
      dateType: dateType as PurchaseDateType,
      supplierId,
      category,
      brand,
      productId,
      sku,
      productFilterOn,
      supplierNames,
      meta,
    }),
  );
});
