import { query } from "@/server/db";
import { ApiError, json, readJson, route, str } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { AUDIT_MODULES, type AuditAction, type AuditEntry, type AuditModule } from "@/lib/settings/types";

export const dynamic = "force-dynamic";

const ACTIONS: AuditAction[] = ["create", "edit", "delete", "status_change", "import", "export", "security"];
/** Safety cap on a single "export older entries" download — purge in a couple of passes for anything bigger. */
const PURGE_EXPORT_CAP = 20000;
/** Never purge anything from the last 24h, no matter what cutoff date is sent. */
const MIN_PURGE_AGE_MS = 24 * 60 * 60 * 1000;

interface Row {
  id: string;
  at: Date;
  user_id: string | null;
  user_name: string;
  module: AuditModule;
  action: AuditAction;
  entity: string;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  device: string | null;
}

export const GET = route(async (req) => {
  const before = req.nextUrl.searchParams.get("before");

  // Purge-preview / purge-export mode: everything strictly older than a cutoff date, oldest first,
  // not the normal "most recent N" view. Used only by the Super Admin cleanup tool below.
  if (before) {
    const cutoff = new Date(before);
    if (Number.isNaN(cutoff.getTime())) throw new ApiError(400, "invalid", "Bad cutoff date.");
    await requireAuth(req, { superAdmin: true });

    if (req.nextUrl.searchParams.get("countOnly") === "1") {
      const { rows } = await query<{ count: string }>("select count(*)::text as count from app_audit_log where at < $1", [cutoff]);
      return json({ count: Number(rows[0]?.count ?? 0) });
    }

    const { rows } = await query<Row>(
      "select id::text, at, user_id, user_name, module, action, entity, summary, before, after, device from app_audit_log where at < $1 order by at asc, id asc limit $2",
      [cutoff, PURGE_EXPORT_CAP]
    );
    const entries: AuditEntry[] = rows.map((r) => ({
      id: `db:${r.id}`,
      at: r.at.toISOString(),
      userId: r.user_id ?? "",
      userName: r.user_name,
      module: r.module,
      action: r.action,
      entity: r.entity,
      summary: r.summary,
      before: r.before ?? undefined,
      after: r.after ?? undefined,
      device: r.device ?? undefined,
      source: "native",
    }));
    return json({ entries, truncated: entries.length >= PURGE_EXPORT_CAP });
  }

  await requireAuth(req, { anyOf: [["audit", "view"]], passive: req.headers.get("x-rp-passive") === "1" });
  const limit = Math.min(5000, Math.max(1, Number(req.nextUrl.searchParams.get("limit")) || 1500));
  const { rows } = await query<Row>("select id::text, at, user_id, user_name, module, action, entity, summary, before, after, device from app_audit_log order by at desc, id desc limit $1", [limit]);
  const entries: AuditEntry[] = rows.map((r) => ({
    id: `db:${r.id}`,
    at: r.at.toISOString(),
    userId: r.user_id ?? "",
    userName: r.user_name,
    module: r.module,
    action: r.action,
    entity: r.entity,
    summary: r.summary,
    before: r.before ?? undefined,
    after: r.after ?? undefined,
    device: r.device ?? undefined,
    source: "native",
  }));
  return json({ entries });
});

/**
 * Super-Admin-only cleanup: permanently deletes every audit entry older than a cutoff date, to keep the
 * table from growing without bound on a storage-capped database. Deliberately coarse (a date, not a
 * pick-list) and it always leaves a trace of itself — a fresh audit entry recording who purged what and
 * when — so the log can never be silently emptied.
 */
export const DELETE = route(async (req) => {
  const auth = await requireAuth(req, { superAdmin: true });
  const b = await readJson<{ before?: string }>(req);
  const requested = b.before ? new Date(b.before) : null;
  if (!requested || Number.isNaN(requested.getTime())) throw new ApiError(400, "invalid", "Pick a valid cutoff date.");

  const cap = new Date(Date.now() - MIN_PURGE_AGE_MS);
  const cutoff = requested > cap ? cap : requested;

  const { rows } = await query<{ id: string }>("delete from app_audit_log where at < $1 returning id", [cutoff]);
  const count = rows.length;

  if (count > 0) {
    await writeAudit(req, {
      userId: auth.user.id,
      userName: auth.user.name,
      module: "Data",
      action: "delete",
      entity: "Audit log",
      summary: `Purged ${count} audit ${count === 1 ? "entry" : "entries"} recorded before ${cutoff.toISOString().slice(0, 10)}`,
    });
  }

  return json({ ok: true, count, cutoff: cutoff.toISOString() });
});

/** Browser-reported events (stock changes, settings edits…). The actor and time are stamped from the session. */
export const POST = route(async (req) => {
  const auth = await requireAuth(req);
  const b = await readJson<{ module?: string; action?: string; entity?: string; summary?: string; before?: unknown; after?: unknown }>(req);
  if (!AUDIT_MODULES.includes(b.module as AuditModule) || !ACTIONS.includes(b.action as AuditAction)) throw new ApiError(400, "invalid", "Bad audit entry.");
  await writeAudit(req, {
    userId: auth.user.id,
    userName: auth.user.name,
    module: b.module as AuditModule,
    action: b.action as AuditAction,
    entity: str(b.entity, 300),
    summary: str(b.summary, 1000),
    before: b.before,
    after: b.after,
  });
  return json({ ok: true });
});
