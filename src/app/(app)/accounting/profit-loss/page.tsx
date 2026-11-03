"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { useGL } from "@/lib/accounting/gl-store";
import { lastMonths } from "@/lib/accounting/utils";
import { periodRange, todayKey } from "@/lib/accounting/utils";
import { taka } from "@/lib/reports/format";
import { downloadCsv } from "@/lib/reports/export";
import { useAccess } from "@/lib/settings/access";
import { GhostButton } from "@/components/settings/ui";
import { Panel, ReportHeader } from "@/components/reports/kpi";
import { COLORS, TrendChart } from "@/components/reports/charts";

type Report = { revenue: number; cogs: number; courier: number; operating: number; otherExpenses: number; otherIncome: number; grossProfit: number; netProfit: number; accounts: { name: string; code: string; amount: number }[] };

export default function ProfitLossPage() {
  const { coa, journals, hydrated } = useGL();
  const { can } = useAccess();
  const [count, setCount] = useState<3 | 6 | 12>(6);
  const [custom, setCustom] = useState(false);
  const [customRange, setCustomRange] = useState(() => ({ from: periodRange("this_month").from, to: todayKey() }));
  const months = useMemo(() => custom ? [{ key: "custom", label: "Custom range", ...customRange }] : lastMonths(count), [count, custom, customRange]);
  const accountById = useMemo(() => new Map(coa.map((account) => [account.id, account])), [coa]);
  const totalsByPeriod = useMemo(() => {
    const totals = months.map(() => new Map<string, number>());
    for (const journal of journals) {
      if (journal.status !== "posted") continue;
      const index = months.findIndex((month) => journal.date >= month.from && journal.date <= month.to);
      if (index < 0) continue;
      for (const line of journal.lines) {
        const account = accountById.get(line.accountId);
        if (!account || (account.type !== "revenue" && account.type !== "expense")) continue;
        const amount = account.type === "revenue" ? line.credit - line.debit : line.debit - line.credit;
        const periodTotals = totals[index];
        periodTotals.set(account.id, (periodTotals.get(account.id) ?? 0) + amount);
      }
    }
    return totals;
  }, [months, journals, accountById]);
  const report = useCallback((totals: Map<string, number>): Report => {
    const entries = coa.filter((a) => totals.has(a.id)).map((a) => ({ name: a.name, code: a.code, amount: totals.get(a.id) ?? 0 }));
    const sum = (filter: (code: string, type: string) => boolean) => entries.reduce((s, a) => s + (filter(a.code, coa.find((x) => x.code === a.code)?.type ?? "") ? a.amount : 0), 0);
    const revenue = sum((code, type) => type === "revenue" && code !== "4030");
    const otherIncome = sum((code, type) => type === "revenue" && code === "4030");
    const cogs = sum((code, type) => type === "expense" && code.startsWith("5"));
    const courier = sum((code) => code === "6040");
    const operating = sum((code, type) => type === "expense" && code.startsWith("6") && code !== "6040");
    const otherExpenses = sum((code, type) => type === "expense" && !code.startsWith("5") && !code.startsWith("6"));
    const grossProfit = revenue - cogs;
    return { revenue, cogs, courier, operating, otherExpenses, otherIncome, grossProfit, netProfit: grossProfit - courier - operating - otherExpenses + otherIncome, accounts: entries };
  }, [coa]);
  const reports = useMemo(() => totalsByPeriod.map((totals) => report(totals)), [totalsByPeriod, report]);
  const all = useMemo(() => {
    if (!totalsByPeriod.length) return null;
    const totals = new Map<string, number>();
    for (const period of totalsByPeriod) for (const [id, amount] of period) totals.set(id, (totals.get(id) ?? 0) + amount);
    return report(totals);
  }, [totalsByPeriod, report]);
  if (!hydrated || !all) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading profit & loss…</p>;
  const rows = [
    { label: "Revenue", get: (r: Report) => r.revenue },
    { label: "Other income", get: (r: Report) => r.otherIncome },
    { label: "Cost of goods sold", get: (r: Report) => -r.cogs },
    { label: "Gross profit", get: (r: Report) => r.grossProfit, total: true },
    { label: "Courier & delivery expense", get: (r: Report) => -r.courier },
    { label: "Operating expenses", get: (r: Report) => -r.operating },
    { label: "Other expenses", get: (r: Report) => -r.otherExpenses },
    { label: "Net profit", get: (r: Report) => r.netProfit, total: true },
  ];
  const trend = months.map((m, i) => ({ label: m.label, revenue: reports[i].revenue, netProfit: reports[i].netProfit }));
  const exportRows = rows.map((row) => ({ label: row.label, values: [...reports.map((r) => row.get(r)), row.get(all)] }));

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><ReportHeader title="Profit & Loss" description="Revenue and expenses from posted journals, using the General Ledger as the source of truth." /><div className="flex flex-wrap items-center gap-2">{([3, 6, 12] as const).map((n) => <button key={n} onClick={() => { setCustom(false); setCount(n); }} aria-pressed={!custom && count === n} className="focus-ring rounded-full border px-3 py-1.5 text-[12.5px] font-medium" style={{ borderColor: !custom && count === n ? "var(--brand)" : "var(--border)", background: !custom && count === n ? "var(--brand-soft)" : "var(--surface)", color: !custom && count === n ? "var(--brand-strong)" : "var(--text-muted)" }}>{n} months</button>)}<button onClick={() => setCustom(true)} aria-pressed={custom} className="focus-ring rounded-full border px-3 py-1.5 text-[12.5px] font-medium" style={{ borderColor: custom ? "var(--brand)" : "var(--border)", background: custom ? "var(--brand-soft)" : "var(--surface)", color: custom ? "var(--brand-strong)" : "var(--text-muted)" }}>Custom dates</button>{can("accounting", "export") && <GhostButton onClick={() => downloadCsv("profit-and-loss", [{ header: "Line", value: (r: (typeof exportRows)[number]) => r.label }, ...[...months.map((m) => m.label), "Total"].map((h, i) => ({ header: h, value: (r: (typeof exportRows)[number]) => r.values[i] }))], exportRows)}><Download size={14} /> CSV</GhostButton>}</div></div>
    {custom && <div className="flex flex-wrap items-end gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}><label className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>From<input type="date" max={customRange.to} value={customRange.from} onChange={(e) => e.target.value && setCustomRange((r) => ({ ...r, from: e.target.value }))} className="mt-1 block rounded-lg border px-2.5 py-1.5 text-[12px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} /></label><label className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>To<input type="date" min={customRange.from} value={customRange.to} onChange={(e) => e.target.value && setCustomRange((r) => ({ ...r, to: e.target.value }))} className="mt-1 block rounded-lg border px-2.5 py-1.5 text-[12px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} /></label></div>}
    <nav className="flex flex-wrap gap-2 text-[12px]"><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/trial-balance">Trial balance</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/balance-sheet">Balance sheet</Link><Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/inventory">Inventory valuation</Link></nav>
    <Panel title="Revenue vs net profit"><TrendChart data={trend} series={[{ key: "revenue", label: "Revenue", color: COLORS.blue }, { key: "netProfit", label: "Net profit", color: COLORS.green }]} format={taka} height={240} /></Panel>
    <div className="card overflow-x-auto"><table className="w-full min-w-[640px] text-[13px]"><thead><tr className="text-left text-[11.5px] uppercase" style={{ color: "var(--text-faint)" }}><th className="sticky left-0 px-4 py-2.5" style={{ background: "var(--surface)" }}>Line</th>{months.map((m) => <th key={m.key} className="px-3 py-2.5 text-right">{m.label}</th>)}<th className="px-4 py-2.5 text-right">Total</th></tr></thead><tbody>{rows.map((row) => <tr key={row.label} className="border-t" style={{ borderColor: "var(--border-soft)", fontWeight: row.total ? 650 : 400 }}><td className="sticky left-0 px-4 py-2" style={{ background: "var(--surface)", color: "var(--text)" }}>{row.label}</td>{[...reports.map(row.get), row.get(all)].map((value, i) => <td key={i} className="px-3 py-2 text-right tabular-nums" style={{ color: row.label === "Net profit" ? value >= 0 ? "var(--green)" : "var(--red)" : "var(--text)" }}>{taka(value)}</td>)}</tr>)}</tbody></table></div>
  </div>;
}
