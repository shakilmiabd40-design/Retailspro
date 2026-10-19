import "server-only";
import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { query } from "../db";
import { ApiError } from "../http";

/**
 * Public API keys. Only the SHA-256 of a key is stored, so a database leak doesn't leak working keys.
 * A key is shown once, at creation. Keys are meant for SERVER-TO-SERVER calls (the website's backend),
 * never for code that runs in a visitor's browser.
 */
export const API_SCOPES = ["products:read", "orders:read", "orders:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_LABELS: Record<ApiScope, string> = {
  "products:read": "Read products & live stock",
  "orders:read": "Read this key's own orders",
  "orders:write": "Create orders & cancel this key's own orders",
};

export interface ApiKeyAuth {
  id: string;
  /** Unique name; also stored on every order this key creates as its `channel`. */
  name: string;
  scopes: ApiScope[];
}

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

export function generateApiKey() {
  const key = `rp_live_${crypto.randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, 12), hash: sha256(key) };
}

export const isScope = (s: unknown): s is ApiScope => typeof s === "string" && (API_SCOPES as readonly string[]).includes(s);

// Best-effort, per server instance. Stops a runaway loop on the website side from hammering the shop database.
const WINDOW_MS = 60_000;
const LIMIT_PER_WINDOW = 120;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(keyId: string) {
  const now = Date.now();
  let b = buckets.get(keyId);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(keyId, b);
    if (buckets.size > 500) for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  b.count += 1;
  if (b.count > LIMIT_PER_WINDOW) {
    throw new ApiError(429, "rate_limited", `Too many requests. Limit is ${LIMIT_PER_WINDOW} per minute per key.`, { retry_after_seconds: Math.ceil((b.resetAt - now) / 1000) });
  }
}

function tokenFrom(req: NextRequest): string {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  return (m?.[1] ?? req.headers.get("x-api-key") ?? "").trim();
}

/** Validates the API key on a request and that it carries `scope`. Throws 401 / 403 / 429. */
export async function authenticateApiKey(req: NextRequest, scope: ApiScope | null): Promise<ApiKeyAuth> {
  const token = tokenFrom(req);
  if (!token) throw new ApiError(401, "missing_api_key", "Send your key as  Authorization: Bearer <key>.");
  const { rows } = await query<{ id: string; name: string; scopes: string[]; status: string }>("select id, name, scopes, status from app_api_keys where key_hash = $1", [sha256(token)]);
  const row = rows[0];
  if (!row || row.status !== "active") throw new ApiError(401, "invalid_api_key", "This API key is not valid (it may have been revoked).");
  rateLimit(row.id);
  if (scope && !row.scopes.includes(scope)) throw new ApiError(403, "insufficient_scope", `This key doesn't have the "${scope}" permission.`, { required_scope: scope });
  await query("update app_api_keys set last_used_at = now() where id = $1 and (last_used_at is null or last_used_at < now() - interval '1 minute')", [row.id]);
  return { id: row.id, name: row.name, scopes: row.scopes.filter(isScope) };
}
