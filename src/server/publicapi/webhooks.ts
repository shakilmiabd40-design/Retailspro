import "server-only";
import crypto from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import type { PoolClient } from "pg";
import { query } from "../db";
import { ApiError } from "../http";
import type { Order } from "@/lib/orders/types";
import type { Product } from "@/lib/products/types";
import { toApiOrder, toApiProduct } from "./serialize";
import { API_VERSION } from "./http";

/**
 * Outgoing webhooks.
 *
 * Every change to an order or product — whether made in the dashboard, the POS or through the public API —
 * is turned into events by comparing the record before and after. The events are written to an outbox
 * table in the SAME database transaction as the change (so a change can never be saved without its
 * event, or the reverse), then delivered right after the response is sent. Failed deliveries are retried
 * with back-off by whichever request or cron call runs next.
 */

export const EVENT_TYPES = [
  "order.created",
  "order.status_changed",
  "order.updated",
  "stock.updated",
  "product.created",
  "product.updated",
  "product.deleted",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const isEventType = (s: unknown): s is EventType => typeof s === "string" && (EVENT_TYPES as readonly string[]).includes(s);

export interface DomainEvent {
  type: EventType;
  data: Record<string, unknown>;
}

// ── Diffing ────────────────────────────────────────────────────────────────

const changedKeys = (a: Record<string, unknown>, b: Record<string, unknown>, ignore: string[]) =>
  Object.keys(b).filter((k) => !ignore.includes(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]));

export function orderEvents(prev: Order | undefined | null, next: Order): DomainEvent[] {
  const after = toApiOrder(next);
  if (!prev) return [{ type: "order.created", data: { order: after } }];
  const before = toApiOrder(prev);
  const changed = changedKeys(before, after, ["timeline", "updated_at"]);
  if (prev.status !== next.status) return [{ type: "order.status_changed", data: { previous_status: prev.status, changed_fields: changed, order: after } }];
  if (changed.length) return [{ type: "order.updated", data: { changed_fields: changed, order: after } }];
  return [];
}

/** `next === null` means the product was deleted. */
export function productEvents(prev: Product | undefined | null, next: Product | null): DomainEvent[] {
  if (!next) return prev ? [{ type: "product.deleted", data: { product_id: prev.id, sku: prev.sku, name: prev.name } }] : [];
  const after = toApiProduct(next);
  if (!prev) {
    return [{ type: "product.created", data: { product: after } }];
  }
  const before = toApiProduct(prev);
  const events: DomainEvent[] = [];

  // Stock: per-variant, only the variants whose numbers moved.
  const prevById = new Map(before.variants.map((v) => [v.id, v]));
  const moved = after.variants.filter((v) => {
    const p = prevById.get(v.id);
    return !p || p.stock !== v.stock || p.reserved !== v.reserved;
  });
  if (moved.length) {
    events.push({
      type: "stock.updated",
      data: { product_id: after.id, product_sku: after.sku, product_name: after.name, total_available: after.total_available, variants: moved.map((v) => ({ id: v.id, sku: v.sku, color: v.color, size: v.size, stock: v.stock, reserved: v.reserved, available: v.available })) },
    });
  }

  // Everything else (name, price, images, status, new/removed variants…).
  const strip = (p: typeof after) => ({ ...p, total_available: undefined, variants: p.variants.map((v) => ({ ...v, stock: undefined, reserved: undefined, available: undefined })) });
  const changed = changedKeys(strip(before) as Record<string, unknown>, strip(after) as Record<string, unknown>, []);
  if (changed.length) events.push({ type: "product.updated", data: { changed_fields: changed, product: after } });
  return events;
}

// ── Outbox ─────────────────────────────────────────────────────────────────

/** Writes one delivery row per matching active webhook. Call inside the transaction that made the change. */
export async function enqueueEvents(client: Pick<PoolClient, "query">, events: DomainEvent[]): Promise<number> {
  if (!events.length) return 0;
  const { rows: hooks } = await client.query<{ id: string; events: string[] }>("select id, events from app_webhooks where active");
  if (!hooks.length) return 0;
  const createdAt = new Date().toISOString();
  let n = 0;
  for (const ev of events) {
    for (const h of hooks) {
      if (!h.events.includes("*") && !h.events.includes(ev.type)) continue;
      const id = `evt_${crypto.randomBytes(12).toString("hex")}`;
      const payload = { id, type: ev.type, api_version: API_VERSION, created_at: createdAt, data: ev.data };
      await client.query("insert into app_webhook_deliveries (id, webhook_id, event_type, payload) values ($1,$2,$3,$4::jsonb)", [id, h.id, ev.type, JSON.stringify(payload)]);
      n += 1;
    }
  }
  return n;
}

// ── Safety: where we're willing to send requests ───────────────────────────

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::") return true;
    if (v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPrivateIp(mapped[1]);
  }
  return false;
}

const isDev = () => process.env.NODE_ENV !== "production";

/** Webhook targets must be public https URLs (http + localhost are allowed only when running `npm run dev`). */
export function validateWebhookUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ApiError(400, "invalid", "The webhook URL isn't a valid URL.");
  }
  if (u.username || u.password) throw new ApiError(400, "invalid", "Put credentials in the signature check, not in the URL.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const local = host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || (net.isIP(host) && isPrivateIp(host));
  if (local && !isDev()) throw new ApiError(400, "invalid", "The webhook URL must be a public address.");
  if (u.protocol !== "https:" && !(isDev() && u.protocol === "http:")) throw new ApiError(400, "invalid", "The webhook URL must start with https://");
  return u;
}

async function assertPublicHost(u: URL) {
  if (isDev()) return;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Blocked: private address");
    return;
  }
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Blocked: resolves to a private address");
}

// ── Delivery ───────────────────────────────────────────────────────────────

export const sign = (secret: string, timestamp: string, body: string) => `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

/** Wait before retry n (n = attempts made so far): 1 min, 5 min, 30 min, 2 h, 6 h, 12 h — then give up. */
const RETRY_DELAYS_S = [60, 300, 1800, 7200, 21600, 43200];
const TIMEOUT_MS = 8000;

interface DeliveryRow {
  id: string;
  seq?: string;
  webhook_id: string;
  event_type: string;
  payload: unknown;
  attempts: number;
}
interface HookRow {
  id: string;
  url: string;
  secret: string;
  active: boolean;
}

async function attempt(d: DeliveryRow, hook: HookRow | undefined): Promise<{ ok: boolean; status: number | null; error: string | null; final?: boolean }> {
  if (!hook || !hook.active) return { ok: false, status: null, error: "Webhook is disabled or deleted", final: true };
  const body = JSON.stringify(d.payload);
  const ts = String(Math.floor(Date.now() / 1000));
  try {
    const u = validateWebhookUrl(hook.url);
    await assertPublicHost(u);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(u, {
        method: "POST",
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "RetailPro-Webhooks/1.0",
          "X-RetailPro-Event": d.event_type,
          "X-RetailPro-Delivery": d.id,
          "X-RetailPro-Timestamp": ts,
          "X-RetailPro-Signature": sign(hook.secret, ts, body),
        },
        body,
      });
      await res.arrayBuffer().catch(() => undefined);
      if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, error: null };
      return { ok: false, status: res.status, error: res.status >= 300 && res.status < 400 ? "Redirects aren't followed — use the final URL" : `HTTP ${res.status}` };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    const e = err as { name?: string; message?: string };
    return { ok: false, status: null, error: e?.name === "AbortError" ? `Timed out after ${TIMEOUT_MS / 1000}s` : (e?.message ?? "Request failed").slice(0, 300) };
  }
}

async function record(d: DeliveryRow, r: Awaited<ReturnType<typeof attempt>>) {
  if (r.ok) {
    await query("update app_webhook_deliveries set status='delivered', delivered_at=now(), last_status=$2, last_error=null where id=$1", [d.id, r.status]);
    await query("update app_webhooks set consecutive_failures = 0 where id = $1", [d.webhook_id]);
    return;
  }
  const delay = RETRY_DELAYS_S[d.attempts - 1];
  const giveUp = r.final || delay === undefined;
  await query(
    `update app_webhook_deliveries set status = $2, last_status = $3, last_error = $4,
       next_attempt_at = now() + ($5 || ' seconds')::interval where id = $1`,
    [d.id, giveUp ? "failed" : "pending", r.status, r.error, String(delay ?? 0)]
  );
  await query("update app_webhooks set consecutive_failures = consecutive_failures + 1 where id = $1", [d.webhook_id]);
}

/** Sends everything that is due (new events and retries). Safe to call from many places at once. */
export async function deliverDue(limit = 25): Promise<{ delivered: number; failed: number }> {
  // Claim rows so two callers never send the same event; if we crash mid-send it comes back in 5 minutes.
  const { rows } = await query<DeliveryRow>(
    `update app_webhook_deliveries d set attempts = d.attempts + 1, next_attempt_at = now() + interval '5 minutes'
      where d.id in (select id from app_webhook_deliveries where status = 'pending' and next_attempt_at <= now() order by seq limit $1 for update skip locked)
      returning d.id, d.seq::text, d.webhook_id, d.event_type, d.payload, d.attempts`,
    [limit]
  );
  if (!rows.length) return { delivered: 0, failed: 0 };
  const { rows: hooks } = await query<HookRow>("select id, url, secret, active from app_webhooks where id = any($1::text[])", [[...new Set(rows.map((r) => r.webhook_id))]]);
  const byId = new Map(hooks.map((h) => [h.id, h]));
  let delivered = 0;
  let failed = 0;

  // One webhook at a time in the order the events happened; different webhooks in parallel.
  const perHook = new Map<string, DeliveryRow[]>();
  for (const d of [...rows].sort((a, b) => Number(a.seq) - Number(b.seq))) perHook.set(d.webhook_id, [...(perHook.get(d.webhook_id) ?? []), d]);
  await Promise.all(
    [...perHook.values()].map(async (queue) => {
      for (const d of queue) {
        const r = await attempt(d, byId.get(d.webhook_id));
        await record(d, r);
        if (r.ok) delivered += 1;
        else failed += 1;
      }
    })
  );
  return { delivered, failed };
}

/** "Send test event" button: one `ping` event, sent immediately, result returned to the admin. */
export async function sendTestPing(webhookId: string) {
  const id = `evt_${crypto.randomBytes(12).toString("hex")}`;
  const payload = { id, type: "ping", api_version: API_VERSION, created_at: new Date().toISOString(), data: { message: "This is a test event from RetailPro." } };
  await query("insert into app_webhook_deliveries (id, webhook_id, event_type, payload, attempts, next_attempt_at) values ($1,$2,'ping',$3::jsonb,1, now() + interval '100 years')", [id, webhookId, JSON.stringify(payload)]);
  const { rows } = await query<HookRow>("select id, url, secret, active from app_webhooks where id = $1", [webhookId]);
  const d: DeliveryRow = { id, webhook_id: webhookId, event_type: "ping", payload, attempts: 1 };
  const r = await attempt(d, rows[0] && { ...rows[0], active: true });
  // A test never retries: mark it finished either way.
  await query("update app_webhook_deliveries set status = $2, last_status = $3, last_error = $4, delivered_at = case when $2 = 'delivered' then now() end where id = $1", [id, r.ok ? "delivered" : "failed", r.status, r.error]);
  return { ok: r.ok, status: r.status, error: r.error };
}
