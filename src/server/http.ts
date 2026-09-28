import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { DbNotConfiguredError } from "./db";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>
  ) {
    super(message);
  }
}

export const json = (data: unknown, init?: ResponseInit) => NextResponse.json(data, init);

/** Same-origin check for anything that changes state (CSRF defence on top of SameSite cookies). */
function assertSameOrigin(req: NextRequest) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = req.headers.get("origin");
  if (origin) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      /* fallthrough */
    }
    if (originHost !== host) throw new ApiError(403, "bad_origin", "Cross-site request blocked.");
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new ApiError(403, "bad_origin", "Cross-site request blocked.");
}

export async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    const body = await req.json();
    if (body === null || typeof body !== "object") throw new Error("not an object");
    return body as T;
  } catch {
    throw new ApiError(400, "bad_json", "Request body must be JSON.");
  }
}

export function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

/** Wraps a route handler: origin check + uniform JSON errors (incl. "database not ready"). */
export function route<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      const res = await handler(req, ctx);
      res.headers.set("Cache-Control", "no-store");
      return res;
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.code, message: err.message, ...err.extra }, { status: err.status, headers: { "Cache-Control": "no-store" } });
  }
  if (err instanceof DbNotConfiguredError) {
    return NextResponse.json({ error: "db_not_configured", message: "DATABASE_URL is not set. Add your Neon or Aiven connection string to .env.local." }, { status: 503 });
  }
  const e = err as { code?: string; message?: string };
  if (e?.code === "42P01") {
    return NextResponse.json({ error: "db_not_ready", message: "The database tables don't exist yet. Run  npm run db:setup  once." }, { status: 503 });
  }
  if (e?.code && /^(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EAI_AGAIN|28P01|3D000|57P03)$/.test(e.code) || /timeout|SSL|certificate|password authentication/i.test(e?.message ?? "")) {
    console.error("[db] connection problem:", e?.code, e?.message);
    return NextResponse.json({ error: "db_unreachable", message: "Couldn't connect to the database. Check DATABASE_URL and SSL settings." }, { status: 503 });
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json({ error: "server_error", message: "Something went wrong on the server." }, { status: 500 });
}
