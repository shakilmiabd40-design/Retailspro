import type { PoolClient } from "pg";
import type { ChartOfAccount, JournalEntry, JournalLine } from "@/lib/accounting/gl-types";
import type { Order } from "@/lib/orders/types";
import { actualCourierCost } from "@/lib/orders/utils";
import { bumpRev } from "@/server/seed";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const stableId = (value: string) => `refuse-loss-${value}`.slice(0, 120);

export async function refusedLossPending(client: PoolClient) {
  const { rows: orderRows } = await client.query<{ id: string; data: Order }>("select id,data from app_records where collection='orders' and data->>'status'='refuse_return'");
  const { rows: sourceRows } = await client.query<{ sourceId: string }>("select data->>'sourceId' as \"sourceId\" from app_records where collection='journal_entries' and data->>'sourceId' like '%:refuse'");
  const existing = new Set(sourceRows.map((row) => row.sourceId));
  return orderRows.filter(({ id, data }) => actualCourierCost(data) > 0 && !existing.has(`${id}:refuse`)).length;
}

/** Adds append-only courier-expense journals for historical refused orders missed by the first conversion. */
export async function backfillRefusedLoss(client: PoolClient, actor: string) {
  const { rows: markerRows } = await client.query<{ data: Record<string, unknown> }>("select data from app_documents where key='accounting_history_conversion' for update");
  const { rows: orderRows } = await client.query<{ id: string; data: Order }>("select id,data from app_records where collection='orders' and data->>'status'='refuse_return'");
  const { rows: sourceRows } = await client.query<{ sourceId: string }>("select data->>'sourceId' as \"sourceId\" from app_records where collection='journal_entries' and data->>'sourceId' like '%:refuse'");
  const { rows: accounts } = await client.query<{ data: ChartOfAccount }>("select data from app_records where collection='chart_of_accounts'");
  const { rows: periods } = await client.query<{ data: { from: string; to: string; status: string } }>("select data from app_records where collection='accounting_periods'");
  if (!markerRows[0]?.data?.convertedAt) throw new Error("Convert accounting history before backfilling refused-order losses.");
  if (markerRows[0].data.refuseLossBackfilledAt) return { posted: 0, pending: 0, alreadyBackfilled: true };

  const accountRows = accounts.map((row) => row.data);
  const expense = accountRows.find((account) => account.code === "6040" && !account.archived);
  const payable = accountRows.find((account) => account.code === "2050" && !account.archived);
  if (!expense || !payable) throw new Error("Courier expense or courier payable account is missing from the chart of accounts.");
  const existing = new Set(sourceRows.map((row) => row.sourceId));
  const now = new Date().toISOString();
  const entries: JournalEntry[] = [];
  for (const { id, data: order } of orderRows) {
    const amount = round2(actualCourierCost(order));
    const sourceId = `${id}:refuse`;
    if (!amount || existing.has(sourceId)) continue;
    const date = (order.delivery?.deliveryDate || order.updatedAt || order.createdAt || now).slice(0, 10);
    const locked = periods.map((row) => row.data).find((period) => period.status === "locked" && date >= period.from && date <= period.to);
    if (locked) throw new Error(`Refused order ${order.orderNumber} falls in locked accounting period ${locked.from} to ${locked.to}. Reopen that period before importing its loss.`);
    const lines: JournalLine[] = [
      { id: stableId(`${id}-debit`), accountId: expense.id, accountCode: expense.code, accountName: expense.name, debit: amount, credit: 0 },
      { id: stableId(`${id}-credit`), accountId: payable.id, accountCode: payable.code, accountName: payable.name, debit: 0, credit: amount },
    ];
    entries.push({ id: stableId(id), entryNumber: `HIST-R-${order.orderNumber}`.slice(0, 50), date, ref: order.orderNumber, narration: `Refused parcel courier loss · ${order.orderNumber}`, source: "sale", sourceId, status: "posted", lines, totalDebit: amount, totalCredit: amount, createdAt: now, createdBy: actor, postedAt: now, postedBy: actor });
  }
  for (let offset = 0; offset < entries.length; offset += 500) {
    const batch = entries.slice(offset, offset + 500);
    await client.query("insert into app_records(collection,id,data,updated_by) select 'journal_entries',r.id,r.data,$2 from jsonb_to_recordset($1::jsonb) as r(id text,data jsonb)", [JSON.stringify(batch.map((entry) => ({ id: entry.id, data: entry }))), actor]);
  }
  if (entries.length) await bumpRev(client, "journal_entries");
  const completedAt = new Date().toISOString();
  const metadata = { ...markerRows[0].data, refuseLossBackfilledAt: completedAt, refusedLossJournalCount: entries.length };
  await client.query("update app_documents set data=$1::jsonb,version=version+1,updated_at=now(),updated_by=$2 where key='accounting_history_conversion'", [JSON.stringify(metadata), actor]);
  await bumpRev(client, "accounting_history_conversion");
  return { posted: entries.length, pending: 0, alreadyBackfilled: false };
}
