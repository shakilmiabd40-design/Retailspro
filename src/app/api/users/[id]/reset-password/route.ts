import { query, tx } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { hashPassword, loadSecurity, requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { generateTempPassword } from "@/lib/settings/security";

export const dynamic = "force-dynamic";

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const auth = await requireAuth(req, { anyOf: [["settings", "settings"]] });
  const { id } = await params;
  const { rows } = await query<{ name: string }>("select name from app_users where id = $1", [id]);
  if (!rows[0]) throw new ApiError(404, "not_found", "User not found.");

  const security = await loadSecurity();
  const tempPassword = generateTempPassword(security);
  const hash = await hashPassword(tempPassword);
  await tx(async (client) => {
    await client.query("update app_users set password_hash = $2, must_reset_password = $3, failed_attempts = 0, locked_until = null where id = $1", [id, hash, security.forceResetOnFirstLogin]);
    await client.query("delete from app_sessions where user_id = $1", [id]);
  });
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Security", action: "security", entity: `User ${rows[0].name}`, summary: `Password reset issued for ${rows[0].name}` });
  return json({ tempPassword });
});
