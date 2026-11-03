import type { InventoryMovement } from "@/lib/accounting/gl-types";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { requireAuth } from "@/server/auth";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.inventory_cost_layers) || !canRead(auth.role, COLLECTION_ACCESS.inventory_movements)) {
    throw new ApiError(403, "forbidden", "You do not have access to inventory accounting reports.");
  }
  const [layers, movements, control] = await Promise.all([
    query<{ productId: string; variantId: string; qty: string; value: string }>(
      `select data->>'productId' as "productId", data->>'variantId' as "variantId",
         coalesce(sum((data->>'remainingQty')::numeric),0)::text as qty,
         coalesce(sum((data->>'remainingQty')::numeric * (data->>'unitCost')::numeric),0)::text as value
       from app_records where collection='inventory_cost_layers' and (data->>'remainingQty')::numeric>0
       group by data->>'productId',data->>'variantId'`,
    ),
    query<{ data: InventoryMovement }>("select data from app_records where collection='inventory_movements' order by data->>'date' desc,data->>'createdAt' desc,seq desc limit 20"),
    query<{ value: string }>(
      `select coalesce(sum((l->>'debit')::numeric-(l->>'credit')::numeric),0)::text as value
       from app_records j cross join lateral jsonb_array_elements(coalesce(j.data->'lines','[]'::jsonb)) l
       join app_records a on a.collection='chart_of_accounts' and a.id=l->>'accountId'
       where j.collection='journal_entries' and j.data->>'status'='posted' and a.data->>'code'='1200'`,
    ),
  ]);
  return json({
    layers: layers.rows.map((row) => ({ ...row, qty: Number(row.qty), value: Number(row.value) })),
    movements: movements.rows.map((row) => row.data),
    glValue: Number(control.rows[0]?.value ?? 0),
  });
});
