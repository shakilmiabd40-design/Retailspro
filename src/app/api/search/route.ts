import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { requireAuth } from "@/server/auth";
import { query } from "@/server/db";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80).toLowerCase();
  if (q.length < 2) return json({ products: [], orders: [], suppliers: [] });
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const [products, orders, suppliers] = await Promise.all([
    canRead(auth.role, COLLECTION_ACCESS.products)
      ? query<{ id: string; name: string; sku: string }>("select id,data->>'name' as name,data->>'sku' as sku from app_records where collection='products' and (lower(data->>'name') like $1 escape chr(92) or lower(data->>'sku') like $1 escape chr(92) or lower(data->>'barcode') like $1 escape chr(92)) order by seq desc limit 5", [pattern])
      : Promise.resolve({ rows: [] as { id: string; name: string; sku: string }[] }),
    canRead(auth.role, COLLECTION_ACCESS.orders)
      ? query<{ id: string; orderNumber: string; customerName: string; phone: string }>("select id,data->>'orderNumber' as \"orderNumber\",data->>'customerName' as \"customerName\",data->>'phone' as phone from app_records where collection='orders' and (lower(data->>'orderNumber') like $1 escape chr(92) or lower(data->>'customerName') like $1 escape chr(92) or lower(data->>'phone') like $1 escape chr(92)) order by seq desc limit 5", [pattern])
      : Promise.resolve({ rows: [] as { id: string; orderNumber: string; customerName: string; phone: string }[] }),
    canRead(auth.role, COLLECTION_ACCESS.suppliers)
      ? query<{ id: string; name: string; phone: string }>("select id,data->>'name' as name,data->>'phone' as phone from app_records where collection='suppliers' and (lower(data->>'name') like $1 escape chr(92) or lower(data->>'phone') like $1 escape chr(92)) order by seq desc limit 5", [pattern])
      : Promise.resolve({ rows: [] as { id: string; name: string; phone: string }[] }),
  ]);
  return json({ products: products.rows, orders: orders.rows, suppliers: suppliers.rows });
});
