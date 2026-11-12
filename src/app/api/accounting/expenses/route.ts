import type { JournalStatus } from "@/lib/accounting/gl-types";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

export interface AccountingExpenseRow {
  entryId: string;
  entryNumber: string;
  date: string;
  narration: string;
  status: JournalStatus;
  /** The expense account the money was booked to. */
  accountId: string;
  code: string;
  name: string;
  /** Debit minus credit on the expense account (negative for a reversal). */
  amount: number;
  /** What the money was paid from — cash, bank or a receivable. */
  paidFrom: string;
  memo: string;
}

/**
 * The expenses in the books: the expense lines of journal entries in a period.
 *
 * Cost of goods sold (the 5xxx accounts) is left out — it is posted from the
 * sales themselves, not recorded by hand.
 */
export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.journal_entries)) throw new ApiError(403, "forbidden", "You do not have access to accounting entries.");

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!validDay(from) || !validDay(to) || from > to) throw new ApiError(400, "invalid_date_range", "Choose a valid period.");

  const { rows } = await query<{
    entryId: string;
    entryNumber: string;
    date: string;
    narration: string;
    status: JournalStatus;
    accountId: string;
    code: string;
    name: string;
    amount: string;
    paidFrom: string;
    memo: string;
  }>(
    `with expense_lines as (
       select j.id as "entryId", j.data->>'entryNumber' as "entryNumber", j.data->>'date' as date,
              j.data->>'narration' as narration, j.data->>'status' as status,
              l->>'accountId' as "accountId", a.data->>'code' as code, a.data->>'name' as name,
              coalesce((l->>'debit')::numeric,0) - coalesce((l->>'credit')::numeric,0) as amount,
              coalesce(l->>'memo','') as memo,
              (select l2->>'accountName' from jsonb_array_elements(coalesce(j.data->'lines','[]'::jsonb)) l2
                where l2->>'accountId' <> l->>'accountId' limit 1) as "paidFrom"
       from app_records j
       cross join lateral jsonb_array_elements(coalesce(j.data->'lines','[]'::jsonb)) l
       join app_records a on a.collection='chart_of_accounts' and a.id = l->>'accountId'
       where j.collection='journal_entries' and j.data->>'status' in ('posted','draft')
         and a.data->>'type' = 'expense' and a.data->>'code' not like '5%'
         and j.data->>'date' >= $1 and j.data->>'date' <= $2
     )
     select * from expense_lines order by date desc, "entryNumber" desc`,
    [from, to],
  );

  return json({
    rows: rows.map((row) => ({ ...row, amount: Number(row.amount) || 0 })),
  });
});
