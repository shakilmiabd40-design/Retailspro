import "server-only";
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { bumpRev } from "@/server/seed";
import { enqueueEvents, orderEvents } from "@/server/publicapi/webhooks";
import { expectedCod, FINAL_STATUSES } from "@/lib/orders/utils";
import type { Order } from "@/lib/orders/types";
import { mapSteadfastStatus, normalizeSteadfastStatus, readCourierPaidAmount, readDeliveryCharge } from "./steadfast-status";
import { COUNTER_START } from "@/server/collections";
import { postAccountingChanges } from "@/server/accounting/auto-post";

/** The fields Steadfast puts on a `delivery_status` / `tracking_update` webhook (or a status lookup). */
export interface SteadfastStatusPayload {
  status?: unknown;
  delivery_charge?: unknown;
  cod_amount?: unknown;
  tracking_message?: unknown;
  updated_at?: unknown;
  /** Some responses wrap the parcel fields in a `consignment` object. */
  consignment?: unknown;
  /** `consignment_update` sends changed fields (including COD) inside `values`. */
  values?: unknown;
  [key: string]: unknown;
}

export interface ApplyResult {
  /** False when no order matched the invoice / consignment id. */
  found: boolean;
  /** False when the event said nothing new — no write was made. */
  changed: boolean;
  /** The order's status after applying the event. */
  orderStatus: Order["status"];
  customerPaid?: number;
  /** COD amount explicitly reported by Steadfast; null means the payload omitted it. */
  reportedCodAmount: number | null;
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
  refuse_return: "Marked Refuse Return (Steadfast)",
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

  // Some payloads (e.g. `consignment_update`) wrap the parcel fields in a `consignment` object.
  const consignment = event.consignment && typeof event.consignment === "object" ? (event.consignment as Record<string, unknown>) : null;
  const values = event.values && typeof event.values === "object" && !Array.isArray(event.values)
    ? event.values as Record<string, unknown>
    : null;
  const field = (key: string) => values?.[key] ?? event[key] ?? consignment?.[key];

  // Steadfast documents `status`; some callback versions use `delivery_status`.
  const rawStatus = normalizeSteadfastStatus(field("status")) || normalizeSteadfastStatus(field("delivery_status"));
  const mapped = mapSteadfastStatus(rawStatus);
  const charge = readDeliveryCharge(event, consignment);
  // `cod_amount` is what the customer actually paid. Steadfast revises it for a partial delivery
  // (the customer kept some items / paid less) and pushes another webhook — which may repeat the
  // same already-final status, or carry no status at all.
  const cod = readCourierPaidAmount(event, consignment);
  const message = typeof field("tracking_message") === "string" ? String(field("tracking_message")).trim() : "";
  const rawHappenedAt = field("updated_at");
  const happenedAt = typeof rawHappenedAt === "string" && rawHappenedAt.trim() ? rawHappenedAt.trim() : now;

  // The courier's confirmed forward charge is only known once it has the parcel. A status lookup
  // often omits `delivery_charge` (or sends 0) while it isn't fixed yet — that must never erase the
  // cost recorded at dispatch. If it is genuinely missing when the parcel reaches a delivery
  // outcome, fall back to the order's delivery charge instead of leaving a partial delivery at 0.
  if (charge !== null) {
    order.courier = { ...order.courier, forwardCost: charge };
  } else if (
    !order.courier.forwardCost &&
    order.deliveryCharge > 0 &&
    (mapped === "delivered" || mapped === "partial_delivered" || mapped === "refuse_return" ||
      order.status === "delivered" || order.status === "partial_delivered" || order.status === "refuse_return")
  ) {
    order.courier = { ...order.courier, forwardCost: order.deliveryCharge };
  }
  if (rawStatus) order.courier = { ...order.courier, status: rawStatus };

  if (mapped === "in_transit" && !order.courier.dispatchDate) {
    order.courier = { ...order.courier, dispatchDate: happenedAt.slice(0, 10) };
  }

  // Never walk a finished order backwards (e.g. a late "pending" event after delivery).
  if (mapped && !FINAL_STATUSES.includes(order.status)) {
    if (mapped === "in_transit") {
      if (order.status === "processing") {
        order.status = "in_transit";
      } else if (order.status === "pending") {
        if (rawStatus === "in_review" || rawStatus === "in_transit" || rawStatus === "pending" || (order.courier.trackingId && /^\d+$/.test(String(order.courier.trackingId).trim()))) {
          order.status = "in_transit";
        }
      }
    } else if (mapped === "delivered" || mapped === "partial_delivered" || mapped === "refuse_return") {
      order.status = mapped;
    }
  }

  if (mapped === "refuse_return") {
    // A courier cancellation means the parcel never reached the customer and is coming back —
    // that is a refused return in RetailsPro, not a pre-shipment Cancelled order.
    order.delivery = { ...order.delivery, customerPaid: 0 };
    order.returnInfo = { ...order.returnInfo, returnRequired: true };
  } else {
    const hasDeliveryOutcome = order.status === "delivered" || order.status === "partial_delivered";
    // Apply a (reported) paid amount whenever the order has a delivery outcome — including when
    // this event only revised the amount and the status did not change.
    if (cod !== null && hasDeliveryOutcome) {
      order.delivery = { ...order.delivery, customerPaid: cod };
    }
    if (mapped === "delivered") {
      // Don't move the delivery date forward when a later amount-change webhook repeats the status.
      const deliveryDate = prev.status === "delivered" ? order.delivery.deliveryDate ?? happenedAt : happenedAt;
      order.delivery = { ...order.delivery, deliveryDate };
    }
    if (mapped === "partial_delivered") {
      order.returnInfo = { ...order.returnInfo, returnRequired: true };
    }
  }

  const codChanged = cod !== null && prev.delivery.customerPaid !== cod && (order.status === "delivered" || order.status === "partial_delivered");
  const label = mapped ? LABELS[mapped] : LABELS.none;
  const codDetail = codChanged ? `Customer Paid changed ৳${(prev.delivery.customerPaid || expectedCod(prev)).toLocaleString()} → ৳${cod.toLocaleString()}` : "";
  const statusDetail = rawStatus ? `Steadfast status: ${rawStatus}${message ? ` — ${message}` : ""}` : message || "Steadfast update";
  const detail = [statusDetail, codDetail].filter(Boolean).join(" · ");

  // Steadfast retries webhooks; skip the write when nothing actually changed.
  const last = order.activity[order.activity.length - 1];
  const sameStatusDetail = last?.detail === detail || (!codChanged && last?.detail?.startsWith(`${statusDetail} · Customer Paid changed `));
  const nothingNew =
    prev.status === order.status &&
    JSON.stringify(prev.courier) === JSON.stringify(order.courier) &&
    JSON.stringify(prev.delivery) === JSON.stringify(order.delivery) &&
    JSON.stringify(prev.returnInfo) === JSON.stringify(order.returnInfo) &&
    last?.label === label &&
    sameStatusDetail;

  if (nothingNew) return { found: true, changed: false, orderStatus: order.status, customerPaid: order.delivery.customerPaid, reportedCodAmount: cod, queuedEvents: 0 };

  order.activity = [...order.activity, { id: crypto.randomUUID(), at: now, label, detail, by: "Steadfast" }];
  order.updatedAt = now;

  await client.query(
    `update app_records
        set data = $2::jsonb, version = version + 1, updated_at = now(), updated_by = $3
      where collection = 'orders' and id = $1`,
    [order.id, JSON.stringify(order), updatedBy]
  );
  await bumpRev(client, "orders");

  await postAccountingChanges(client, { orders: new Map([[order.id, { before: prev, after: order }]]) }, updatedBy);

  if (codChanged) {
    const notification = {
      id: crypto.randomUUID(),
      orderId: order.id,
      orderNumber: order.orderNumber,
      previousAmount: prev.delivery.customerPaid || expectedCod(prev),
      currentAmount: cod!,
      timestamp: now,
      source: "Steadfast",
      read: false,
    };
    const { rows: notificationRows } = await client.query<{ data: { updates?: unknown[]; newOrders?: unknown[] } }>("select data from app_documents where key='order_notifications' for update");
    const current = notificationRows[0]?.data ?? { updates: [] };
    const updates = [...(current.updates ?? []), notification].slice(-200);
    await client.query(
      `insert into app_documents(key,data,updated_by) values('order_notifications',$1::jsonb,$2)
       on conflict(key) do update set data=excluded.data,version=app_documents.version+1,updated_at=now(),updated_by=excluded.updated_by`,
      [JSON.stringify({ ...current, updates }), updatedBy]
    );
    await bumpRev(client, "order_notifications");
  }

  // Auto-create warranties when order becomes delivered
  if (prev.status !== "delivered" && order.status === "delivered") {
    try {
      const { rows: docRows } = await client.query<{ data: { warranty?: { durationDays?: number }; invoice?: { numbering?: { warranty?: string } } } }>("select data from app_documents where key = 'settings' limit 1");
      const settings = docRows[0]?.data || {};
      const warrantyDays = Number(settings?.warranty?.durationDays) || 365;
      const warrantyPrefix = settings?.invoice?.numbering?.warranty || "WAR-";
      const end = new Date(Date.now() + warrantyDays * 24 * 60 * 60 * 1000).toISOString();
      for (const item of order.items || []) {
        const { rows: c } = await client.query("insert into app_counters (name, value) values ($1, $2::bigint + 1) on conflict (name) do update set value = app_counters.value + 1 returning value::text", ["warranty", COUNTER_START.warranty || 1001]);
        const wnum = Number(c[0].value);
        const w = {
          id: crypto.randomUUID(),
          warrantyNumber: `${warrantyPrefix}${wnum}`,
          orderId: order.id,
          orderNumber: order.orderNumber,
          source: "order",
          customerName: order.customerName,
          customerPhone: order.phone,
          productId: item.productId,
          productName: item.productName,
          variantId: item.variantId,
          color: item.color || "",
          size: item.size || "",
          sku: item.sku || "",
          qty: item.qty,
          startDate: now,
          endDate: end,
          status: "active",
          claims: [],
          createdAt: now,
        };
        await client.query("insert into app_records (collection, id, data, updated_by) values ($1,$2,$3::jsonb,$4)", ["warranties", w.id, JSON.stringify(w), updatedBy]);
      }
      await bumpRev(client, "warranties");
    } catch (e) {
      console.error("[steadfast] failed to auto-create warranties", e);
    }
  }

  const events = orderEvents(prev, order);
  const queuedEvents = events.length ? await enqueueEvents(client, events) : 0;

  return {
    found: true,
    changed: true,
    orderStatus: order.status,
    customerPaid: order.delivery.customerPaid,
    reportedCodAmount: cod,
    queuedEvents,
    whatsapp: prev.status !== order.status ? { prev, next: JSON.parse(JSON.stringify(order)) } : undefined,
  };
}
