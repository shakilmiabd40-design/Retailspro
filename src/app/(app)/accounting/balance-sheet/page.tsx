"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useGL } from "@/lib/accounting/gl-store";
import { taka } from "@/lib/reports/format";
import { ReportHeader } from "@/components/reports/kpi";

export default function BalanceSheetPage() {
  const { coa, journals, hydrated, trialBalance } = useGL();
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const report = useMemo(() => {
    const tb = trialBalance(asOf);
    const values = new Map(tb.lines.map((row) => [row.account.id, row.debit - row.credit]));
    const balance = (type: string) => coa.filter((a) => !a.archived && a.type === type).reduce((sum, a) => {
      const raw = values.get(a.id) ?? 0;
      return sum + (a.normalBalance === "credit" ? -raw : raw);
    }, 0);
    let currentEarnings = 0;
    for (const journal of journals) if (journal.status === "posted" && journal.date <= asOf) {
      for (const line of journal.lines) {
        const account = coa.find((a) => a.id === line.accountId);
        if (!account || (account.type !== "revenue" && account.type !== "expense")) continue;
        currentEarnings += account.type === "revenue" ? line.credit - line.debit : line.credit - line.debit;
      }
    }
    return { assets: balance("asset"), liabilities: balance("liability"), equity: balance("equity"), currentEarnings };
  }, [trialBalance, asOf, coa, journals]);
  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading balance sheet…</p>;
  const totalEquity = report.equity + report.currentEarnings;
  const difference = report.assets - report.liabilities - totalEquity;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><ReportHeader title="Balance sheet" description="Assets, liabilities, and equity from posted journal balances." /><label className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>As of <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="ml-1 rounded-lg border px-2 py-1.5 text-[12px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} /></label></div>
    <nav className="flex flex-wrap gap-2 text-[12px]"><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/trial-balance">Trial balance</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/inventory">Inventory</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/journals">Journals</Link></nav>
    <div className="card max-w-3xl divide-y p-4" style={{ borderColor: "var(--border-soft)" }}>
      <Row title="Assets" value={report.assets} strong />
      <Row title="Liabilities" value={report.liabilities} />
      <Row title="Equity" value={report.equity} />
      <Row title="Current period earnings" value={report.currentEarnings} />
      <Row title="Total liabilities & equity" value={report.liabilities + totalEquity} strong />
      <Row title="Reconciliation difference" value={difference} strong tone={Math.abs(difference) < 0.01 ? "var(--green)" : "var(--red)"} />
    </div>
  </div>;
}

function Row({ title, value, strong, tone }: { title: string; value: number; strong?: boolean; tone?: string }) {
  return <div className="flex justify-between gap-3 py-3 text-[13px]" style={{ color: tone ?? "var(--text)", fontWeight: strong ? 650 : 400 }}><span>{title}</span><span className="tabular-nums">{taka(value)}</span></div>;
}
