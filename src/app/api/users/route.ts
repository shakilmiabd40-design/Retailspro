import crypto from "node:crypto";
import { query } from "@/server/db";
import { ApiError, json, readJson, route, str } from "@/server/http";
import { hashPassword, loadSecurity, requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { toUser, USER_SELECT, type UserRow } from "@/server/users";
import { generateTempPassword } from "@/lib/settings/security";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireAuth(req, { anyOf: [["settings", "settings"]] });
  const { rows } = await query<UserRow>(`${USER_SELECT} order by u.created_at desc`);
  return json({ users: rows.map(toUser) });
});

export const POST = route(async (req) => {
  const auth = await requireAuth(req, { anyOf: [["settings", "settings"]] });
  const b = await readJson<{ name?: string; email?: string; phone?: string; roleId?: string; status?: string; notes?: string; mustResetPassword?: boolean }>(req);
  const name = str(b.name, 120);
  const email = str(b.email, 200);
  if (!name) throw new ApiError(400, "invalid", "Name is required.");
  if (!email) throw new ApiError(400, "invalid", "Email / username is required.");
  const status = b.status === "blocked" ? "blocked" : "active";

  const role = await query<{ name: string }>("select name from app_roles where id = $1", [str(b.roleId, 100)]);
  if (!role.rows[0]) throw new ApiError(400, "invalid", "Choose a role.");
  const dupe = await query("select 1 from app_users where lower(email) = lower($1)", [email]);
  if (dupe.rows.length) throw new ApiError(409, "duplicate", "That email / username is already used by another user.");

  const security = await loadSecurity();
  const tempPassword = generateTempPassword(security);
  const id = crypto.randomUUID();
  await query(
    `insert into app_users (id, name, email, phone, role_id, status, password_hash, must_reset_password, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, name, email, str(b.phone, 40), str(b.roleId, 100), status, await hashPassword(tempPassword), security.forceResetOnFirstLogin || b.mustResetPassword !== false, str(b.notes, 1000) || null]
  );
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Users & Roles", action: "create", entity: `User ${name}`, summary: `Created user ${name} as ${role.rows[0].name}`, after: { email, role: role.rows[0].name, status } });

  const { rows } = await query<UserRow>(`${USER_SELECT} where u.id = $1`, [id]);
  return json({ user: toUser(rows[0]), tempPassword });
});
