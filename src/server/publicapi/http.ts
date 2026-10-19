import "server-only";
import crypto from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ApiError } from "../http";
import { DbNotConfiguredError, isDbBusyError } from "../db";

export const API_VERSION = "2026-09-01";

/**
 * Wrapper for /api/v1 handlers. Unlike the dashboard's own routes there is no same-origin check
 * (callers are other servers, authenticated by API key) and errors use one documented shape:
 *   { "error": { "code": "...", "message": "...", "details": {...} } }
 */
export function apiRoute<C = unknown>(handler: (req: NextRequest, ctx: C) => Promise<Response>) {
  return async (req: NextRequest, ctx: C): Promise<Response> => {
    const requestId = `req_${crypto.randomBytes(8).toString("hex")}`;
    let res: Response;
    try {
      res = await handler(req, ctx);
    } catch (err) {
      res = apiError(err);
    }
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("X-Request-Id", requestId);
    res.headers.set("X-InventoryPro-Api-Version", API_VERSION);
    return res;
  };
}

export function apiError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    const headers: Record<string, string> = {};
    const retry = err.extra?.retry_after_seconds;
    if (typeof retry === "number") headers["Retry-After"] = String(retry);
    return NextResponse.json({ error: { code: err.code, message: err.message, ...(err.extra ? { details: err.extra } : {}) } }, { status: err.status, headers });
  }
  if (err instanceof DbNotConfiguredError) return NextResponse.json({ error: { code: "service_unavailable", message: "The shop database isn't configured." } }, { status: 503 });
  if (isDbBusyError(err)) return NextResponse.json({ error: { code: "service_unavailable", message: "The shop database is busy. Please retry in a few seconds." } }, { status: 503, headers: { "Retry-After": "3" } });
  const e = err as { code?: string; message?: string };
  if (e?.code === "42P01") return NextResponse.json({ error: { code: "service_unavailable", message: "The database tables don't exist yet. Run  npm run db:setup." } }, { status: 503 });
  console.error("[api/v1] unhandled error", err);
  return NextResponse.json({ error: { code: "server_error", message: "Something went wrong on our side. Please retry." } }, { status: 500 });
}

export const ok = (data: unknown, extra: Record<string, unknown> = {}, init?: ResponseInit) => NextResponse.json({ data, ...extra }, init);

export async function readBody(req: NextRequest): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "The request body must be valid JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw new ApiError(400, "invalid_json", "The request body must be a JSON object.");
  return body as Record<string, unknown>;
}

/** Cursor pagination params: ?limit=1..100 (default 25) &cursor=<opaque> */
export function pageParams(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(100, Math.max(1, Math.floor(Number(sp.get("limit")) || 25)));
  const rawCursor = sp.get("cursor");
  let cursor: number | null = null;
  if (rawCursor) {
    const n = Number(Buffer.from(rawCursor, "base64url").toString("utf8"));
    if (!Number.isFinite(n) || n <= 0) throw new ApiError(400, "invalid_cursor", "The cursor isn't valid.");
    cursor = n;
  }
  return { limit, cursor };
}

export const encodeCursor = (seq: number | string) => Buffer.from(String(seq), "utf8").toString("base64url");

export function parseSince(req: NextRequest): string | null {
  const v = req.nextUrl.searchParams.get("updated_since");
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ApiError(400, "invalid_parameter", "updated_since must be an ISO 8601 date-time, e.g. 2026-09-24T10:00:00Z.");
  return d.toISOString();
}
