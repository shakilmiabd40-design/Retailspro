import crypto from "node:crypto";
import { query } from "@/server/db";
import { ApiError, json, readJson, route, str } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { isEventType, validateWebhookUrl } from "@/server/publicapi/webhooks";

export const dynamic = "force-dynamic";

export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const auth = await requireAuth(req, { superAdmin: true });
  const { id } = await ctx.params;
  const b = await readJson<{ name?: string; url?: string; events?: unknown; active?: boolean; rotateSecret?: boolean }>(req);
  const sets: string[] = [];
  const params: unknown[] = [id];
  const set = (col: string, v: unknown) => {
    params.push(v);
    sets.push(`${col} = $${params.length}`);
  };
  if (b.name !== undefined) set("name", str(b.name, 80));
  if (b.url !== undefined) set("url", validateWebhookUrl(str(b.url, 500)).toString());
  if (b.events !== undefined) {
    const list = Array.isArray(b.events) ? b.events : [];
    const events = list.includes("*") ? ["*"] : [...new Set(list.filter(isEventType))];
    if (!events.length) throw new ApiError(400, "invalid", "Pick at least one event to send.");
    set("events", events);
  }
  if (typeof b.active === "boolean") {
    set("active", b.active);
    if (b.active) sets.push("consecutive_failures = 0");
  }
  if (b.rotateSecret) set("secret", `whsec_${crypto.randomBytes(32).toString("base64url")}`);
  if (!sets.length) throw new ApiError(400, "invalid", "Nothing to change.");
  const { rows } = await query<{ url: string; name: string }>(`update app_webhooks set ${sets.join(", ")} where id = $1 returning url, name`, params);
  if (!rows[0]) throw new ApiError(404, "not_found", "No such webhook.");
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Settings", action: "edit", entity: `Webhook ${rows[0].name || rows[0].url}`, summary: b.rotateSecret ? "Rotated webhook signing secret" : `Updated webhook (${Object.keys(b).join(", ")})` });
  return json({ ok: true });
});

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const auth = await requireAuth(req, { superAdmin: true });
  const { id } = await ctx.params;
  const { rows } = await query<{ url: string; name: string }>("delete from app_webhooks where id = $1 returning url, name", [id]);
  if (!rows[0]) throw new ApiError(404, "not_found", "No such webhook.");
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Settings", action: "delete", entity: `Webhook ${rows[0].name || rows[0].url}`, summary: `Deleted webhook to ${rows[0].url}` });
  return json({ ok: true });
});
