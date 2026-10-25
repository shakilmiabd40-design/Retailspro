import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * Incoming Webhook from Steadfast.
 * Verifies HMAC signature, extracts delivery_charge, and updates the order in the database.
 */
export async function POST(req: NextRequest) {
  const token = process.env.STEADFAST_TOKEN;
  if (!token) {
    console.error("STEADFAST_TOKEN not configured");
    return new NextResponse("Not Configured", { status: 503 });
  }

  // 1. Verify Signature
  const signature = req.headers.get("X-Signature") || "";
  const rawBody = await req.text();
  const expected = crypto.createHmac("sha256", token).update(rawBody).digest("hex");

  if (signature !== expected) {
    console.error("Steadfast webhook signature mismatch");
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // 2. Parse Event
  const event = JSON.parse(rawBody);
  if (event.notification_type !== "delivery_status") {
    // Ignore other event types for now
    return NextResponse.json({ status: "success" });
  }

  const { invoice, delivery_charge, status } = event;
  if (!invoice || typeof delivery_charge !== "number") {
    return NextResponse.json({ status: "invalid_payload" }, { status: 400 });
  }

  // 3. Update Order
  // Only update if it's delivered or partial, to avoid overwriting with stale data.
  if (status === "delivered" || status === "partial_delivered") {
    try {
      // Find the order by orderNumber (invoice)
      // We assume orderNumber is unique or mapped to the invoice
      await query(
        `update app_documents
         set data = jsonb_set(
           data,
           '{courier, forwardCost}',
           $1::text::jsonb
         )
         where key = 'order_' || $2`,
        [JSON.stringify(delivery_charge), invoice]
      );

      console.log(`Updated order ${invoice} with courier charge ${delivery_charge}`);
    } catch (err) {
      console.error(`Failed to update order ${invoice}:`, err);
      return new NextResponse("Internal Server Error", { status: 500 });
    }
  }

  return NextResponse.json({ status: "success" });
}
