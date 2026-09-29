import { after } from "next/server";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { deliverDue } from "@/server/publicapi/webhooks";

export const dynamic = "force-dynamic";

/** Puts a failed delivery back in the queue (same event id) and sends it now. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireAuth(req, { superAdmin: true });
  const { id } = await ctx.params;
  const { rows } = await query("update app_webhook_deliveries set status = 'pending', attempts = 0, next_attempt_at = now() where id = $1 and status = 'failed' returning id", [id]);
  if (!rows[0]) throw new ApiError(404, "not_found", "That delivery isn't in a failed state.");
  after(() => deliverDue().catch((e) => console.error("[webhooks] deliver failed", e)));
  return json({ ok: true });
});
