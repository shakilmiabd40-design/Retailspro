import { NextResponse } from "next/server";
import { query } from "@/server/db";
import { ApiError, readJson, route } from "@/server/http";
import { createSession, hashPassword, loadSecurity, requireAuth, verifyPassword } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { passwordProblems } from "@/lib/settings/security";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const auth = await requireAuth(req, { allowMustReset: true });
  const body = await readJson<{ currentPassword?: string; newPassword?: string }>(req);
  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body.newPassword === "string" ? body.newPassword : "";

  const { rows } = await query<{ password_hash: string }>("select password_hash from app_users where id = $1", [auth.user.id]);
  if (!rows[0] || !(await verifyPassword(current, rows[0].password_hash))) throw new ApiError(400, "wrong_password", "Your current password isn't right.");
  if (current === next) throw new ApiError(400, "same_password", "Choose a password different from the current one.");

  const security = await loadSecurity();
  const problems = passwordProblems(next, security);
  if (problems.length) throw new ApiError(400, "weak_password", `Password needs: ${problems.join(", ").toLowerCase()}.`);

  await query("update app_users set password_hash = $2, must_reset_password = false, failed_attempts = 0, locked_until = null where id = $1", [auth.user.id, await hashPassword(next)]);
  // Every other device signs out; this one gets a fresh session.
  await query("delete from app_sessions where user_id = $1", [auth.user.id]);
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Security", action: "security", entity: `User ${auth.user.name}`, summary: "Changed their password" });

  const res = NextResponse.json({ ok: true });
  await createSession(req, res, auth.user.id);
  return res;
});
