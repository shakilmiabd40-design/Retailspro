import crypto from "node:crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { tx } from "@/server/db";
import { deliverDue } from "@/server/publicapi/webhooks";
import { handleOrderStatusWhatsAppNotification } from "@/server/whatsapp";
import { applyStatusToOrder, loadOrderForConsignment } from "@/server/courier/apply-steadfast-status";

export const dynamic = "force-dynamic";

/**
 * Healthcheck GET for webhook verification ping.
 */
export async function GET() {
  return NextResponse.json({ status: "ok", service: "steadfast-webhook" });
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * Steadfast authenticates its webhook with `Authorization: Bearer <auth token>` (the token you set
 * next to the Callback URL in their panel). `X-Signature` (hex HMAC-SHA256 of the raw body, same
 * token as key) is only sent by newer accounts, so either one is accepted.
 */
function authorized(req: NextRequest, rawBody: string, token: string): boolean {
  const auth = (req.headers.get("authorization") ?? "").trim();
  if (auth) {
    const presented = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, "").trim() : auth;
    if (presented && safeEqual(presented, token)) return true;
  }
  const signature = (req.headers.get("x-signature") ?? "").trim();
  if (signature) {
    const expected = crypto.createHmac("sha256", token).update(rawBody).digest("hex");
    if (safeEqual(signature.toLowerCase(), expected)) return true;
  }
  return false;
}

/**
 * Incoming webhook from Steadfast.
 *
 * Steadfast retries 5xx and silence, but *never* retries a 4xx — so every request that passes the
 * auth check answers 200, even when the payload is one we can't use. Anything unusable is logged
 * instead of rejected, so nothing is silently lost.
 *
 * Supported notification_type values:
 *   Status events (update the order in DB):
 *     delivery_status    — primary status push from Steadfast
 *     tracking_update    — in-transit position update; may also carry a new status
 *     consignment_update — parcel detail change (e.g. COD amount on partial delivery)
 *
 *   Lifecycle events (logged, acknowledged, no order mutation):
 *     return_list              — parcel added to Steadfast's return manifest
 *     accepted_payment_request — Steadfast accepted a COD payment request
 *     cancel_request           — cancellation request submitted
 *     return_request           — return request submitted
 *     pickup_request           — pickup request submitted
 *     user_update              — account/user setting changed on Steadfast's side
 */
export async function POST(req: NextRequest) {
  const token = process.env.STEADFAST_TOKEN?.trim();
  if (!token) {
    console.error("[steadfast] STEADFAST_TOKEN is not set — webhook rejected");
    return new NextResponse("Not Configured", { status: 503 });
  }

  const rawBody = await req.text();
  if (!authorized(req, rawBody, token)) {
    console.error("[steadfast] webhook auth failed — check the Auth Token in the Steadfast panel matches STEADFAST_TOKEN");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    event = parsed as Record<string, unknown>;
  } catch {
    console.error("[steadfast] webhook body was not a JSON object:", rawBody.slice(0, 500));
    return NextResponse.json({ status: "received" });
  }

  // Older Steadfast accounts push the status without a notification_type at all.
  const type = typeof event.notification_type === "string" ? event.notification_type.trim().toLowerCase() : "delivery_status";

  // ── Events that carry a consignment status or amount revision ──────────────
  const isStatusEvent = type === "delivery_status" || type === "tracking_update" || type === "consignment_update";

  // ── Steadfast lifecycle / request notification types ───────────────────────
  // These inform us of workflow state changes on Steadfast's side. Steadfast
  // sends a separate delivery_status push when the underlying order status actually
  // changes, so we acknowledge these to stop retries without touching the order.
  //
  // return_list              — parcel placed on Steadfast's return manifest
  // accepted_payment_request — Steadfast confirmed a COD payment request
  // cancel_request           — merchant submitted a cancellation request
  // return_request           — merchant submitted a return request
  // pickup_request           — pickup request submitted
  // user_update              — Steadfast account/user setting changed
  const LIFECYCLE_TYPES = [
    "return_list",
    "accepted_payment_request",
    "cancel_request",
    "return_request",
    "pickup_request",
    "user_update",
  ] as const;
  const isLifecycleEvent = (LIFECYCLE_TYPES as readonly string[]).includes(type);

  if (!isStatusEvent && !isLifecycleEvent) {
    console.log(`[steadfast] ignoring unknown notification_type=${type}`);
    return NextResponse.json({ status: "received" });
  }

  // ── Lifecycle events: log for audit and acknowledge immediately ────────────
  // The real order-status change (cancelled, returned …) arrives later via
  // a delivery_status event — we don't mutate orders here.
  if (isLifecycleEvent) {
    const consignment = event.consignment && typeof event.consignment === "object" && !Array.isArray(event.consignment)
      ? (event.consignment as Record<string, unknown>)
      : null;
    const consignmentId = String(
      event.consignment_id ?? consignment?.consignment_id ?? consignment?.id ?? ""
    ).trim();
    const invoice = String(event.invoice ?? consignment?.invoice ?? "").trim();
    console.log(
      `[steadfast] lifecycle type=${type}` +
        (consignmentId ? ` consignment=${consignmentId}` : "") +
        (invoice ? ` invoice=${invoice}` : "") +
        ` | ${JSON.stringify(event).slice(0, 400)}`
    );
    return NextResponse.json({ status: "received" });
  }

  // ── Status events: apply the new status / amounts to the matching order ────
  const text = (value: unknown) => (value === undefined || value === null ? "" : String(value).trim());
  const consignment =
    event.consignment && typeof event.consignment === "object" && !Array.isArray(event.consignment)
      ? (event.consignment as Record<string, unknown>)
      : null;
  const values = event.values && typeof event.values === "object" && !Array.isArray(event.values)
    ? (event.values as Record<string, unknown>)
    : null;
  const invoice = text(event.invoice) || text(consignment?.invoice) || text(values?.invoice);
  const consignmentId =
    text(event.consignment_id) ||
    text(consignment?.consignment_id) ||
    text(consignment?.consignmentId) ||
    text(consignment?.id) ||
    text(values?.consignment_id) ||
    text(values?.consignmentId);
  if (!invoice && !consignmentId) {
    console.error("[steadfast] webhook had neither invoice nor consignment_id:", rawBody.slice(0, 500));
    return NextResponse.json({ status: "received" });
  }

  try {
    const result = await tx(async (client) => {
      const row = await loadOrderForConsignment(client, { invoice, consignmentId });
      if (!row) return null;
      return applyStatusToOrder(client, row, event);
    });

    if (!result) {
      // Probably an order created outside RetailsPro — acknowledge so Steadfast stops retrying.
      console.warn(`[steadfast] no order matched invoice=${invoice || "—"} consignment=${consignmentId || "—"}`);
      return NextResponse.json({ status: "received" });
    }

    if (result.queuedEvents > 0) {
      after(() => deliverDue().catch((e) => console.error("[webhooks] deliver failed", e)));
    }
    if (result.whatsapp) {
      const { prev, next } = result.whatsapp;
      after(() => handleOrderStatusWhatsAppNotification(prev, next).catch((e) => console.error("[WhatsApp] notification failed", e)));
    }

    console.log(
      `[steadfast] ${invoice || consignmentId}: type=${type} status=${String(event.status ?? values?.status ?? "—")} cod=${String(result.reportedCodAmount ?? "—")} → ${result.changed ? "updated" : "no change"}` +
        (result.queuedEvents ? `, ${result.queuedEvents} webhook event(s) queued` : "")
    );
  } catch (err) {
    console.error(`[steadfast] failed to update invoice=${invoice || "—"} consignment=${consignmentId || "—"}:`, err);
    // 500 so Steadfast retries — the database may just be busy.
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  return NextResponse.json({ status: "success" });
}
