import { query } from "@/server/db";
import { ApiError } from "@/server/http";
import { apiRoute, ok } from "@/server/publicapi/http";
import { authenticateApiKey } from "@/server/publicapi/apikeys";
import { toApiProduct } from "@/server/publicapi/serialize";
import type { Product } from "@/lib/products/types";

export const dynamic = "force-dynamic";

/** GET /api/v1/products/{id} — {id} can be the product id, the product SKU, or any variant SKU. */
export const GET = apiRoute<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await authenticateApiKey(req, "products:read");
  const { id } = await ctx.params;
  const ref = decodeURIComponent(id).slice(0, 120);
  const { rows } = await query<{ data: Product }>(
    `select data from app_records
      where collection = 'products' and (id = $1 or data->>'sku' = $1 or data @> jsonb_build_object('variants', jsonb_build_array(jsonb_build_object('sku', $1::text))))
      order by (id = $1) desc limit 1`,
    [ref]
  );
  if (!rows[0]) throw new ApiError(404, "not_found", "No such product.");
  return ok(toApiProduct(rows[0].data));
});
