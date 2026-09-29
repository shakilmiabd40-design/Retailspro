import { NextResponse } from "next/server";
import { query } from "@/server/db";
import { ApiError, readJson, route, str } from "@/server/http";
import { createSession, dummyVerify, loadSecurity, verifyPassword } from "@/server/auth";
import { writeAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

interface UserRow {
  id: string;
  name: string;
  status: string;
  password_hash: string;
  must_reset_password: boolean;
  failed_attempts: number;
  locked_until: Date | null;
}

const GENERIC = "That email / username or password isn't right.";

export const POST = route(async (req) => {
  const body = await readJson<{ email?: string; password?: string }>(req);
  const email = str(body.email, 200);
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : "";
  if (!email || !password) throw new ApiError(400, "invalid", "Enter your email / username and password.");

  const { rows } = await query<UserRow>(
    "select id, name, status, password_hash, must_reset_password, failed_attempts, locked_until from app_users where lower(email) = lower($1)",
    [email]
  );
  const user = rows[0];
  if (!user) {
    await dummyVerify(password);
    throw new ApiError(401, "invalid_credentials", GENERIC);
  }

  const security = await loadSecurity();
  if (user.locked_until && user.locked_until.getTime() > Date.now()) {
    const mins = Math.ceil((user.locked_until.getTime() - Date.now()) / 60_000);
    throw new ApiError(423, "locked", `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`);
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    const attempts = user.failed_attempts + 1;
    const lock = attempts >= security.maxLoginAttempts;
    await query("update app_users set failed_attempts = $2, locked_until = $3 where id = $1", [
      user.id,
      lock ? 0 : attempts,
      lock ? new Date(Date.now() + security.lockoutMinutes * 60_000) : null,
    ]);
    await writeAudit(req, { userId: user.id, userName: user.name, module: "Security", action: "security", entity: `User ${user.name}`, summary: lock ? `Account locked for ${security.lockoutMinutes} min after ${security.maxLoginAttempts} failed sign-ins` : `Failed sign-in (${attempts} of ${security.maxLoginAttempts})` });
    if (lock) throw new ApiError(423, "locked", `Too many failed attempts. Try again in ${security.lockoutMinutes} minutes.`);
    throw new ApiError(401, "invalid_credentials", GENERIC);
  }

  // Only reveal "deactivated" once the password is proven right.
  if (user.status !== "active") throw new ApiError(403, "blocked", "This account has been deactivated. Ask a Super Admin to reactivate it.");

  await query("update app_users set failed_attempts = 0, locked_until = null, last_login = now() where id = $1", [user.id]);
  await writeAudit(req, { userId: user.id, userName: user.name, module: "Security", action: "security", entity: `User ${user.name}`, summary: "Signed in" });

  const res = NextResponse.json({ ok: true, mustResetPassword: user.must_reset_password });
  await createSession(req, res, user.id);
  return res;
});
