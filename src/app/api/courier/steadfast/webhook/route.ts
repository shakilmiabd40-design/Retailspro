import crypto from "node:crypto";
import { NextRequest, NextResponse, after } from "next/server";
import { tx } from "@/server/db";
import { bumpRev } from "@/server/seed";
import { deliverDue, enqueueEvents, orderEvents } from "@/server/publicapi/webhooks";
import { handleOrderStatusWhatsAppNotification } from "@/server/whatsapp";
import type { Order, OrderStatus } from "@/lib/orders/types";

export const dynamic = "force-dynamic";

/**
 * Healthcheck GET for webhook verification ping.
 */
export async function GET() {
  return NextResponse.json({ status: "ok", service: "steadfast-webhook" });
}

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

  // 3. Update Order & Dispatch Webhooks
  let queuedEvents = 0;
  let whatsappNotification: { prev: Order; next: Order } | null = null;

  try {
    await tx(async (client) => {
      // Find the order by orderNumber (invoice)
      const res = await client.query<{ id: string; data: Order }>(
        `select id, data from app_records 
         where collection = 'orders' and data->>'orderNumber' = $1 
         limit 1 for update`,
        [invoice]
      );

      if (!res.rows[0]) {
        console.warn(`Order not found for invoice ${invoice}`);
        return;
      }

      const row = res.rows[0];
      // Clone previous order state for accurate diffing
      const prevOrder: Order = JSON.parse(JSON.stringify(row.data));
      const order: Order = row.data;
      const now = new Date().toISOString();

      // Update forward cost if provided
      if (typeof delivery_charge === "number") {
        order.courier = {
          ...order.courier,
          forwardCost: delivery_charge,
        };
      }

      // Map Steadfast status to RetailPro order status
      let newStatus: OrderStatus | undefined;
      let activityLabel = "Courier status update";
      let activityDetail = `Steadfast status: ${status}`;

      if (status === "delivered") {
        newStatus = "delivered";
        activityLabel = "Marked Delivered (Steadfast Webhook)";
        if (typeof event.cod_amount === "number") {
          order.delivery = {
            ...order.delivery,
            customerPaid: event.cod_amount,
            deliveryDate: event.updated_at || now,
          };
        }
      } else if (status === "partial_delivered") {
        newStatus = "partial_delivered";
        activityLabel = "Marked Partial Delivered (Steadfast Webhook)";
        if (typeof event.cod_amount === "number") {
          order.delivery = {
            ...order.delivery,
            customerPaid: event.cod_amount,
          };
        }
      } else if (status === "cancelled") {
        newStatus = "cancelled";
        activityLabel = "Cancelled (Steadfast Webhook)";
        order.cancellation = {
          ...order.cancellation,
          cancelledAt: event.updated_at || now,
          cancelledBy: "Steadfast Courier",
          notes: event.tracking_message || "Cancelled via Steadfast webhook",
        };
      }

      if (newStatus && order.status !== newStatus) {
        order.status = newStatus;
      }

      order.activity = [
        ...(order.activity || []),
        {
          id: crypto.randomUUID(),
          at: now,
          label: activityLabel,
          detail: activityDetail,
          by: "Steadfast",
        },
      ];
      order.updatedAt = now;

      await client.query(
        `update app_records 
         set data = $2::jsonb, version = version + 1, updated_at = now(), updated_by = 'steadfast_webhook' 
         where collection = 'orders' and id = $1`,
        [order.id, JSON.stringify(order)]
      );

      await bumpRev(client, "orders");

      // Generate outgoing events for website webhooks (order.updated, order.status_changed, etc.)
      const events = orderEvents(prevOrder, order);
      if (events.length > 0) {
        queuedEvents = await enqueueEvents(client, events);
      }

      // Track WhatsApp notification if status changed
      if (prevOrder.status !== order.status) {
        whatsappNotification = { prev: prevOrder, next: JSON.parse(JSON.stringify(order)) };
      }

      console.log(`Updated order ${invoice} with courier charge ${delivery_charge} and status ${status}. Enqueued ${queuedEvents} webhook events.`);
    });

    // Deliver outgoing webhooks to connected website(s) in background
    if (queuedEvents > 0) {
      after(() => deliverDue().catch((e) => console.error("[webhooks] deliver failed", e)));
    }

    // Trigger WhatsApp notification in background if configured
    if (whatsappNotification) {
      const { prev, next } = whatsappNotification;
      after(() => handleOrderStatusWhatsAppNotification(prev, next).catch((e) => console.error("[WhatsApp] notification failed", e)));
    }
  } catch (err) {
    console.error(`Failed to update order ${invoice}:`, err);
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  return NextResponse.json({ status: "success" });
}
