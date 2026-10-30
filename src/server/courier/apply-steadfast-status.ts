import "server-only";
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { bumpRev } from "@/server/seed";
import { enqueueEvents, orderEvents } from "@/server/publicapi/webhooks";
import { FINAL_STATUSES } from "@/lib/orders/utils";
import type { Order } from "@/lib/orders/types";
import { mapSteadfastStatus, normalizeSteadfastStatus, toAmount } from "./steadfast-status";

/** The fields Steadfast puts on a `delivery_status` / `tracking_update` webhook (or a status lookup). */
export interface SteadfastStatusPayload {
  status?: unknown;
  delivery_charge?: unknown;
  cod_amount?: unknown;
  tracking_message?: unknown;
  updated_at?: unknown;
}

export interface ApplyResult {
  /** False when no order matched the invoice / consignment id. */
  found: boolean;
  /** False when the event said nothing new — no write was made. */
  changed: boolean;
  /** The order's status after applying the event. */
  orderStatus: Order["status"];
  queuedEvents: number;
  /** Set when the order status changed, so the caller can send the WhatsApp notification. */
  whatsapp?: { prev: Order; next: Order };
}

interface Row {
  id: string;
  data: Order;
}

/**
 * Loads the order that belongs to a Steadfast consignment. `for update` locks it so two webhooks
 * arriving together can't interleave their read-modify-write.
 */
export async function loadOrderForConsignment(
  client: PoolClient,
  match: { invoice?: string; consignmentId?: string }
): Promise<Row | null> {
  if (match.invoice) {
    const { rows } = await client.query<Row>(
      `select id, data from app_records
        where collection = 'orders' and data->>'orderNumber' = $1
        limit 1
        for update`,
      [match.invoice]
    );
    if (rows[0]) return rows[0];
  }
  if (match.consignmentId) {
    const { rows } = await client.query<Row>(
      `select id, data from app_records
        where collection = 'orders' and trim(data->'courier'->>'trackingId') = $1
        limit 1
        for update`,
      [match.consignmentId]
    );
    if (rows[0]) return rows[0];
  }
  return null;
}

const LABELS: Record<string, string> = {
  in_transit: "Marked In Transit (Steadfast)",
  delivered: "Marked Delivered (Steadfast)",
  partial_delivered: "Marked Partial Delivered (Steadfast)",
  cancelled: "Cancelled (Steadfast)",
  none: "Steadfast status update",
};

/**
 * Applies one Steadfast status event to an already-locked order: courier charge / raw status,
 * order status, delivery + return + cancellation details, activity log, and the outgoing webhooks
 * for connected websites. The caller owns the transaction.
 */
export async function applyStatusToOrder(
  client: PoolClient,
  row: Row,
  event: SteadfastStatusPayload,
  updatedBy = "steadfast_webhook"
): Promise<ApplyResult> {
  const prev: Order = JSON.parse(JSON.stringify(row.data));
  const order: Order = row.data;
  const now = new Date().toISOString();

  const rawStatus = normalizeSteadfastStatus(event.status);
  const mapped = mapSteadfastStatus(rawStatus);
  const charge = toAmount(event.delivery_charge);
  const cod = toAmount(event.cod_amount);
  const message = typeof event.tracking_message === "string" ? event.tracking_message.trim() : "";
  const happenedAt = typeof event.updated_at === "string" && event.updated_at.trim() ? event.updated_at.trim() : now;

  // The courier's confirmed forward charge is only known once it has the parcel.
  if (charge !== null) order.courier = { ...order.courier, forwardCost: charge };
  if (rawStatus) order.courier = { ...order.courier, status: rawStatus };

  if (mapped === "in_transit" && !order.courier.dispatchDate) {
    order.courier = { ...order.courier, dispatchDate: happenedAt.slice(0, 10) };
  }

  // Never walk a finished order backwards (e.g. a late "pending" event after delivery).
  const canMove = mapped !== null && !(mapped === "in_transit" && FINAL_STATUSES.includes(order.status));
  if (canMove) order.status = mapped;

  if (mapped === "delivered") {
    order.delivery = {
      ...order.delivery,
      customerPaid: cod ?? order.delivery.customerPaid,
      deliveryDate: happenedAt,
    };
  } else if (mapped === "partial_delivered") {
    order.delivery = { ...order.delivery, customerPaid: cod ?? order.delivery.customerPaid };
    order.returnInfo = { ...order.returnInfo, returnRequired: true };
  } else if (mapped === "cancelled") {
    order.cancellation = {
      ...order.cancellation,
      cancelledAt: happenedAt,
      cancelledBy: order.cancellation.cancelledBy || "Steadfast Courier",
      notes: message || order.cancellation.notes || "Cancelled at Steadfast",
    };
  }

  const label = mapped ? LABELS[mapped] : LABELS.none;
  const detail = rawStatus ? `Steadfast status: ${rawStatus}${message ? ` — ${message}` : ""}` : message || "Steadfast update";

  // Steadfast retries webhooks; skip the write when nothing actually changed.
  const last = order.activity[order.activity.length - 1];
  const nothingNew =
    prev.status === order.status &&
    JSON.stringify(prev.courier) === JSON.stringify(order.courier) &&
    JSON.stringify(prev.delivery) === JSON.stringify(order.delivery) &&
    last?.label === label &&
    last?.detail === detail;

  if (nothingNew) return { found: true, changed: false, orderStatus: order.status, queuedEvents: 0 };

  order.activity = [...order.activity, { id: crypto.randomUUID(), at: now, label, detail, by: "Steadfast" }];
  order.updatedAt = now;

  await client.query(
    `update app_records
        set data = $2::jsonb, version = version + 1, updated_at = now(), updated_by = $3
      where collection = 'orders' and id = $1`,
    [order.id, JSON.stringify(order), updatedBy]
  );
  await bumpRev(client, "orders");

  const events = orderEvents(prev, order);
  const queuedEvents = events.length ? await enqueueEvents(client, events) : 0;

  return {
    found: true,
    changed: true,
    orderStatus: order.status,
    queuedEvents,
    whatsapp: prev.status !== order.status ? { prev, next: JSON.parse(JSON.stringify(order)) } : undefined,
  };
}
