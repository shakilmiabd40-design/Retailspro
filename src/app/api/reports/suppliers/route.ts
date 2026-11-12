import { isIsoDay } from "@/lib/reports/period";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { canSeeProductCost } from "@/server/redact";
import { loadProductMeta } from "@/server/reports/product-meta";
import { loadPurchaseOrderCandidates, loadPurchaseOrderSuppliers, loadSupplierNames, loadVariantCosts } from "@/server/reports/purchase-candidates";
import { loadReturnCandidates } from "@/server/reports/return-candidates";
import { buildSupplierReport, type PurchaseDateType } from "@/server/reports/suppliers";

export const dynamic = "force-dynamic";

const DATE_TYPES: PurchaseDateType[] = ["grn", "po_created"];
const TEXT_LIMIT = 120;

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.purchase_orders)) throw new ApiError(403, "forbidden", "You do not have access to purchase orders.");
  if (!canRead(auth.role, COLLECTION_ACCESS.suppliers)) throw new ApiError(403, "forbidden", "You do not have access to suppliers.");
  if (!canRead(auth.role, COLLECTION_ACCESS.returns)) throw new ApiError(403, "forbidden", "You do not have access to returns.");

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

  const [purchaseOrders, supplierNames, returns, meta] = await Promise.all([
    loadPurchaseOrderCandidates(from, to),
    loadSupplierNames(),
    loadReturnCandidates(from, to, "supplier"),
    loadProductMeta(),
  ]);

  // Product cost is only visible to roles with the products "financial" permission; without it a
  // supplier return is valued at 0, exactly as the browser-side report did.
  const variantCosts = canSeeProductCost(auth.role) ? await loadVariantCosts() : new Map<string, number>();

  const referencedPoIds = returns.map((record) => record.referenceId).filter((id) => !!id);
  const poSuppliers = await loadPurchaseOrderSuppliers(referencedPoIds);

  return json(
    buildSupplierReport(purchaseOrders, returns, {
      from,
      to,
      dateType: dateType as PurchaseDateType,
      supplierId,
      suppliers: [...supplierNames].map(([id, name]) => ({ id, name })),
      poSuppliers,
      variantCosts,
      meta,
    }),
  );
});
