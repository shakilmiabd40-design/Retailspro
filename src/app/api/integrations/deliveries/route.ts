import { query } from "@/server/db";
import { json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireAuth(req, { superAdmin: true });
  const webhookId = req.nextUrl.searchParams.get("webhookId");
  const { rows } = await query<{ id: string; webhook_id: string; event_type: string; status: string; attempts: number; last_status: number | null; last_error: string | null; created_at: Date; next_attempt_at: Date; delivered_at: Date | null }>(
    `select id, webhook_id, event_type, status, attempts, last_status, last_error, created_at, next_attempt_at, delivered_at
       from app_webhook_deliveries ${webhookId ? "where webhook_id = $1" : ""} order by created_at desc limit 40`,
    webhookId ? [webhookId] : []
  );
  return json({
    deliveries: rows.map((r) => ({ id: r.id, webhookId: r.webhook_id, event: r.event_type, status: r.status, attempts: r.attempts, lastStatus: r.last_status, lastError: r.last_error, createdAt: r.created_at.toISOString(), nextAttemptAt: r.next_attempt_at.toISOString(), deliveredAt: r.delivered_at?.toISOString() ?? null })),
  });
});
