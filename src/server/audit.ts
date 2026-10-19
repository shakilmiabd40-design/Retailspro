import "server-only";
import type { NextRequest } from "next/server";
import type { PoolClient } from "pg";
import { query } from "./db";
import type { AuditAction, AuditModule } from "@/lib/settings/types";

export interface AuditInput {
  userId: string | null;
  userName: string;
  module: AuditModule;
  action: AuditAction;
  entity: string;
  summary: string;
  before?: unknown;
  after?: unknown;
}

export function clientInfo(req: NextRequest): { device: string } {
  const ua = req.headers.get("user-agent") ?? "";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : ua ? "Browser" : "";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return { device: [browser, os && `on ${os}`].filter(Boolean).join(" ") };
}

const trim = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

function jsonOrNull(v: unknown): string | null {
  if (v === undefined) return null;
  const text = JSON.stringify(v);
  return text.length > 20000 ? JSON.stringify({ truncated: true }) : text;
}

/** Server-stamped audit entry: the actor and time come from the session, never from the browser. */
export async function writeAudit(req: NextRequest, e: AuditInput, client?: Pick<PoolClient, "query">) {
  const { device } = clientInfo(req);
  const params = [e.userId, trim(e.userName, 200), e.module, e.action, trim(e.entity, 300), trim(e.summary, 1000), jsonOrNull(e.before), jsonOrNull(e.after), device];
  const sql = `insert into app_audit_log (user_id, user_name, module, action, entity, summary, before, after, device)
               values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`;
  if (client) await client.query(sql, params);
  else await query(sql, params);
}
