"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { useGL } from "@/lib/accounting/gl-store";
import { api } from "@/lib/persist/api";
import { ReportHeader } from "@/components/reports/kpi";
import { GhostButton } from "@/components/settings/ui";
import { downloadCsv } from "@/lib/reports/export";
import { taka } from "@/lib/reports/format";

export default function TrialBalancePage() {
  const { coa, hydrated } = useGL();
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [balances, setBalances] = useState<{ accountId: string; debit: number; credit: number }[]>([]);
  const [loadingReport, setLoadingReport] = useState(true);
  const [reportError, setReportError] = useState("");
  useEffect(() => {
    let current = true;
    setLoadingReport(true);
    api<{ rows: { accountId: string; debit: number; credit: number }[] }>("GET", `/api/accounting/report?kind=balances&from=0001-01-01&to=${asOf}`)
      .then((result) => { if (current) { setBalances(result.rows); setReportError(""); } })
      .catch((error) => { if (current) setReportError(error instanceof Error ? error.message : "Could not load trial balance."); })
      .finally(() => { if (current) setLoadingReport(false); });
    return () => { current = false; };
  }, [asOf]);
  const report = useMemo(() => {
    const byId = new Map(balances.map((row) => [row.accountId, row]));
    const lines = coa.filter((account) => !account.archived && byId.has(account.id)).map((account) => {
      const row = byId.get(account.id)!;
      return { account, debit: Math.round(row.debit * 100) / 100, credit: Math.round(row.credit * 100) / 100 };
    }).filter((row) => row.debit !== 0 || row.credit !== 0);
    return { lines, totalDebit: Math.round(lines.reduce((sum, row) => sum + row.debit, 0) * 100) / 100, totalCredit: Math.round(lines.reduce((sum, row) => sum + row.credit, 0) * 100) / 100 };
  }, [balances, coa]);

  if (!hydrated || loadingReport) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading trial balance…</p>;
  const balanced = Math.abs(report.totalDebit - report.totalCredit) < 0.01;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ReportHeader title="Trial balance" description="Posted journal balances by account, through the selected date." />
        <div className="flex items-end gap-2">
          <label className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>As of <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="ml-1 rounded-lg border px-2 py-1.5 text-[12px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} /></label>
          <GhostButton onClick={() => downloadCsv("trial-balance", [
            { header: "Code", value: (r: typeof report.lines[number]) => r.account.code },
            { header: "Account", value: (r: typeof report.lines[number]) => r.account.name },
            { header: "Type", value: (r: typeof report.lines[number]) => r.account.type },
            { header: "Debit", value: (r: typeof report.lines[number]) => r.debit },
            { header: "Credit", value: (r: typeof report.lines[number]) => r.credit },
          ], report.lines)}><Download size={14} /> CSV</GhostButton>
        </div>
      </div>
      <nav className="flex flex-wrap gap-2 text-[12px]">
        <Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--brand)", color: "var(--brand)" }} href="/accounting/trial-balance">Trial balance</Link>
        <Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} href="/accounting/inventory">Inventory valuation</Link>
        <Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} href="/accounting/journals">Journal entries</Link>
      </nav>
      {reportError && <p role="alert" className="rounded-xl border px-4 py-3 text-[13px]" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{reportError}</p>}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[620px] text-[13px]">
          <thead><tr className="border-b text-left text-[11.5px] uppercase" style={{ borderColor: "var(--border-soft)", color: "var(--text-faint)" }}><th className="px-4 py-3">Code</th><th className="px-4 py-3">Account</th><th className="px-4 py-3">Type</th><th className="px-4 py-3 text-right">Debit</th><th className="px-4 py-3 text-right">Credit</th></tr></thead>
          <tbody>
            {report.lines.map((row) => <tr key={row.account.id} className="border-b" style={{ borderColor: "var(--border-soft)" }}><td className="px-4 py-2.5 tabular-nums" style={{ color: "var(--text-faint)" }}>{row.account.code}</td><td className="px-4 py-2.5 font-medium" style={{ color: "var(--text)" }}>{row.account.name}</td><td className="px-4 py-2.5 capitalize" style={{ color: "var(--text-muted)" }}>{row.account.type}</td><td className="px-4 py-2.5 text-right tabular-nums">{row.debit ? taka(row.debit) : "—"}</td><td className="px-4 py-2.5 text-right tabular-nums">{row.credit ? taka(row.credit) : "—"}</td></tr>)}
            <tr className="font-semibold" style={{ background: "var(--surface-2)", color: "var(--text)" }}><td colSpan={3} className="px-4 py-3">Total {balanced ? "· Balanced" : "· Out of balance"}</td><td className="px-4 py-3 text-right tabular-nums">{taka(report.totalDebit)}</td><td className="px-4 py-3 text-right tabular-nums">{taka(report.totalCredit)}</td></tr>
          </tbody>
        </table>
        {!report.lines.length && <p className="p-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>No posted journals through this date.</p>}
      </div>
    </div>
  );
}
