import "server-only";
import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { query, tx } from "../db";
import { ApiError } from "../http";
import { writeAudit } from "../audit";
import { bumpRev } from "../seed";
import { COUNTER_START } from "../collections";
import type { Order, OrderItem } from "@/lib/orders/types";
import type { Product, Variant } from "@/lib/products/types";
import { detectDistrictArea } from "@/lib/orders/geo";
import type { ApiKeyAuth } from "./apikeys";
import { enqueueEvents, orderEvents, productEvents, type DomainEvent } from "./webhooks";

// ── Input validation ───────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function money(v: unknown, field: string, { max = 10_000_000 } = {}): number {
  const n = Number(v);
  if (v === undefined || v === null || v === "" || !Number.isFinite(n) || n < 0 || n > max) throw new ApiError(422, "invalid_field", `${field} must be a number between 0 and ${max}.`, { field });
  return Math.round(n * 100) / 100;
}

/** Bangladeshi mobile numbers, accepted as 01XXXXXXXXX, 8801XXXXXXXXX or +8801XXXXXXXXX; stored as 01XXXXXXXXX. */
export function normalizeBdPhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[\s\-().]/g, "").replace(/^\+/, "");
  const m = /^(?:88)?(01[3-9]\d{8})$/.exec(digits);
  return m ? m[1] : null;
}

interface LineInput {
  sku?: string;
  productId?: string;
  variantId?: string;
  qty: number;
  unitPrice?: number;
  discount: number;
}

interface CreateInput {
  externalId: string;
  name: string;
  phone: string;
  altPhone?: string;
  address: string;
  district?: string;
  area?: string;
  notes?: string;
  deliveryCharge: number;
  lines: LineInput[];
}

export function parseCreateOrder(body: Record<string, unknown>): CreateInput {
  const externalId = text(body.external_id, 100);
  if (!externalId) throw new ApiError(422, "invalid_field", "external_id is required — your own order id. It makes retries safe (the same id never creates a second order).", { field: "external_id" });

  const c = body.customer;
  if (!isObj(c)) throw new ApiError(422, "invalid_field", "customer is required.", { field: "customer" });
  const name = text(c.name, 120);
  if (name.length < 2) throw new ApiError(422, "invalid_field", "customer.name is required.", { field: "customer.name" });
  const phone = normalizeBdPhone(c.phone);
  if (!phone) throw new ApiError(422, "invalid_phone", "customer.phone must be a Bangladeshi mobile number like 01712345678 (or +8801712345678).", { field: "customer.phone" });
  let altPhone: string | undefined;
  if (c.alt_phone !== undefined && c.alt_phone !== null && c.alt_phone !== "") {
    altPhone = normalizeBdPhone(c.alt_phone) ?? undefined;
    if (!altPhone) throw new ApiError(422, "invalid_phone", "customer.alt_phone must be a Bangladeshi mobile number.", { field: "customer.alt_phone" });
  }
  const address = text(c.address, 400);
  if (address.length < 8) throw new ApiError(422, "invalid_field", "customer.address is required (house / road / area).", { field: "customer.address" });

  if (!Array.isArray(body.items) || body.items.length === 0) throw new ApiError(422, "invalid_field", "items must be a non-empty array.", { field: "items" });
  if (body.items.length > 50) throw new ApiError(422, "invalid_field", "An order can have at most 50 lines.", { field: "items" });
  const lines: LineInput[] = body.items.map((raw, i) => {
    if (!isObj(raw)) throw new ApiError(422, "invalid_field", `items[${i}] must be an object.`, { field: `items[${i}]` });
    const sku = text(raw.sku, 120) || undefined;
    const productId = text(raw.product_id, 120) || undefined;
    const variantId = text(raw.variant_id, 120) || undefined;
    if (!sku && !(productId && variantId)) throw new ApiError(422, "invalid_field", `items[${i}] needs a "sku", or both "product_id" and "variant_id".`, { field: `items[${i}]` });
    const qty = Number(raw.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) throw new ApiError(422, "invalid_field", `items[${i}].qty must be a whole number from 1 to 100.`, { field: `items[${i}].qty` });
    const unitPrice = raw.unit_price === undefined || raw.unit_price === null ? undefined : money(raw.unit_price, `items[${i}].unit_price`);
    const discount = raw.discount === undefined || raw.discount === null ? 0 : money(raw.discount, `items[${i}].discount`);
    return { sku, productId, variantId, qty, unitPrice, discount };
  });

  const deliveryCharge = body.delivery_charge === undefined || body.delivery_charge === null ? 0 : money(body.delivery_charge, "delivery_charge", { max: 100_000 });
  const district = text(c.district, 60) || undefined;
  const area = text(c.area, 60) || undefined;
  return { externalId, name, phone, altPhone, address, district, area, notes: text(body.notes, 1000) || undefined, deliveryCharge, lines };
}

// ── Helpers ────────────────────────────────────────────────────────────────

type Q = Pick<PoolClient, "query">;

async function lockProducts(client: Q, ids: string[]): Promise<Map<string, { product: Product; version: number }>> {
  const { rows } = await client.query("select id, data, version from app_records where collection = 'products' and id = any($1::text[]) order by id for update", [ids]);
  return new Map(rows.map((r) => [r.id as string, { product: r.data as Product, version: r.version as number }]));
}

async function saveProducts(client: Q, changed: Product[], actor: string) {
  for (const p of changed) {
    await client.query("update app_records set data = $2::jsonb, version = version + 1, updated_at = now(), updated_by = $3 where collection = 'products' and id = $1", [p.id, JSON.stringify(p), actor]);
  }
  if (changed.length) await bumpRev(client, "products");
}

const itemsKey = (i: { productId: string; variantId: string }) => `${i.productId}::${i.variantId}`;

function withVariants(p: Product, fn: (v: Variant) => Variant | null): Product {
  return { ...p, variants: p.variants.map((v) => fn(v) ?? v) };
}

// ── Create ─────────────────────────────────────────────────────────────────

export async function createApiOrder(req: NextRequest, key: ApiKeyAuth, input: CreateInput): Promise<{ order: Order; duplicate: boolean }> {
  const actor = `api:${key.id}`;
  const actorName = `API · ${key.name}`;

  const result = await tx(async (client) => {
    // Same external id arriving twice at once (double click, retry) → the second waits, then sees the first.
    await client.query("select pg_advisory_xact_lock(hashtext($1))", [`api-order:${key.name}:${input.externalId}`]);
    const dup = await client.query("select data from app_records where collection = 'orders' and data->>'channel' = $1 and data->>'externalId' = $2 limit 1", [key.name, input.externalId]);
    if (dup.rows[0]) return { order: dup.rows[0].data as Order, duplicate: true };

    // 1) Find which product each line refers to.
    const productIdByLine: string[] = [];
    for (const [i, line] of input.lines.entries()) {
      if (line.productId) {
        productIdByLine.push(line.productId);
        continue;
      }
      const found = await client.query("select id from app_records where collection = 'products' and data @> $1::jsonb limit 2", [JSON.stringify({ variants: [{ sku: line.sku }] })]);
      if (found.rows.length === 0) throw new ApiError(422, "unknown_sku", `No product has the SKU "${line.sku}".`, { field: `items[${i}].sku`, sku: line.sku });
      if (found.rows.length > 1) throw new ApiError(422, "ambiguous_sku", `The SKU "${line.sku}" belongs to more than one product. Send product_id and variant_id instead.`, { field: `items[${i}].sku`, sku: line.sku });
      productIdByLine.push(found.rows[0].id);
    }

    // 2) Lock those products (in id order, so two orders can't deadlock), then check stock.
    const locked = await lockProducts(client, [...new Set(productIdByLine)]);
    const items: OrderItem[] = [];
    const need = new Map<string, { qty: number; product: Product; variant: Variant }>();
    for (const [i, line] of input.lines.entries()) {
      const entry = locked.get(productIdByLine[i]);
      if (!entry) throw new ApiError(422, "unknown_product", `Product ${productIdByLine[i]} doesn't exist.`, { field: `items[${i}]` });
      const product = entry.product;
      const variant = line.variantId ? product.variants.find((v) => v.id === line.variantId) : product.variants.find((v) => v.sku === line.sku);
      if (!variant) throw new ApiError(422, "unknown_variant", `${product.name} has no such variant.`, { field: `items[${i}]` });
      if (product.status !== "active" || variant.status !== "active") throw new ApiError(422, "product_unavailable", `${product.name} (${variant.color}/${variant.size}) is not available for sale.`, { field: `items[${i}]`, sku: variant.sku });
      const price = line.unitPrice ?? variant.price;
      if (line.discount > price * line.qty) throw new ApiError(422, "invalid_field", `items[${i}].discount can't be more than the line total.`, { field: `items[${i}].discount` });
      items.push({ id: crypto.randomUUID(), productId: product.id, productName: product.name, variantId: variant.id, color: variant.color, size: variant.size, sku: variant.sku, price, qty: line.qty, discount: line.discount });
      const k = itemsKey({ productId: product.id, variantId: variant.id });
      const cur = need.get(k);
      need.set(k, { qty: (cur?.qty ?? 0) + line.qty, product, variant });
    }
    const short = [...need.values()]
      .map((n) => ({ sku: n.variant.sku, name: n.product.name, color: n.variant.color, size: n.variant.size, requested: n.qty, available: Math.max(0, n.variant.stock - (n.variant.reserved ?? 0)) }))
      .filter((n) => n.requested > n.available);
    if (short.length) throw new ApiError(409, "insufficient_stock", "Not enough stock for one or more items.", { items: short });

    // 3) Reserve the stock — exactly what the dashboard does when staff create an order.
    const before = new Map([...locked].map(([id, e]) => [id, e.product]));
    const after: Product[] = [];
    for (const [id, e] of locked) {
      const next = withVariants(e.product, (v) => {
        const n = need.get(itemsKey({ productId: id, variantId: v.id }));
        return n ? { ...v, reserved: (v.reserved ?? 0) + n.qty } : null;
      });
      after.push(next);
    }
    await saveProducts(client, after, actor);

    // 4) Number, build and store the order.
    const settingsRow = await client.query("select data->'invoice'->'numbering'->>'order' as prefix from app_documents where key = 'settings'");
    const prefix: string = settingsRow.rows[0]?.prefix ?? "ORD-";
    const counter = await client.query("insert into app_counters (name, value) values ('order', $1::bigint + 1) on conflict (name) do update set value = app_counters.value + 1 returning value::text", [COUNTER_START.order]);
    const number = Number(counter.rows[0].value) - 1;
    const now = new Date().toISOString();
    const geo = detectDistrictArea(input.address);
    const order: Order = {
      id: crypto.randomUUID(),
      orderNumber: `${prefix}${number}`,
      status: "pending",
      customerName: input.name,
      phone: input.phone,
      altPhone: input.altPhone,
      address: input.address,
      district: input.district ?? geo.district,
      area: input.area ?? geo.area,
      notes: input.notes,
      items,
      deliveryCharge: input.deliveryCharge,
      source: "api",
      channel: key.name,
      externalId: input.externalId,
      courier: { company: "", trackingId: "", forwardCost: 0, returnCost: 0, otherCost: 0 },
      delivery: { customerPaid: 0 },
      returnInfo: { returnRequired: false, returnReceived: false },
      cancellation: {},
      activity: [{ id: crypto.randomUUID(), at: now, label: "Order Created", detail: `Placed via ${key.name} (${input.externalId})`, by: actorName }],
      createdAt: now,
      updatedAt: now,
    };
    await client.query("insert into app_records (collection, id, data, updated_by) values ('orders', $1, $2::jsonb, $3)", [order.id, JSON.stringify(order), actor]);
    await bumpRev(client, "orders");

    // 5) Events + audit, in the same transaction.
    const events: DomainEvent[] = [...orderEvents(null, order)];
    for (const p of after) events.push(...productEvents(before.get(p.id), p));
    await enqueueEvents(client, events);
    await writeAudit(req, { userId: null, userName: actorName, module: "Orders", action: "create", entity: `Order ${order.orderNumber}`, summary: `Order ${order.orderNumber} created via API (${key.name}, ref ${input.externalId})`, after: { channel: key.name, externalId: input.externalId, items: items.length } }, client);
    return { order, duplicate: false };
  });
  return result;
}

// ── Read / cancel (limited to the calling key's own orders) ────────────────

export async function findOwnOrder(key: ApiKeyAuth, ref: string): Promise<{ order: Order; version: number } | null> {
  const { rows } = await query<{ data: Order; version: number }>(
    `select data, version from app_records
      where collection = 'orders' and data->>'channel' = $1 and (id = $2 or data->>'orderNumber' = $2 or data->>'externalId' = $2)
      order by (id = $2) desc limit 1`,
    [key.name, ref]
  );
  return rows[0] ? { order: rows[0].data, version: rows[0].version } : null;
}

export async function cancelApiOrder(req: NextRequest, key: ApiKeyAuth, ref: string, reason: string, notes?: string): Promise<Order> {
  const actor = `api:${key.id}`;
  const actorName = `API · ${key.name}`;
  return tx(async (client) => {
    const found = await client.query(
      `select id, data from app_records where collection = 'orders' and data->>'channel' = $1 and (id = $2 or data->>'orderNumber' = $2 or data->>'externalId' = $2) order by (id = $2) desc limit 1 for update`,
      [key.name, ref]
    );
    if (!found.rows[0]) throw new ApiError(404, "not_found", "No such order for this API key.");
    const prev = found.rows[0].data as Order;
    if (prev.status === "cancelled") return prev; // already done — cancelling twice is not an error

    const settingsRow = await client.query("select data->'orders'->'cancelAllowedStatuses' as allowed from app_documents where key = 'settings'");
    const allowed: string[] = settingsRow.rows[0]?.allowed ?? ["pending", "processing"];
    if (!allowed.includes(prev.status)) throw new ApiError(409, "cannot_cancel", `This order is "${prev.status}" and can no longer be cancelled — it has already reached the courier or is finished.`, { status: prev.status });

    const locked = await lockProducts(client, [...new Set(prev.items.map((i) => i.productId))]);
    const before = new Map([...locked].map(([id, e]) => [id, e.product]));
    const release = new Map<string, number>();
    for (const i of prev.items) release.set(itemsKey(i), (release.get(itemsKey(i)) ?? 0) + i.qty);
    const after: Product[] = [];
    for (const [id, e] of locked) {
      after.push(withVariants(e.product, (v) => {
        const q = release.get(itemsKey({ productId: id, variantId: v.id }));
        return q ? { ...v, reserved: Math.max(0, (v.reserved ?? 0) - q) } : null;
      }));
    }
    await saveProducts(client, after, actor);

    const now = new Date().toISOString();
    const next: Order = {
      ...prev,
      status: "cancelled",
      cancellation: { cancelledAt: now, cancelledBy: actorName, reason, notes },
      activity: [...prev.activity, { id: crypto.randomUUID(), at: now, label: "Cancelled", detail: reason, by: actorName }],
      updatedAt: now,
    };
    await client.query("update app_records set data = $2::jsonb, version = version + 1, updated_at = now(), updated_by = $3 where collection = 'orders' and id = $1", [next.id, JSON.stringify(next), actor]);
    await bumpRev(client, "orders");

    const events: DomainEvent[] = [...orderEvents(prev, next)];
    for (const p of after) events.push(...productEvents(before.get(p.id), p));
    await enqueueEvents(client, events);
    await writeAudit(req, { userId: null, userName: actorName, module: "Orders", action: "status_change", entity: `Order ${next.orderNumber}`, summary: `Order ${next.orderNumber} cancelled via API (${reason})`, before: { status: prev.status }, after: { status: "cancelled" } }, client);
    return next;
  });
}
