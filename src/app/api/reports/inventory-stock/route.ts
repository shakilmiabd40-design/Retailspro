import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { snapshotSkus } from "@/lib/notifications/engine";
import { buildInventoryStockReport } from "@/server/reports/inventory";
import { loadNotificationState, loadOpenPurchaseOrders, loadStockProducts } from "@/server/reports/inventory-data";
export const dynamic = "force-dynamic";

const TEXT_LIMIT = 120;

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.products)) throw new ApiError(403, "forbidden", "You do not have access to the product catalog.");

  const sp = req.nextUrl.searchParams;
  const category = (sp.get("category") ?? "all").slice(0, TEXT_LIMIT);
  const brand = (sp.get("brand") ?? "all").slice(0, TEXT_LIMIT);
  const productId = (sp.get("productId") ?? "all").slice(0, TEXT_LIMIT);
  const sku = (sp.get("sku") ?? "").slice(0, TEXT_LIMIT);

  const canReadPurchaseOrders = canRead(auth.role, COLLECTION_ACCESS.purchase_orders);
  const [products, notificationState, purchaseOrders] = await Promise.all([
    loadStockProducts(false),
    loadNotificationState(),
    canReadPurchaseOrders ? loadOpenPurchaseOrders() : Promise.resolve([]),
  ]);

  return json(
    buildInventoryStockReport(products, {
      category,
      brand,
      productId,
      sku,
      settings: notificationState.settings,
      states: notificationState.states,
      snapshots: snapshotSkus(products, purchaseOrders),
    }),
  );
});
