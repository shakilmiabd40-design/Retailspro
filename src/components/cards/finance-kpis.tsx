"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Landmark, PiggyBank, Receipt, TrendingUp } from "lucide-react";
import { dayKey, parseDay } from "@/lib/accounting/utils";
import { api } from "@/lib/persist/api";
import { formatCurrency } from "@/lib/format";
import { TrendPill } from "@/components/trend-pill";
import type { Trend } from "@/lib/types";

interface FinanceSummary {
  netProfit: number;
  expenses: number;
  revenue: number;
  cogs: number;
  biggestExpense: { name: string; amount: number } | null;
}

interface FinancePayload {
  cur: FinanceSummary;
  prev: FinanceSummary;
  balance: number;
  accountCount: number;
}

const trendOf = (cur: number, prev: number): Trend | null => {
  if (!prev) return null;
  const v = ((cur - prev) / Math.abs(prev)) * 100;
  return { value: Math.abs(Math.round(v * 10) / 10), direction: v >= 0 ? "up" : "down" };
};

function Card({ title, icon, value, sub, href, trend, bad }: { title: string; icon: React.ReactNode; value: string; sub?: string; href: string; trend?: Trend | null; bad?: boolean }) {
  return (
    <Link href={href} className="card focus-ring flex flex-col p-5 transition-shadow hover:shadow-md">
      <div className="mb-1 flex items-start justify-between">
        <p className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>{title}</p>
        <span style={{ color: "var(--text-faint)" }}>{icon}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-semibold" style={{ color: bad ? "var(--red)" : "var(--text)" }}>{value}</p>
        {trend && <TrendPill trend={trend} />}
      </div>
      {sub && <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-faint)" }}>{sub}</p>}
    </Link>
  );
}

/** Money side of the dashboard, shown to people who can see Accounting. */
export function FinanceKpis({ from, to, label }: { from?: string; to?: string; label?: string }) {
  const data = useMemo(() => {
    const now = new Date();
    const curFrom = from ?? dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
    const curTo = to ?? dayKey(now);

    // Previous comparison period of equal length
    const fDate = parseDay(curFrom);
    const tDate = parseDay(curTo);
    const diffDays = Math.max(1, Math.round((tDate.getTime() - fDate.getTime()) / 86400000) + 1);
    const prevToDate = new Date(fDate.getTime() - 86400000);
    const prevFromDate = new Date(prevToDate.getTime() - (diffDays - 1) * 86400000);
    const fromPrev = dayKey(prevFromDate);
    const toPrev = dayKey(prevToDate);

    return { curFrom, curTo, fromPrev, toPrev };
  }, [from, to]);
  const [report, setReport] = useState<FinancePayload | null>(null);
  useEffect(() => {
    let current = true;
    const params = new URLSearchParams({ from: data.curFrom, to: data.curTo, previousFrom: data.fromPrev, previousTo: data.toPrev });
    api<FinancePayload>("GET", `/api/dashboard/finance?${params}`)
      .then((result) => { if (current) setReport(result); })
      .catch(() => { if (current) setReport(null); });
    return () => { current = false; };
  }, [data]);
  if (!report) return null;

  const { cur, prev, balance, accountCount } = report;
  const top = cur.biggestExpense;
  const periodText = label ? ` · ${label}` : " · Last 30 Days";

  return (
    <div>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <Card title={`Expenses${periodText}`} icon={<Receipt size={16} />} value={formatCurrency(cur.expenses)} sub={`${formatCurrency(prev.expenses)} in the previous period`} href="/accounting/expenses" trend={trendOf(cur.expenses, prev.expenses)} />
        <Card title={`Net Profit${periodText}`} icon={<TrendingUp size={16} />} value={formatCurrency(cur.netProfit)} sub="After product, courier & running costs" href="/accounting/profit-loss" trend={trendOf(cur.netProfit, prev.netProfit)} bad={cur.netProfit < 0} />
        <Card title="Biggest expense" icon={<PiggyBank size={16} />} value={top ? formatCurrency(top.amount) : "—"} sub={top ? top.name : "No expenses recorded yet"} href="/accounting/expenses" />
        <Card title="Money in accounts" icon={<Landmark size={16} />} value={accountCount ? formatCurrency(balance) : "—"} sub={accountCount ? `${accountCount} cash account${accountCount === 1 ? "" : "s"}` : "Add accounts to track balances"} href="/accounting/accounts" bad={balance < 0} />
      </div>
      <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
        From the posted ledger — the same numbers as Accounting → Profit & Loss:{" "}
        {formatCurrency(cur.revenue)} revenue − {formatCurrency(cur.cogs)} cost − {formatCurrency(cur.expenses)} expenses = {formatCurrency(cur.netProfit)} net profit.
        {" "}Sales above is trading revenue net of courier cost, so it is not the ledger&apos;s revenue.
      </p>
    </div>
  );
}
