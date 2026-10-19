"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useFinance } from "@/lib/accounting/use-finance";
import { accountBalance, lastMonths } from "@/lib/accounting/utils";
import { ENTRY_KIND_LABELS, type LedgerEntry } from "@/lib/accounting/types";
import { taka } from "@/lib/reports/format";
import { useAccess } from "@/lib/settings/access";
import { PrimaryButton } from "@/components/settings/ui";
import { KpiGrid, Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { COLORS, DonutChart, RankBars, TrendChart } from "@/components/reports/charts";
import { PeriodBar, usePeriod } from "@/components/accounting/period-bar";
import { DueBanner } from "@/components/accounting/due-banner";
import { EntryModal } from "@/components/accounting/entry-modal";

const PIE = ["#f97316", "#3b82f6", "#22c55e", "#8b5cf6", "#f59e0b", "#f43f5e"];

export default function AccountingOverviewPage() {
  const f = useFinance();
  const { can } = useAccess();
  const period = usePeriod("this_month");
  const [adding, setAdding] = useState(false);

  const pl = useMemo(() => f.pnl(period.from, period.to), [f, period.from, period.to]);
  const months = useMemo(() => lastMonths(6), []);
  const trend = useMemo(
    () =>
      months.map((m) => {
        const x = f.pnl(m.from, m.to);
        return { label: m.label, expenses: x.operatingExpenses + x.courierCost + x.courierLoss, netProfit: x.netProfit, grossProfit: x.grossProfit };
      }),
    [f, months]
  );
  const activeAccounts = f.accounts.filter((a) => !a.archived);
  const recent = useMemo(() => [...f.entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 8), [f.entries]);

  if (!f.ready) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const donut = (() => {
    const top = pl.expensesByCategory.slice(0, 5);
    const rest = pl.expensesByCategory.slice(5).reduce((s, c) => s + c.amount, 0);
    return [...top.map((c, i) => ({ name: c.category, value: c.amount, color: PIE[i % PIE.length] })), ...(rest > 0 ? [{ name: "Other", value: rest, color: "#94a3b8" }] : [])];
  })();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeader title="Accounting" description="Where the money came from, where it went, and what is really left as profit." />
        {can("accounting", "create") && (
          <PrimaryButton onClick={() => setAdding(true)}>
            <Plus size={15} /> Add entry
          </PrimaryButton>
        )}
      </div>

      <PeriodBar period={period} />
      <DueBanner />

      <KpiGrid
        columns={3}
        items={[
          { label: "Revenue", value: taka(pl.revenue), sub: "Delivered orders + POS sales + delivery billed" },
          { label: "Gross profit", value: taka(pl.grossProfit), sub: "Revenue − product cost", tone: pl.grossProfit >= 0 ? "neutral" : "bad" },
          { label: "Courier cost", value: taka(pl.courierCost + pl.courierLoss), sub: pl.courierLoss > 0 ? `incl. ${taka(pl.courierLoss)} lost on returns` : "Delivery, return & other" },
          { label: "Operating expenses", value: taka(pl.operatingExpenses), sub: "Rent, salaries, boosting…", tone: "warn" },
          { label: "Other income", value: taka(pl.otherIncome) },
          { label: "Net profit", value: taka(pl.netProfit), sub: pl.revenue > 0 ? `${pl.margin}% of revenue` : undefined, tone: pl.netProfit >= 0 ? "good" : "bad" },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Where the money went" subtitle="Running expenses by category">
          {donut.length ? (
            <>
              <DonutChart data={donut} />
              <div className="mt-4">
                <RankBars rows={pl.expensesByCategory.slice(0, 6).map((c) => ({ label: c.category, value: c.amount, sub: taka(c.amount) }))} />
              </div>
            </>
          ) : (
            <p className="py-10 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
              No expenses in this period. Use <b>Add entry</b> to record rent, salaries, Facebook boosting and more.
            </p>
          )}
        </Panel>

        <Panel title="Last 6 months" subtitle="Expenses (incl. courier) against net profit">
          <TrendChart
            data={trend}
            series={[
              { key: "expenses", label: "Expenses + courier", color: COLORS.amber },
              { key: "netProfit", label: "Net profit", color: COLORS.green },
            ]}
            format={taka}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Accounts" right={<Link href="/accounting/accounts" className="text-[12.5px] font-medium" style={{ color: "var(--brand)" }}>Manage</Link>}>
          {activeAccounts.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Track where your money is (cash, bKash, bank) under <Link href="/accounting/accounts" className="underline">Accounts & balances</Link>. Optional — expenses work without it.
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
              {activeAccounts.map((a) => {
                const bal = accountBalance(a, f.entries);
                return (
                  <div key={a.id} className="flex items-center justify-between py-2 text-[13px]">
                    <span style={{ color: "var(--text)" }}>{a.name}</span>
                    <b className="tabular-nums" style={{ color: bal < 0 ? "var(--red)" : "var(--text)" }}>{taka(bal)}</b>
                  </div>
                );
              })}
              <div className="flex items-center justify-between pt-2 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                <span>Total</span>
                <span className="tabular-nums">{taka(activeAccounts.reduce((s, a) => s + accountBalance(a, f.entries), 0))}</span>
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Latest entries" right={<Link href="/accounting/ledger" className="text-[12.5px] font-medium" style={{ color: "var(--brand)" }}>See all</Link>}>
          {recent.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Nothing recorded yet.</p>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
              {recent.map((e: LedgerEntry) => (
                <div key={e.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                  <span className="min-w-0">
                    <span className="block truncate" style={{ color: "var(--text)" }}>{e.category ?? ENTRY_KIND_LABELS[e.kind]}</span>
                    <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>{e.date}{e.party ? ` · ${e.party}` : ""}</span>
                  </span>
                  <b className="tabular-nums" style={{ color: e.kind === "expense" || e.kind === "owner_out" ? "var(--red)" : e.kind === "transfer" ? "var(--text)" : "var(--green)" }}>
                    {e.kind === "expense" || e.kind === "owner_out" ? "−" : e.kind === "transfer" ? "" : "+"}
                    {taka(e.amount)}
                  </b>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <RuleNote>
        Profit is counted the way the dashboard counts it: an online order on the day it was delivered, a POS sale on the day it was rung up, an expense on the day it was paid.
        Net profit = revenue − product cost − courier cost − expenses + other income. Transfers, owner money and &ldquo;sales money received&rdquo; move balances but never change profit.
      </RuleNote>

      <EntryModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
