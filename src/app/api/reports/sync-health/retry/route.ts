import { requireAuth, roleHas } from "@/server/auth";
import { query } from "@/server/db";
import { ApiError, json, readJson, route } from "@/server/http";
import type { ApiKeyAuth } from "@/server/publicapi/apikeys";
import { createApiOrder, parseCreateOrder } from "@/server/publicapi/orders";
import { writeAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const auth = await requireAuth(req);
  const canRetry = auth.role.locked || roleHas(auth.role, "orders", "create") || roleHas(auth.role, "orders", "edit");
  if (!canRetry) throw new ApiError(403, "forbidden", "You do not have permission to retry sync operations.");

  const body = await readJson<{ id?: string }>(req);
  if (!body.id) throw new ApiError(400, "invalid_id", "Sync failure ID is required.");

  const { rows } = await query<{
    id: string;
    external_id: string;
    source: string;
    api_key_id: string | null;
    api_key_name: string | null;
    payload: Record<string, unknown>;
    status: string;
    retry_count: number;
  }>(
    `select id::text, external_id, source, api_key_id, api_key_name, payload, status, retry_count
       from app_sync_failures where id = $1::bigint`,
    [body.id]
  );

  if (!rows.length) throw new ApiError(404, "not_found", "Sync failure record not found.");
  const failure = rows[0];
  if (failure.status === "resolved") {
    throw new ApiError(409, "already_resolved", "This sync failure has already been resolved.");
  }

  try {
    const input = parseCreateOrder(failure.payload);

    // Reuse the original key name so the retried order keeps the same channel and the
    // storefront's own retries still hit the (channel, external_id) idempotency check.
    const keyName = failure.api_key_name || failure.source || "website";
    const retryKey: ApiKeyAuth = {
      id: failure.api_key_id || "key-system-retry",
      name: keyName,
      scopes: ["orders:read", "orders:write"],
    };
    const { order, duplicate } = await createApiOrder(req, retryKey, input);

    await query(
      `update app_sync_failures
          set status = 'resolved', resolved_at = now(), retry_count = retry_count + 1,
              error_message = case when $2 then 'Already existed — resolved as duplicate.' else error_message end,
              updated_at = now()
        where id = $1::bigint`,
      [failure.id, duplicate]
    );

    await writeAudit(req, {
      userId: auth.user.id,
      userName: auth.user.name,
      module: "Orders",
      action: "edit",
      entity: "Sync Health",
      summary: duplicate
        ? `Retried sync for external ID ${failure.external_id}; order #${order.orderNumber} already existed`
        : `Successfully retried sync for external ID ${failure.external_id} -> Order #${order.orderNumber}`,
      after: { orderId: order.id, orderNumber: order.orderNumber, duplicate },
    });

    return json({ ok: true, orderNumber: order.orderNumber, duplicate });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await query(
      `update app_sync_failures
          set retry_count = retry_count + 1, error_message = $2, updated_at = now()
        where id = $1::bigint`,
      [failure.id, msg.slice(0, 1000)]
    );
    throw new ApiError(422, "retry_failed", `Retry failed: ${msg}`);
  }
});
