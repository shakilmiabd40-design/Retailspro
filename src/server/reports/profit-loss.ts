import "server-only";
import {
  buildPnlStatement,
  netProfitOf,
  PNL_LINE_DEFS,
  type PnlDimension,
  type PnlLineDef,
  type PnlLineKey,
  type PnlPeriod,
  type PnlTotals,
} from "@/lib/reports/profit-loss";
import { query } from "@/server/db";

/**
 * Loads the numbers behind the Profit & Loss.
 *
 *  - The **books** side (revenue, COGS, courier, operating expenses, other
 *    expenses, other income) comes from posted journal entries and the chart of
 *    accounts — the same source the Accounting screen uses.
 *  - **Ad spend** and **COD fees** never become journal entries, so they are
 *    added separately. Without them the books overstate profit by exactly the
 *    advertising and cash-on-delivery charges.
 */

export interface ProfitLossOptions {
  /** The periods to report on, in order. Both screens build these themselves. */
  periods: PnlPeriod[];
  /** Line keys to show, in order. Empty means every line. */
  lines: PnlLineKey[];
  dimension: PnlDimension;
  /** The range the breakdown covers. Defaults to the first period. */
  breakdownRange?: { from: string; to: string };
}

export interface PnlAccountRow {
  code: string;
  name: string;
  type: string;
  /** Signed: revenue positive, expense negative. */
  values: number[];
}

export interface ProfitLossReport {
  periods: PnlPeriod[];
  lines: ReturnType<typeof buildPnlStatement>["lines"];
  /** Every revenue/expense account, per period — the detail behind the statement. */
  accounts: PnlAccountRow[];
  /** The breakdown the chosen dimension asks for. */
  breakdown: { key: string; label: string; revenue: number; productCost: number; grossProfit: number; orders: number }[] | null;
  /** What is not in the books, so the statement can say so. */
  unposted: { label: string; amount: number; note: string }[];
}

/** The day an order counts as a sale — the same rule the auto-posting uses. */
const SALE_DAY = `coalesce(nullif(o.data #>> '{delivery,deliveryDate}',''), left(o.data->>'updatedAt',10), left(o.data->>'createdAt',10))`;

async function loadGlTotals(periods: PnlPeriod[]): Promise<{ totals: PnlTotals[]; accounts: PnlAccountRow[] }> {
  const { rows } = await query<{ periodKey: string; code: string; name: string; type: string; debit: string; credit: string }>(
    `with periods as (select * from jsonb_to_recordset($1::jsonb) as p(period_key text, start_date date, end_date date))
     select p.period_key as "periodKey", a.data->>'code' as code, a.data->>'name' as name, a.data->>'type' as type,
       coalesce(sum((l->>'debit')::numeric),0)::text as debit,
       coalesce(sum((l->>'credit')::numeric),0)::text as credit
     from periods p
     join app_records j on j.collection='journal_entries' and j.data->>'status'='posted'
       and j.data->>'date' >= p.start_date::text and j.data->>'date' <= p.end_date::text
     cross join lateral jsonb_array_elements(coalesce(j.data->'lines','[]'::jsonb)) l
     join app_records a on a.collection='chart_of_accounts' and a.id=l->>'accountId'
     where a.data->>'type' in ('revenue','expense')
     group by p.period_key, a.data->>'code', a.data->>'name', a.data->>'type'`,
    [JSON.stringify(periods.map((p) => ({ period_key: p.key, start_date: p.from, end_date: p.to })))],
  );

  const totals: PnlTotals[] = periods.map(() => ({
    revenue: 0,
    otherIncome: 0,
    cogs: 0,
    courier: 0,
    codFees: 0,
    adSpend: 0,
    operating: 0,
    otherExpenses: 0,
  }));
  const accounts: PnlAccountRow[] = [];

  for (const row of rows) {
    const index = periods.findIndex((p) => p.key === row.periodKey);
    if (index < 0) continue;
    const debit = Number(row.debit) || 0;
    const credit = Number(row.credit) || 0;
    const amount = row.type === "revenue" ? credit - debit : debit - credit;

    const account = accounts.find((a) => a.code === row.code && a.type === row.type);
    if (account) account.values[index] += amount;
    else accounts.push({ code: row.code, name: row.name, type: row.type, values: periods.map((_, i) => (i === index ? amount : 0)) });

    const target = totals[index];
    // The same account-code mapping the Accounting screen uses.
    if (row.type === "revenue") {
      if (row.code === "4030") target.otherIncome += amount;
      else target.revenue += amount;
    } else {
      if (row.code.startsWith("5")) target.cogs += amount;
      else if (row.code === "6040") target.courier += amount;
      else if (row.code.startsWith("6")) target.operating += amount;
      else target.otherExpenses += amount;
    }
  }

  accounts.sort((a, b) => a.code.localeCompare(b.code));
  return { totals, accounts };
}

/** Marketing spend per period — entered in Reports → Marketing, never posted to the ledger. */
async function loadAdSpend(periods: PnlPeriod[]): Promise<number[]> {
  const { rows } = await query<{ periodKey: string; spend: string }>(
    `with periods as (select * from jsonb_to_recordset($1::jsonb) as p(period_key text, start_date date, end_date date))
     select p.period_key as "periodKey", coalesce(sum(a.spend),0)::text as spend
     from periods p
     left join app_ad_spend a on a.spend_date between p.start_date and p.end_date
     group by p.period_key`,
    [JSON.stringify(periods.map((p) => ({ period_key: p.key, start_date: p.from, end_date: p.to })))],
  );
  return periods.map((period) => {
    const row = rows.find((r) => r.periodKey === period.key);
    return row ? Number(row.spend) || 0 : 0;
  });
}

/** COD service fees on delivered orders — charged by the courier, never posted to the ledger. */
async function loadCodFees(periods: PnlPeriod[]): Promise<number[]> {
  const { rows } = await query<{ periodKey: string; fees: string }>(
    `with periods as (select * from jsonb_to_recordset($1::jsonb) as p(period_key text, start_date date, end_date date))
     select p.period_key as "periodKey",
       coalesce(sum(case when o.data->>'status' = 'delivered'
         then coalesce((o.data #>> '{courier,codFee}')::numeric, 0) else 0 end), 0)::text as fees
     from periods p
     left join app_records o on o.collection='orders'
       and ${SALE_DAY} >= p.start_date::text and ${SALE_DAY} <= p.end_date::text
     group by p.period_key`,
    [JSON.stringify(periods.map((p) => ({ period_key: p.key, start_date: p.from, end_date: p.to })))],
  );
  return periods.map((period) => {
    const row = rows.find((r) => r.periodKey === period.key);
    return row ? Number(row.fees) || 0 : 0;
  });
}

/**
 * The breakdown for a dimension. Revenue and product cost come from the orders
 * themselves, so they can be split by channel, campaign, category or courier.
 */
async function loadBreakdown(dimension: PnlDimension, from: string, to: string) {
  if (dimension === "none") return null;

  const dimensionExpr =
    dimension === "channel"
      ? `case
           when coalesce(o.data->>'source', '') = 'pos' then 'shop'
           when coalesce(o.data->>'source', '') = 'api' then 'website'
           when coalesce(o.data->>'source', '') in ('website','facebook','instagram','shop') then o.data->>'source'
           when coalesce(o.data->>'channel', '') <> '' then 'website'
           else 'unattributed'
         end`
      : dimension === "campaign"
        ? `coalesce(nullif(o.data #>> '{utm,campaign}',''), 'unattributed')`
        : dimension === "courier"
          ? `coalesce(nullif(o.data #>> '{courier,company}',''), '—')`
          : `coalesce(nullif(p.data->>'category',''), 'Uncategorized')`;

  const join =
    dimension === "category"
      ? `left join app_records p on p.collection='products' and p.id = item->>'productId'`
      : "";

  const groupBy =
    dimension === "category" ? `group by 1, p.data->>'category'` : `group by 1`;

  const { rows } = await query<{ key: string; revenue: string; product_cost: string; orders: string }>(
    `select ${dimensionExpr} as key,
       coalesce(sum(case when o.data->>'status' = 'delivered'
         then (item->>'price')::numeric * (item->>'qty')::numeric - (item->>'discount')::numeric else 0 end), 0)::text as revenue,
       coalesce(sum(case when o.data->>'status' = 'delivered'
         then coalesce(vc.unit_cost, 0) * (item->>'qty')::numeric else 0 end), 0)::text as product_cost,
       count(distinct o.id)::text as orders
     from app_records o
     cross join lateral jsonb_array_elements(coalesce(o.data->'items','[]'::jsonb)) item
     ${join}
     left join lateral (
       select coalesce((v->>'cost')::numeric, (pr.data->>'costPrice')::numeric, 0) as unit_cost
       from app_records pr, jsonb_array_elements(coalesce(pr.data->'variants','[]'::jsonb)) v
       where pr.collection='products' and v->>'id' = item->>'variantId'
       limit 1
     ) vc on true
     where o.collection='orders' and o.data->>'status' = 'delivered'
       and coalesce(nullif(o.data #>> '{delivery,deliveryDate}',''), left(o.data->>'updatedAt',10), left(o.data->>'createdAt',10)) between $1 and $2
     ${groupBy}
     order by 1`,
    [from, to],
  );

  return rows.map((row) => {
    const revenue = Number(row.revenue) || 0;
    const productCost = Number(row.product_cost) || 0;
    return { key: row.key, label: row.key, revenue, productCost, grossProfit: revenue - productCost, orders: Number(row.orders) || 0 };
  });
}

export async function getProfitLossReport(options: ProfitLossOptions): Promise<ProfitLossReport> {
  const periods = options.periods;
  if (!periods.length) throw new Error("A profit and loss report needs at least one period.");
  const breakdownRange = options.breakdownRange ?? { from: periods[0].from, to: periods[0].to };

  const [gl, adSpend, codFees, breakdown] = await Promise.all([
    loadGlTotals(periods),
    loadAdSpend(periods),
    loadCodFees(periods),
    loadBreakdown(options.dimension, breakdownRange.from, breakdownRange.to),
  ]);

  const totals = gl.totals.map((total, index) => ({
    ...total,
    adSpend: adSpend[index] ?? 0,
    codFees: codFees[index] ?? 0,
  }));

  const defs = options.lines.length
    ? (options.lines.map((key) => LINE_DEFS_BY_KEY.get(key)).filter(Boolean) as PnlLineDef[])
    : undefined;
  const statement = buildPnlStatement(periods, totals, defs);

  const unposted = [
    { label: "Ad spend", amount: totals.reduce((sum, t) => sum + t.adSpend, 0), note: "Not posted to the general ledger." },
    { label: "COD service fees", amount: totals.reduce((sum, t) => sum + t.codFees, 0), note: "Not posted to the general ledger." },
  ].filter((row) => row.amount > 0);

  return {
    periods: statement.periods,
    lines: statement.lines,
    accounts: gl.accounts,
    breakdown,
    unposted,
  };
}

const LINE_DEFS_BY_KEY = new Map(PNL_LINE_DEFS.map((def) => [def.key, def]));

/**
 * The money side of the dashboard. Same books as the Profit & Loss statement,
 * so the dashboard and Accounting can never show different profit.
 */
export interface FinanceSummary {
  netProfit: number;
  /** Every cost except cost of goods sold, from the posted ledger. */
  expenses: number;
  revenue: number;
  cogs: number;
  /** The largest expense account in the period. */
  biggestExpense: { name: string; amount: number } | null;
}

/** Cash and bank money, per the posted ledger. */
export interface CashPosition {
  balance: number;
  accountCount: number;
}

export async function getFinanceSummaries(periods: PnlPeriod[]): Promise<FinanceSummary[]> {
  const [gl, adSpend, codFees] = await Promise.all([loadGlTotals(periods), loadAdSpend(periods), loadCodFees(periods)]);

  return periods.map((period, index) => {
    const totals = gl.totals[index];
    const expenses = totals.courier + totals.operating + totals.otherExpenses;

    let biggestExpense: FinanceSummary["biggestExpense"] = null;
    for (const account of gl.accounts) {
      if (account.type !== "expense") continue;
      if (account.code.startsWith("5")) continue; // cost of goods sold is not an expense line
      const amount = account.values[index] ?? 0;
      if (!amount) continue;
      if (!biggestExpense || amount > biggestExpense.amount) biggestExpense = { name: account.name, amount };
    }

    return {
      netProfit: netProfitOf({ ...totals, adSpend: adSpend[index] ?? 0, codFees: codFees[index] ?? 0 }),
      expenses,
      revenue: totals.revenue + totals.otherIncome,
      cogs: totals.cogs,
      biggestExpense,
    };
  });
}

/** Cash in hand plus the bank accounts, per the posted ledger. */
export async function getCashPosition(): Promise<CashPosition> {
  const { rows } = await query<{ name: string; balance: string; accounts: string }>(
    `select a.data->>'name' as name,
       coalesce(sum((l->>'debit')::numeric - (l->>'credit')::numeric), 0)::text as balance,
       count(*)::text as accounts
     from app_records j
     cross join lateral jsonb_array_elements(coalesce(j.data->'lines','[]'::jsonb)) l
     join app_records a on a.collection='chart_of_accounts' and a.id=l->>'accountId'
     where j.collection='journal_entries' and j.data->>'status'='posted'
       and a.data->>'code' in ('1010','1020','1030')
     group by 1`,
  );
  const posted = rows.reduce((sum, row) => sum + (Number(row.balance) || 0), 0);
  // Count the cash accounts that exist, even when nothing has been posted to them yet.
  const { rows: defined } = await query<{ n: string }>(
    `select count(distinct data->>'code')::text as n from app_records
      where collection='chart_of_accounts' and data->>'code' in ('1010','1020','1030') and coalesce((data->>'archived')::boolean,false) = false`,
  );
  const accountCount = Math.max(Number(defined[0]?.n ?? 0) || 0, rows.length);
  return { balance: posted, accountCount };
}
