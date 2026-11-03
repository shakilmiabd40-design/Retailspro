import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { requireAuth } from "@/server/auth";
import { query } from "@/server/db";
import { ApiError, json, route } from "@/server/http";

export const dynamic = "force-dynamic";

function validDay(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.journal_entries)) throw new ApiError(403, "forbidden", "You do not have access to accounting reports.");
  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind");
  if (kind !== "balances" && kind !== "profit-loss") throw new ApiError(400, "invalid_report", "Unknown accounting report.");
  const expenseFilter = kind === "profit-loss" ? "and a.data->>'type' in ('revenue','expense')" : "";
  const selectedPeriods = sp.get("periods");
  if (selectedPeriods) {
    if (kind !== "profit-loss") throw new ApiError(400, "invalid_report", "Periods are only supported for profit and loss.");
    let periods: { periodKey: string; from: string; to: string }[];
    try { periods = JSON.parse(selectedPeriods); }
    catch { throw new ApiError(400, "invalid_periods", "Invalid report periods."); }
    if (!Array.isArray(periods) || periods.length < 1 || periods.length > 12 || periods.some((p) => !p || typeof p.periodKey !== "string" || p.periodKey.length > 20 || !validDay(p.from) || !validDay(p.to) || p.from > p.to)) {
      throw new ApiError(400, "invalid_periods", "Choose valid report periods.");
    }
    const { rows } = await query<{ periodKey: string; accountId: string; code: string; name: string; type: string; debit: string; credit: string }>(
      `with periods as (select * from jsonb_to_recordset($1::jsonb) as p(period_key text, start_date date, end_date date))
       select p.period_key as "periodKey", l->>'accountId' as "accountId", a.data->>'code' as code, a.data->>'name' as name, a.data->>'type' as type,
         coalesce(sum((l->>'debit')::numeric),0)::text as debit, coalesce(sum((l->>'credit')::numeric),0)::text as credit
       from periods p
       join app_records j on j.collection='journal_entries' and j.data->>'status'='posted'
         and j.data->>'date' >= p.start_date::text and j.data->>'date' <= p.end_date::text
       cross join lateral jsonb_array_elements(coalesce(j.data->'lines','[]'::jsonb)) l
       join app_records a on a.collection='chart_of_accounts' and a.id=l->>'accountId'
       where a.data->>'type' in ('revenue','expense')
       group by p.period_key, l->>'accountId', a.data->>'code', a.data->>'name', a.data->>'type'`,
      [JSON.stringify(periods.map((p) => ({ period_key: p.periodKey, start_date: p.from, end_date: p.to })))],
    );
    return json({ rows: rows.map((row) => ({ ...row, debit: Number(row.debit), credit: Number(row.credit) })) });
  }
  const from = sp.get("from");
  const to = sp.get("to");
  if (!validDay(from) || !validDay(to) || from > to) throw new ApiError(400, "invalid_date_range", "Choose a valid report date range.");

  const { rows } = await query<{ accountId: string; code: string; name: string; type: string; debit: string; credit: string }>(
    `select l->>'accountId' as "accountId", a.data->>'code' as code, a.data->>'name' as name, a.data->>'type' as type,
       coalesce(sum((l->>'debit')::numeric),0)::text as debit,
       coalesce(sum((l->>'credit')::numeric),0)::text as credit
     from app_records j
     cross join lateral jsonb_array_elements(coalesce(j.data->'lines','[]'::jsonb)) l
     join app_records a on a.collection='chart_of_accounts' and a.id=l->>'accountId'
     where j.collection='journal_entries' and j.data->>'status'='posted'
       and j.data->>'date' >= $1 and j.data->>'date' <= $2 ${expenseFilter}
     group by l->>'accountId', a.data->>'code', a.data->>'name', a.data->>'type'`,
    [from, to],
  );
  return json({ rows: rows.map((row) => ({ ...row, debit: Number(row.debit), credit: Number(row.credit) })) });
});
