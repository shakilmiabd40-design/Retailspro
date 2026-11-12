"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { lastMonths, periodRange, todayKey } from "@/lib/accounting/utils";
import { taka } from "@/lib/reports/format";
import { downloadCsv } from "@/lib/reports/export";
import { useAccess } from "@/lib/settings/access";
import { GhostButton } from "@/components/settings/ui";
import { Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { COLORS, TrendChart } from "@/components/reports/charts";
import { useReportApi } from "@/lib/reports/use-report";

interface PnlLineRow {
  key: string;
  label: string;
  kind: "detail" | "subtotal" | "total";
  values: number[];
  help?: string;
}

interface ProfitLossPayload {
  periods: { key: string; label: string; from: string; to: string }[];
  lines: PnlLineRow[];
  unposted: { label: string; amount: number; note: string }[];
  canSeeCost: boolean;
}

export default function ProfitLossPage() {
  const { can } = useAccess();
  const [count, setCount] = useState<3 | 6 | 12>(6);
  const [custom, setCustom] = useState(false);
  const [customRange, setCustomRange] = useState(() => ({ from: periodRange("this_month").from, to: todayKey() }));

  const months = useMemo(
    () => (custom ? [{ key: "custom", label: "Custom range", ...customRange }] : lastMonths(count)),
    [count, custom, customRange]
  );

  const { data, loading, error } = useReportApi<ProfitLossPayload>("/api/reports/profit-loss", {
    periods: JSON.stringify(months.map((month) => ({ key: month.key, label: month.label, from: month.from, to: month.to }))),
    dimension: "none",
  });

  const trend = useMemo(
    () =>
      (data?.lines ?? []).length
        ? (data?.periods ?? []).map((period, index) => ({
            label: period.label,
            revenue: data?.lines.find((line) => line.key === "revenue")?.values[index] ?? 0,
            netProfit: data?.lines.find((line) => line.key === "netProfit")?.values[index] ?? 0,
          }))
        : [],
    [data]
  );

  if (error) return <p className="rounded-xl border px-4 py-3 text-[13px]" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</p>;
  if (loading || !data) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading profit & loss…</p>;

  // The total column is the sum of the periods shown.
  const totals = data.lines.map((line) => ({ label: line.label, values: [...line.values, line.values.reduce((sum, value) => sum + value, 0)] }));

  const exportRows = totals.map((row) => ({ label: row.label, values: row.values }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeader title="Profit & Loss" description="Revenue and expenses from posted journals, using the General Ledger as the source of truth." />
        <div className="flex flex-wrap items-center gap-2">
          {([3, 6, 12] as const).map((n) => (
            <button
              key={n}
              onClick={() => { setCustom(false); setCount(n); }}
              aria-pressed={!custom && count === n}
              className="focus-ring rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
              style={{ borderColor: !custom && count === n ? "var(--brand)" : "var(--border)", background: !custom && count === n ? "var(--brand-soft)" : "var(--surface)", color: !custom && count === n ? "var(--brand-strong)" : "var(--text-muted)" }}
            >
              {n} months
            </button>
          ))}
          <button
            onClick={() => setCustom(true)}
            aria-pressed={custom}
            className="focus-ring rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
            style={{ borderColor: custom ? "var(--brand)" : "var(--border)", background: custom ? "var(--brand-soft)" : "var(--surface)", color: custom ? "var(--brand-strong)" : "var(--text-muted)" }}
          >
            Custom dates
          </button>
          {can("accounting", "export") && (
            <GhostButton onClick={() => downloadCsv("profit-and-loss", [{ header: "Line", value: (r: { label: string }) => r.label }, ...[...months.map((m) => m.label), "Total"].map((h, i) => ({ header: h, value: (r: { values: number[] }) => r.values[i] }))], exportRows)}>
              <Download size={14} /> CSV
            </GhostButton>
          )}
        </div>
      </div>

      {custom && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <label className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            From
            <input type="date" max={customRange.to} value={customRange.from} onChange={(e) => e.target.value && setCustomRange((r) => ({ ...r, from: e.target.value }))} className="mt-1 block rounded-lg border px-2.5 py-1.5 text-[12px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} />
          </label>
          <label className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            To
            <input type="date" min={customRange.from} value={customRange.to} onChange={(e) => e.target.value && setCustomRange((r) => ({ ...r, to: e.target.value }))} className="mt-1 block rounded-lg border px-2.5 py-1.5 text-[12px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} />
          </label>
        </div>
      )}

      <RuleNote>
        The same statement as Reports → Profit & Loss, so the two screens can never disagree.
        Ad spend and COD service fees are real costs that are never posted to the ledger, so they are added as their own lines.
      </RuleNote>

      <nav className="flex flex-wrap gap-2 text-[12px]">
        <Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/trial-balance">Trial balance</Link>
        <Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/balance-sheet">Balance sheet</Link>
        <Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/inventory">Inventory valuation</Link>
        <Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--brand)" }} href="/reports/profit-loss">Report Builder version</Link>
      </nav>

      <Panel title="Revenue vs net profit">
        <TrendChart data={trend} series={[{ key: "revenue", label: "Revenue", color: COLORS.blue }, { key: "netProfit", label: "Net profit", color: COLORS.green }]} format={taka} height={240} />
      </Panel>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] uppercase" style={{ color: "var(--text-faint)" }}>
              <th className="sticky left-0 px-4 py-2.5" style={{ background: "var(--surface)" }}>Line</th>
              {months.map((month) => (
                <th key={month.key} className="px-3 py-2.5 text-right">{month.label}</th>
              ))}
              <th className="px-4 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((line) => (
              <tr key={line.key} className="border-t" style={{ borderColor: "var(--border-soft)", fontWeight: line.kind === "detail" ? 400 : 650 }}>
                <td className="sticky left-0 px-4 py-2" style={{ background: "var(--surface)", color: "var(--text)" }}>
                  {line.label}
                  {line.help && <span className="block text-[11px] font-normal" style={{ color: "var(--text-faint)" }}>{line.help}</span>}
                </td>
                {line.values.map((value, index) => (
                  <td key={index} className="px-3 py-2 text-right tabular-nums" style={{ color: line.key === "netProfit" ? value >= 0 ? "var(--green)" : "var(--red)" : "var(--text)" }}>
                    {line.key === "margin" ? `${Math.round(value)}%` : taka(value)}
                  </td>
                ))}
                <td className="px-4 py-2 text-right tabular-nums" style={{ color: line.key === "netProfit" ? (line.values.reduce((s, v) => s + v, 0) >= 0 ? "var(--green)" : "var(--red)") : "var(--text)" }}>
                  {line.key === "margin" ? `${Math.round(line.values.reduce((s, v) => s + v, 0) / Math.max(1, line.values.length))}%` : taka(line.values.reduce((s, v) => s + v, 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.unposted.length > 0 && (
        <Panel title="Not in the ledger" subtitle="Real costs that are counted here but were never posted as journal entries.">
          <ul className="space-y-1 text-[12.5px]">
            {data.unposted.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3">
                <span style={{ color: "var(--text)" }}>{row.label} <span style={{ color: "var(--text-faint)" }}>· {row.note}</span></span>
                <span className="tabular-nums" style={{ color: "var(--text)" }}>{taka(row.amount)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
