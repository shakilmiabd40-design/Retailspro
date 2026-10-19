import { query } from "@/server/db";
import { ApiError, json, readJson, route, str } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { cleanPermissions, roleFromRow, type RoleRow } from "@/server/roles";

export const dynamic = "force-dynamic";

/** Everyone signed in can read roles (names show up next to users); only Settings access changes them. */
export const GET = route(async (req) => {
  await requireAuth(req, { allowMustReset: true });
  const { rows } = await query<RoleRow>("select * from app_roles order by built_in desc, created_at asc");
  return json({ roles: rows.map(roleFromRow) });
});

export const POST = route(async (req) => {
  const auth = await requireAuth(req, { anyOf: [["settings", "settings"]] });
  const b = await readJson<{ name?: string; description?: string; permissions?: unknown }>(req);
  const name = str(b.name, 80);
  if (!name) throw new ApiError(400, "invalid", "Role name is required.");
  const dupe = await query("select 1 from app_roles where lower(name) = lower($1)", [name]);
  if (dupe.rows.length) throw new ApiError(409, "duplicate", "A role with that name already exists.");
  const permissions = cleanPermissions(b.permissions);
  const id = `role-${crypto.randomUUID().slice(0, 8)}`;
  const { rows } = await query<RoleRow>(
    "insert into app_roles (id, name, description, built_in, locked, permissions) values ($1,$2,$3,false,false,$4::jsonb) returning *",
    [id, name, str(b.description, 500), JSON.stringify(permissions)]
  );
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Users & Roles", action: "create", entity: `Role ${name}`, summary: `Created role ${name}`, after: permissions });
  return json({ role: roleFromRow(rows[0]) });
});
