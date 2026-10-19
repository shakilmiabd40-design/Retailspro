import { ApiError } from "@/server/http";
import { apiRoute, ok } from "@/server/publicapi/http";
import { authenticateApiKey } from "@/server/publicapi/apikeys";
import { findOwnOrder } from "@/server/publicapi/orders";
import { toApiOrder } from "@/server/publicapi/serialize";

export const dynamic = "force-dynamic";

/** GET /api/v1/orders/{id} — {id} can be the order id, the order number (ORD-10241) or your own external_id. */
export const GET = apiRoute<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const key = await authenticateApiKey(req, "orders:read");
  const { id } = await ctx.params;
  const found = await findOwnOrder(key, decodeURIComponent(id).slice(0, 120));
  if (!found) throw new ApiError(404, "not_found", "No such order for this API key.");
  return ok(toApiOrder(found.order));
});
