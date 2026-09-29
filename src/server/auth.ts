import "server-only";
import crypto from "node:crypto";
import { promisify } from "node:util";
import type { NextRequest, NextResponse } from "next/server";
import { query } from "./db";
import { ApiError } from "./http";
import type { ActionKey, ModuleKey, PermissionMap, Role, SecuritySettings } from "@/lib/settings/types";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { SUPER_ADMIN_ROLE_ID } from "@/lib/settings/permissions";

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number, opts: crypto.ScryptOptions) => Promise<Buffer>;

export const SESSION_COOKIE = "rp_session";
const SESSION_MAX_DAYS = 30;
const TOUCH_EVERY_MS = 60_000;

// ── Passwords ──────────────────────────────────────────────────────────────

const N = 16384;
const R = 8;
const P = 1;

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Burns the same CPU as a real check so "unknown user" and "wrong password" take equally long. */
const DUMMY_HASH = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");
export async function dummyVerify(password: string) {
  await verifyPassword(password, DUMMY_HASH).catch(() => false);
}

// ── Sessions ───────────────────────────────────────────────────────────────

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

function isHttps(req: NextRequest) {
  return req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

export async function createSession(req: NextRequest, res: NextResponse, userId: string) {
  const token = crypto.randomBytes(32).toString("base64url");
  await query(
    `insert into app_sessions (token_hash, user_id, expires_at)
     values ($1, $2, now() + ($3 || ' days')::interval)`,
    [sha256(token), userId, String(SESSION_MAX_DAYS)]
  );
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.AUTH_COOKIE_SECURE ? process.env.AUTH_COOKIE_SECURE === "true" : isHttps(req),
    path: "/",
    maxAge: SESSION_MAX_DAYS * 24 * 3600,
  });
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

export async function destroySession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await query("delete from app_sessions where token_hash = $1", [sha256(token)]);
}

// ── Who is calling? ────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  roleId: string;
  status: "active" | "blocked";
  mustResetPassword: boolean;
  lastLogin: string | null;
}

export interface Auth {
  user: AuthUser;
  role: Role;
}

export function roleHas(role: Pick<Role, "locked" | "permissions" | "id">, module: ModuleKey, action: ActionKey = "view"): boolean {
  return role.locked === true || role.id === SUPER_ADMIN_ROLE_ID || !!(role.permissions as PermissionMap)[module]?.includes(action);
}

export async function loadSecurity(): Promise<SecuritySettings> {
  const { rows } = await query<{ data: { security?: Partial<SecuritySettings> } }>("select data from app_documents where key = 'settings'");
  return { ...DEFAULT_SETTINGS.security, ...(rows[0]?.data?.security ?? {}) };
}

interface SessionRow {
  token_hash: string;
  last_seen_at: Date;
  expires_at: Date;
  id: string;
  name: string;
  email: string;
  phone: string;
  role_id: string;
  status: "active" | "blocked";
  must_reset_password: boolean;
  last_login: Date | null;
  role_name: string;
  role_description: string;
  role_built_in: boolean;
  role_locked: boolean;
  role_permissions: PermissionMap;
  role_created_at: Date;
  timeout_minutes: string | null;
}

export interface RequireOpts {
  /** Any one of these module/action pairs is enough. */
  anyOf?: [ModuleKey, ActionKey][];
  superAdmin?: boolean;
  /** Let a user who still has to change their password through (the change-password endpoints). */
  allowMustReset?: boolean;
  /** Background polling shouldn't keep an idle session alive. */
  passive?: boolean;
}

/** Validates the session cookie and (optionally) the caller's permissions. Throws ApiError 401 / 403. */
export async function requireAuth(req: NextRequest, opts: RequireOpts = {}): Promise<Auth> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) throw new ApiError(401, "unauthenticated", "Please sign in.");
  const hash = sha256(token);

  const { rows } = await query<SessionRow>(
    `select s.token_hash, s.last_seen_at, s.expires_at,
            u.id, u.name, u.email, u.phone, u.role_id, u.status, u.must_reset_password, u.last_login,
            r.name as role_name, r.description as role_description, r.built_in as role_built_in, r.locked as role_locked,
            r.permissions as role_permissions, r.created_at as role_created_at,
            (select data->'security'->>'sessionTimeoutMinutes' from app_documents where key = 'settings') as timeout_minutes
       from app_sessions s
       join app_users u on u.id = s.user_id
       join app_roles r on r.id = u.role_id
      where s.token_hash = $1`,
    [hash]
  );
  const row = rows[0];
  if (!row) throw new ApiError(401, "unauthenticated", "Your session has ended. Please sign in again.");

  const now = Date.now();
  const timeoutMin = Number(row.timeout_minutes) > 0 ? Number(row.timeout_minutes) : DEFAULT_SETTINGS.security.sessionTimeoutMinutes;
  const idleExpired = now - row.last_seen_at.getTime() > timeoutMin * 60_000;
  if (row.expires_at.getTime() < now || idleExpired || row.status !== "active") {
    await query("delete from app_sessions where token_hash = $1", [hash]);
    throw new ApiError(401, idleExpired ? "session_expired" : "unauthenticated", idleExpired ? "You were signed out after being inactive." : "Please sign in again.");
  }

  if (!opts.passive && now - row.last_seen_at.getTime() > TOUCH_EVERY_MS) {
    await query("update app_sessions set last_seen_at = now() where token_hash = $1", [hash]);
  }

  const role: Role = {
    id: row.role_id,
    name: row.role_name,
    description: row.role_description,
    builtIn: row.role_built_in,
    locked: row.role_locked,
    permissions: row.role_permissions,
    createdAt: row.role_created_at.toISOString(),
  };

  if (row.must_reset_password && !opts.allowMustReset) {
    throw new ApiError(403, "password_change_required", "You must choose a new password before continuing.");
  }
  if (opts.superAdmin && !role.locked) throw new ApiError(403, "forbidden", "Only a Super Admin can do that.");
  if (opts.anyOf && !opts.anyOf.some(([m, a]) => roleHas(role, m, a))) {
    throw new ApiError(403, "forbidden", "Your role doesn't allow that.");
  }

  return {
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      roleId: row.role_id,
      status: row.status,
      mustResetPassword: row.must_reset_password,
      lastLogin: row.last_login?.toISOString() ?? null,
    },
    role,
  };
}

export function publicUser(a: Auth) {
  return { ...a.user, role: a.role };
}
