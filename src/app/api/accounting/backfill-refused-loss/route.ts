import "server-only";
import { tx } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { backfillRefusedLoss, refusedLossPending } from "@/server/accounting/refused-loss";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  await requireAuth(req, { superAdmin: true });
  return tx(async (client) => {
    const { rows } = await client.query<{ data: Record<string, unknown> }>("select data from app_documents where key='accounting_history_conversion'");
    if (!rows[0]?.data?.convertedAt) return json({ ready: false, pending: 0 });
    if (rows[0].data.refuseLossBackfilledAt) return json({ ready: true, pending: 0, completed: true, count: rows[0].data.refusedLossJournalCount ?? 0 });
    return json({ ready: true, pending: await refusedLossPending(client), completed: false });
  });
});

export const POST = route(async (req) => {
  const auth = await requireAuth(req, { superAdmin: true });
  try {
    return tx(async (client) => json(await backfillRefusedLoss(client, auth.user.id)));
  } catch (error) {
    throw new ApiError(422, "refused_loss_backfill_failed", error instanceof Error ? error.message : "Could not import refused-order courier losses.");
  }
});
