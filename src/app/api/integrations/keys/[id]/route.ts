import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

/** Revokes a key immediately. Orders it already created stay as they are. */
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const auth = await requireAuth(req, { superAdmin: true });
  const { id } = await ctx.params;
  const { rows } = await query<{ name: string }>("update app_api_keys set status = 'revoked' where id = $1 and status = 'active' returning name", [id]);
  if (!rows[0]) throw new ApiError(404, "not_found", "That key doesn't exist or is already revoked.");
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Security", action: "security", entity: `API key ${rows[0].name}`, summary: `Revoked API key “${rows[0].name}”` });
  return json({ ok: true });
});
