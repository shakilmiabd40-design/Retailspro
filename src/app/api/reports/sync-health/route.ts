import { requireAuth, roleHas } from "@/server/auth";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import type { SyncFailureItem } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

export type { SyncFailureItem } from "@/lib/reports/types";

const WEBSITE_ORDER_PREDICATE =
  "(data->>'source' in ('website', 'api') or coalesce(data->>'channel', '') <> '')";

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  const canView = auth.role.locked || roleHas(auth.role, "reports", "view") || roleHas(auth.role, "orders", "view");
  if (!canView) throw new ApiError(403, "forbidden", "You do not have access to sync health.");

  const todayWebsiteOrdersPromise = query<{ count: string }>(
    `select count(*)::text as count
       from app_records
      where collection = 'orders'
        and ${WEBSITE_ORDER_PREDICATE}
        and case
              when (data->>'createdAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (data->>'createdAt')::date
              when (data->>'createdAt') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]' then ((data->>'createdAt')::timestamptz at time zone 'Asia/Dhaka')::date
              else null
            end = (now() at time zone 'Asia/Dhaka')::date`
  );

  const totalWebsiteOrdersPromise = query<{ count: string }>(
    `select count(*)::text as count
       from app_records
      where collection = 'orders'
        and ${WEBSITE_ORDER_PREDICATE}`
  );

  const pendingFailuresPromise = query<{ count: string }>(
    `select count(*)::text as count from app_sync_failures where status = 'pending'`
  );

  const failedTodayPromise = query<{ count: string }>(
    `select count(*)::text as count
       from app_sync_failures
      where (created_at at time zone 'Asia/Dhaka')::date = (now() at time zone 'Asia/Dhaka')::date`
  );

  const failuresPromise = query<{
    id: string;
    external_id: string;
    source: string;
    api_key_name: string | null;
    payload: Record<string, unknown>;
    error_message: string;
    status: "pending" | "retried" | "resolved";
    retry_count: number;
    created_at: string;
    resolved_at: string | null;
  }>(
    `select id::text, external_id, source, api_key_name, payload, error_message, status, retry_count, created_at, resolved_at
       from app_sync_failures
      order by (status = 'pending') desc, created_at desc
      limit 100`
  );

  const latestOrderPromise = query<{ created_at: string }>(
    `select data->>'createdAt' as created_at
       from app_records
      where collection = 'orders'
        and ${WEBSITE_ORDER_PREDICATE}
      order by seq desc
      limit 1`
  );

  const [todayRes, totalRes, pendingRes, failedTodayRes, failuresRes, latestRes] = await Promise.all([
    todayWebsiteOrdersPromise,
    totalWebsiteOrdersPromise,
    pendingFailuresPromise,
    failedTodayPromise,
    failuresPromise,
    latestOrderPromise,
  ]);

  const failures: SyncFailureItem[] = failuresRes.rows.map((r) => ({
    id: r.id,
    externalId: r.external_id,
    source: r.source,
    apiKeyName: r.api_key_name,
    payload: r.payload,
    errorMessage: r.error_message,
    status: r.status,
    retryCount: r.retry_count,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at ?? undefined,
  }));

  return json({
    todayWebsiteOrders: Number(todayRes.rows[0]?.count ?? 0),
    totalWebsiteOrders: Number(totalRes.rows[0]?.count ?? 0),
    pendingFailuresCount: Number(pendingRes.rows[0]?.count ?? 0),
    failedTodayCount: Number(failedTodayRes.rows[0]?.count ?? 0),
    latestSyncAt: latestRes.rows[0]?.created_at ?? null,
    failures,
  });
});
