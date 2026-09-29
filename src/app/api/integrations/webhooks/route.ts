import crypto from "node:crypto";
import { query } from "@/server/db";
import { ApiError, json, readJson, route, str } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { EVENT_TYPES, isEventType, validateWebhookUrl } from "@/server/publicapi/webhooks";

export const dynamic = "force-dynamic";

interface HookRow {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  consecutive_failures: number;
  created_at: Date;
  pending: string;
  failed: string;
  last_delivered: Date | null;
}

const toHook = (r: HookRow) => ({
  id: r.id,
  name: r.name,
  url: r.url,
  secret: r.secret,
  events: r.events,
  active: r.active,
  consecutiveFailures: r.consecutive_failures,
  createdAt: r.created_at.toISOString(),
  pending: Number(r.pending),
  failed: Number(r.failed),
  lastDeliveredAt: r.last_delivered?.toISOString() ?? null,
});

const HOOK_SELECT = `select w.id, w.name, w.url, w.secret, w.events, w.active, w.consecutive_failures, w.created_at,
  (select count(*) from app_webhook_deliveries d where d.webhook_id = w.id and d.status = 'pending') as pending,
  (select count(*) from app_webhook_deliveries d where d.webhook_id = w.id and d.status = 'failed') as failed,
  (select max(delivered_at) from app_webhook_deliveries d where d.webhook_id = w.id) as last_delivered
  from app_webhooks w`;

function parseEvents(v: unknown): string[] {
  const list = Array.isArray(v) ? v : [];
  if (list.includes("*")) return ["*"];
  const events = [...new Set(list.filter(isEventType))];
  if (!events.length) throw new ApiError(400, "invalid", "Pick at least one event to send.");
  return events;
}

export const GET = route(async (req) => {
  await requireAuth(req, { superAdmin: true });
  const { rows } = await query<HookRow>(`${HOOK_SELECT} order by w.created_at desc`);
  return json({ webhooks: rows.map(toHook), eventTypes: EVENT_TYPES });
});

export const POST = route(async (req) => {
  const auth = await requireAuth(req, { superAdmin: true });
  const b = await readJson<{ name?: string; url?: string; events?: unknown }>(req);
  const url = validateWebhookUrl(str(b.url, 500)).toString();
  const events = parseEvents(b.events);
  const id = `wh_${crypto.randomBytes(8).toString("hex")}`;
  const secret = `whsec_${crypto.randomBytes(32).toString("base64url")}`;
  await query("insert into app_webhooks (id, name, url, secret, events) values ($1,$2,$3,$4,$5)", [id, str(b.name, 80), url, secret, events]);
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Settings", action: "create", entity: `Webhook ${str(b.name, 80) || url}`, summary: `Added webhook to ${url}`, after: { url, events } });
  const { rows } = await query<HookRow>(`${HOOK_SELECT} where w.id = $1`, [id]);
  return json({ webhook: toHook(rows[0]) });
});
