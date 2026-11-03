import type { Product } from "@/lib/products/types";
import type { PurchaseOrder } from "@/lib/purchase-orders/types";
import { snapshotSkus, type SkuSnapshot } from "@/lib/notifications/engine";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { query } from "@/server/db";
import { json, route } from "@/server/http";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

export const dynamic = "force-dynamic";

const snapshotCache = new RevisionCache<SkuSnapshot[]>(4);

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.products)) return json({ snapshots: [], revision: "forbidden" });
  const canReadPurchaseOrders = canRead(auth.role, COLLECTION_ACCESS.purchase_orders);
  const revisions = await revisionKey(["products", ...(canReadPurchaseOrders ? ["purchase_orders"] : [])]);
  if (req.nextUrl.searchParams.get("revision") === revisions) return json({ revision: revisions, unchanged: true });
  const snapshots = await snapshotCache.get(`${revisions}|purchase:${canReadPurchaseOrders}`, async () => {
    const [products, purchaseOrders] = await Promise.all([
      query<{ data: Product }>("select data from app_records where collection='products'"),
      canReadPurchaseOrders
        ? query<{ data: PurchaseOrder }>("select data from app_records where collection='purchase_orders'")
        : Promise.resolve({ rows: [] as { data: PurchaseOrder }[] }),
    ]);
    return snapshotSkus(products.rows.map((row) => row.data), purchaseOrders.rows.map((row) => row.data));
  });
  return json({ snapshots, revision: revisions });
});
