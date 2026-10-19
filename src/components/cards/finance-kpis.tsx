"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Landmark, PiggyBank, Receipt, TrendingUp } from "lucide-react";
import { useFinance } from "@/lib/accounting/use-finance";
import { accountBalance, dayKey } from "@/lib/accounting/utils";
import { formatCurrency } from "@/lib/format";
import { TrendPill } from "@/components/trend-pill";
import type { Trend } from "@/lib/types";

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
export function FinanceKpis() {
  const f = useFinance();
  const data = useMemo(() => {
    const now = new Date();
    const from30 = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29));
    const fromPrev = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 59));
    const toPrev = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30));
    return { cur: f.pnl(from30, dayKey(now)), prev: f.pnl(fromPrev, toPrev) };
  }, [f]);
  if (!f.ready) return null;

  const { cur, prev } = data;
  const live = f.accounts.filter((a) => !a.archived);
  const balance = live.reduce((s, a) => s + accountBalance(a, f.entries), 0);
  const top = cur.expensesByCategory[0];

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <Card title="Expenses · Last 30 Days" icon={<Receipt size={16} />} value={formatCurrency(cur.operatingExpenses)} sub={`${formatCurrency(prev.operatingExpenses)} in the previous 30 days`} href="/accounting/expenses" trend={trendOf(cur.operatingExpenses, prev.operatingExpenses)} />
      <Card title="Net Profit · Last 30 Days" icon={<TrendingUp size={16} />} value={formatCurrency(cur.netProfit)} sub="After product, courier & running costs" href="/accounting/profit-loss" trend={trendOf(cur.netProfit, prev.netProfit)} bad={cur.netProfit < 0} />
      <Card title="Biggest expense" icon={<PiggyBank size={16} />} value={top ? formatCurrency(top.amount) : "—"} sub={top ? top.category : "No expenses recorded yet"} href="/accounting/expenses" />
      <Card title="Money in accounts" icon={<Landmark size={16} />} value={live.length ? formatCurrency(balance) : "—"} sub={live.length ? `${live.length} account${live.length === 1 ? "" : "s"}` : "Add accounts to track balances"} href="/accounting/accounts" bad={balance < 0} />
    </div>
  );
}
