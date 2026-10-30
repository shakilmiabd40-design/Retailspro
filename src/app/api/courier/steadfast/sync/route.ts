import "server-only";
import { after } from "next/server";
import { tx } from "@/server/db";
import { ApiError, json, readJson, route, str } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { deliverDue } from "@/server/publicapi/webhooks";
import { handleOrderStatusWhatsAppNotification } from "@/server/whatsapp";
import { getSteadfastConsignment, getSteadfastConsignmentByInvoice } from "@/server/courier/steadfast";
import { applyStatusToOrder, loadOrderForConsignment } from "@/server/courier/apply-steadfast-status";
import type { Order } from "@/lib/orders/types";

export const dynamic = "force-dynamic";

/**
 * POST /api/courier/steadfast/sync — pulls a consignment's current status from Steadfast and applies
 * it to the order, for when the webhook never arrived (wrong Auth Token, callback URL not saved, …).
 *
 * Body: { orderId } (RetailsPro record id) or { invoice } (order number).
 */
export const POST = route(async (req) => {
  await requireAuth(req);
  const b = await readJson(req);
  const orderId = str(b.orderId, 100);
  const invoice = str(b.invoice, 100);
  if (!orderId && !invoice) throw new ApiError(400, "invalid", "orderId or invoice is required.");

  // Read the order once outside the transaction just to find its consignment id.
  const found = await tx(async (client) => {
    if (orderId) {
      const { rows } = await client.query<{ id: string; data: Order }>(
        `select id, data from app_records where collection = 'orders' and id = $1 limit 1`,
        [orderId]
      );
      return rows[0] ?? null;
    }
    return loadOrderForConsignment(client, { invoice });
  });

  if (!found) throw new ApiError(404, "not_found", "That order doesn't exist.");

  const trackingId = (found.data.courier?.trackingId ?? "").trim();
  const orderNumber = (found.data.orderNumber ?? "").trim();
  if (!trackingId && !orderNumber) throw new ApiError(400, "invalid", "This order has no consignment id or order number to look up.");

  const remote = /^\d+$/.test(trackingId)
    ? await getSteadfastConsignment(trackingId)
    : await getSteadfastConsignmentByInvoice(orderNumber);
  if (!remote.ok) throw new ApiError(502, "steadfast_error", remote.error);

  const result = await tx(async (client) => {
    const row = await loadOrderForConsignment(client, { consignmentId: trackingId || undefined, invoice: orderNumber });
    if (!row) return null;
    return applyStatusToOrder(client, row, remote.data, "steadfast_sync");
  });
  if (!result) throw new ApiError(404, "not_found", "The order disappeared while syncing.");

  if (result.queuedEvents > 0) {
    after(() => deliverDue().catch((e) => console.error("[webhooks] deliver failed", e)));
  }
  if (result.whatsapp) {
    const { prev, next } = result.whatsapp;
    after(() => handleOrderStatusWhatsAppNotification(prev, next).catch((e) => console.error("[WhatsApp] notification failed", e)));
  }

  return json({
    status: String(remote.data.status ?? ""),
    changed: result.changed,
    orderId: found.id,
    orderStatus: result.orderStatus,
  });
});
