import { after } from "next/server";
import { apiRoute, ok, readBody } from "@/server/publicapi/http";
import { authenticateApiKey } from "@/server/publicapi/apikeys";
import { cancelApiOrder } from "@/server/publicapi/orders";
import { toApiOrder } from "@/server/publicapi/serialize";
import { deliverDue } from "@/server/publicapi/webhooks";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/orders/{id}/cancel   { "reason": "Customer changed mind", "notes": "optional" }
 * Only works before the parcel reaches the courier. Releases the reserved stock. Cancelling twice is fine.
 */
export const POST = apiRoute<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const key = await authenticateApiKey(req, "orders:write");
  const { id } = await ctx.params;
  const body = await readBody(req).catch(() => ({}) as Record<string, unknown>);
  const reason = (typeof body.reason === "string" && body.reason.trim().slice(0, 200)) || "Cancelled by customer (online store)";
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim().slice(0, 500) : undefined;
  const order = await cancelApiOrder(req, key, decodeURIComponent(id).slice(0, 120), reason, notes);
  after(() => deliverDue().catch((e) => console.error("[webhooks] deliver failed", e)));
  return ok(toApiOrder(order));
});
