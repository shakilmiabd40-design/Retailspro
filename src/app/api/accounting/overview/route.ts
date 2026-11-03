import type { JournalEntry } from "@/lib/accounting/gl-types";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { requireAuth } from "@/server/auth";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.journal_entries)) throw new ApiError(403, "forbidden", "You do not have access to accounting reports.");
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new ApiError(400, "invalid_date_range", "Choose a valid accounting period.");

  const [totals, inventory, grni, journals, posted, drafts] = await Promise.all([
    query<{ revenue: string; cogs: string; expenses: string }>(
      `select
         coalesce(sum(case when a.data->>'type'='revenue' then (l->>'credit')::numeric - (l->>'debit')::numeric else 0 end),0)::text as revenue,
         coalesce(sum(case when a.data->>'type'='expense' and a.data->>'code' like '5%' then (l->>'debit')::numeric - (l->>'credit')::numeric else 0 end),0)::text as cogs,
         coalesce(sum(case when a.data->>'type'='expense' and a.data->>'code' not like '5%' then (l->>'debit')::numeric - (l->>'credit')::numeric else 0 end),0)::text as expenses
       from app_records j cross join lateral jsonb_array_elements(coalesce(j.data->'lines','[]'::jsonb)) l
       join app_records a on a.collection='chart_of_accounts' and a.id=l->>'accountId'
       where j.collection='journal_entries' and j.data->>'status'='posted' and j.data->>'date' >= $1 and j.data->>'date' <= $2`,
      [from, to],
    ),
    query<{ value: string }>("select coalesce(sum((data->>'remainingQty')::numeric * (data->>'unitCost')::numeric),0)::text as value from app_records where collection='inventory_cost_layers' and (data->>'remainingQty')::numeric > 0"),
    query<{ value: string }>("select coalesce(sum(greatest(0,(data->>'amount')::numeric-(data->>'invoicedAmount')::numeric)),0)::text as value from app_records where collection='grni' and data->>'status' in ('open','partial')"),
    query<{ data: JournalEntry }>("select data from app_records where collection='journal_entries' and data->>'status'='posted' order by data->>'date' desc,data->>'createdAt' desc,seq desc limit 5"),
    query<{ count: string }>("select count(*)::text as count from app_records where collection='journal_entries' and data->>'status'='posted'"),
    query<{ count: string }>("select count(*)::text as count from app_records where collection='journal_entries' and data->>'status'='draft'"),
  ]);
  const amount = (value: string | undefined) => Number(value ?? 0);
  return json({
    summary: { revenue: amount(totals.rows[0]?.revenue), cogs: amount(totals.rows[0]?.cogs), expenses: amount(totals.rows[0]?.expenses), inventory: amount(inventory.rows[0]?.value), openGrni: amount(grni.rows[0]?.value), drafts: amount(drafts.rows[0]?.count) },
    recentJournals: journals.rows.map((row) => row.data),
    hasPosted: amount(posted.rows[0]?.count) > 0,
  });
});
