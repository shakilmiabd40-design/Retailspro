import crypto from "node:crypto";
import { query } from "@/server/db";
import { ApiError, json, readJson, route, str } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { API_SCOPES, generateApiKey, isScope } from "@/server/publicapi/apikeys";

export const dynamic = "force-dynamic";

interface KeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  status: string;
  created_at: Date;
  last_used_at: Date | null;
}

const toKey = (r: KeyRow) => ({ id: r.id, name: r.name, prefix: r.key_prefix, scopes: r.scopes, status: r.status, createdAt: r.created_at.toISOString(), lastUsedAt: r.last_used_at?.toISOString() ?? null });

/** Super Admin only: list API keys (never the key itself — only its first characters). */
export const GET = route(async (req) => {
  await requireAuth(req, { superAdmin: true });
  const { rows } = await query<KeyRow>("select id, name, key_prefix, scopes, status, created_at, last_used_at from app_api_keys order by created_at desc");
  return json({ keys: rows.map(toKey), scopes: API_SCOPES });
});

/** Creates a key. The full key is in this response and nowhere else — it can't be shown again. */
export const POST = route(async (req) => {
  const auth = await requireAuth(req, { superAdmin: true });
  const b = await readJson<{ name?: string; scopes?: unknown }>(req);
  const name = str(b.name, 60);
  if (name.length < 2) throw new ApiError(400, "invalid", "Give the key a name, e.g. “Sabsan website”.");
  const scopes = Array.isArray(b.scopes) ? [...new Set(b.scopes.filter(isScope))] : [];
  if (!scopes.length) throw new ApiError(400, "invalid", "Pick at least one permission.");

  const { key, prefix, hash } = generateApiKey();
  const id = crypto.randomUUID();
  try {
    await query("insert into app_api_keys (id, name, key_prefix, key_hash, scopes, created_by) values ($1,$2,$3,$4,$5,$6)", [id, name, prefix, hash, scopes, auth.user.id]);
  } catch (err) {
    if ((err as { code?: string }).code === "23505") throw new ApiError(409, "duplicate", "A key with that name already exists. Names must be unique because they identify where orders came from.");
    throw err;
  }
  await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Security", action: "security", entity: `API key ${name}`, summary: `Created API key “${name}” (${scopes.join(", ")})`, after: { name, scopes } });
  return json({ key, item: toKey({ id, name, key_prefix: prefix, scopes, status: "active", created_at: new Date(), last_used_at: null }) });
});
