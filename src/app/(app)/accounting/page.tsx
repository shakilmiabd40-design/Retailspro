"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGL } from "@/lib/accounting/gl-store";
import { api } from "@/lib/persist/api";
import { useAccess } from "@/lib/settings/access";
import { PeriodBar, usePeriod } from "@/components/accounting/period-bar";
import { HistoryConversionCard } from "@/components/accounting/history-conversion-card";
import { KpiGrid, ReportHeader } from "@/components/reports/kpi";
import { taka } from "@/lib/reports/format";

export default function AccountingOverviewPage() {
  const { hydrated } = useGL();
  const { can } = useAccess();
  const period = usePeriod("this_month");
  const [report, setReport] = useState<{ revenue: number; cogs: number; grossProfit: number; expenses: number; netProfit: number; inventory: number; openGrni: number; drafts: number; recentJournals: { id: string; narration: string; date: string; entryNumber: string; totalDebit: number }[]; hasPosted: boolean } | null>(null);
  const [reportError, setReportError] = useState("");
  useEffect(() => {
    let current = true;
    api<{
      summary: { revenue: number; cogs: number; expenses: number; inventory: number; openGrni: number; drafts: number };
      recentJournals: { id: string; narration: string; date: string; entryNumber: string; totalDebit: number }[];
      hasPosted: boolean;
    }>("GET", `/api/accounting/overview?from=${period.from}&to=${period.to}`)
      .then((result) => {
        if (!current) return;
        const { revenue, cogs, expenses } = result.summary;
        setReport({ ...result.summary, revenue, cogs, expenses, grossProfit: revenue - cogs, netProfit: revenue - cogs - expenses, recentJournals: result.recentJournals, hasPosted: result.hasPosted });
        setReportError("");
      })
      .catch((error) => { if (current) setReportError(error instanceof Error ? error.message : "Could not load accounting overview."); });
    return () => { current = false; };
  }, [period.from, period.to]);

  if (!hydrated || !report) {
    if (reportError) return <p role="alert" className="rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{reportError}</p>;
    return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading accounting…</p>;
  }

  const links = [
    ["Trial balance", "/accounting/trial-balance"], ["Inventory valuation", "/accounting/inventory"],
    ["Journal entries", "/accounting/journals"], ["Chart of accounts", "/accounting/chart-of-accounts"],
    ["Balance sheet", "/accounting/balance-sheet"], ["GRNI aging", "/accounting/grni"],
    ["Posting settings", "/accounting/settings"], ["Accounting periods", "/accounting/periods"],
  ];

  return (
    <div className="space-y-5">
      <ReportHeader title="Accounting" description="Double-entry accounts, FIFO inventory valuation, and posting controls." />
      <PeriodBar period={period} />
      <HistoryConversionCard />
      <nav className="flex flex-wrap gap-2 text-[12px]">
        {links.map(([label, href]) => <Link key={href} className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} href={href}>{label}</Link>)}
      </nav>
      <KpiGrid columns={3} items={[
        { label: "Revenue", value: taka(report.revenue) },
        { label: "Cost of goods sold", value: taka(report.cogs) },
        { label: "Gross profit", value: taka(report.grossProfit), tone: report.grossProfit >= 0 ? "good" : "bad" },
        { label: "Other expenses", value: taka(report.expenses) },
        { label: "Net profit", value: taka(report.netProfit), tone: report.netProfit >= 0 ? "good" : "bad" },
        { label: "Inventory at FIFO cost", value: taka(report.inventory) },
      ]} />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Posting status</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
            <div><span style={{ color: "var(--text-muted)" }}>Draft journals</span><strong className="mt-1 block text-base" style={{ color: "var(--text)" }}>{report.drafts}</strong></div>
            <div><span style={{ color: "var(--text-muted)" }}>Uninvoiced receipts</span><strong className="mt-1 block text-base" style={{ color: "var(--text)" }}>{taka(report.openGrni)}</strong></div>
          </div>
          {report.drafts > 0 && can("accounting", "approve") && <Link className="mt-3 inline-block text-[12px] font-medium" style={{ color: "var(--brand)" }} href="/accounting/journals">Review draft journals →</Link>}
        </section>
        <section className="card p-4">
          <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Recent posted entries</h2>
          <div className="mt-2 divide-y" style={{ borderColor: "var(--border-soft)" }}>
            {report.recentJournals.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 py-2 text-[12px]"><span className="min-w-0"><span className="block truncate font-medium" style={{ color: "var(--text)" }}>{entry.narration}</span><span style={{ color: "var(--text-faint)" }}>{entry.date} · {entry.entryNumber}</span></span><b className="shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>{taka(entry.totalDebit)}</b></div>)}
            {!report.hasPosted && <p className="py-4 text-[12px]" style={{ color: "var(--text-muted)" }}>No posted entries. Review the history conversion card above to start the general ledger.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
