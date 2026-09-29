import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { sendTestPing } from "@/server/publicapi/webhooks";

export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Sends one signed `ping` event to the webhook right now and reports what the other side answered. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await requireAuth(req, { superAdmin: true });
  const { id } = await ctx.params;
  const exists = await query("select 1 from app_webhooks where id = $1", [id]);
  if (!exists.rows.length) throw new ApiError(404, "not_found", "No such webhook.");
  return json(await sendTestPing(id));
});
