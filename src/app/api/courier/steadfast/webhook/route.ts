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
  if (type !== "delivery_status" && type !== "tracking_update") {
    console.log(`[steadfast] ignoring notification_type=${type}`);
    return NextResponse.json({ status: "received" });
  }

  const invoice = typeof event.invoice === "string" ? event.invoice.trim() : "";
  const consignmentId = event.consignment_id === undefined || event.consignment_id === null ? "" : String(event.consignment_id).trim();
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
      `[steadfast] ${invoice || consignmentId}: status=${String(event.status ?? "—")} → ${result.changed ? "updated" : "no change"}` +
        (result.queuedEvents ? `, ${result.queuedEvents} webhook event(s) queued` : "")
    );
  } catch (err) {
    console.error(`[steadfast] failed to update invoice=${invoice || "—"} consignment=${consignmentId || "—"}:`, err);
    // 500 so Steadfast retries — the database may just be busy.
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  return NextResponse.json({ status: "success" });
}
