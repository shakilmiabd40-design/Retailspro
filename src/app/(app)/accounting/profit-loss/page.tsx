"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useFinance } from "@/lib/accounting/use-finance";
import { lastMonths } from "@/lib/accounting/utils";
import { taka } from "@/lib/reports/format";
import { downloadCsv } from "@/lib/reports/export";
import { useAccess } from "@/lib/settings/access";
import { GhostButton } from "@/components/settings/ui";
import { Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { COLORS, TrendChart } from "@/components/reports/charts";

type Row = { label: string; get: (i: number) => number; kind?: "head" | "total" | "sub" | "line"; negative?: boolean };

export default function ProfitLossPage() {
  const f = useFinance();
  const { can } = useAccess();
  const [count, setCount] = useState<3 | 6 | 12>(6);
  const months = useMemo(() => lastMonths(count), [count]);
  const cols = useMemo(() => months.map((m) => f.pnl(m.from, m.to)), [f, months]);
  const all = useMemo(() => (months.length ? f.pnl(months[0].from, months[months.length - 1].to) : null), [f, months]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const c of [...cols, ...(all ? [all] : [])]) for (const e of c.expensesByCategory) set.add(e.category);
    return [...set].sort((a, b) => (all?.expensesByCategory.find((x) => x.category === b)?.amount ?? 0) - (all?.expensesByCategory.find((x) => x.category === a)?.amount ?? 0));
  }, [cols, all]);

  if (!f.ready || !all) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const catOf = (i: number | "all", c: string) => (i === "all" ? all : cols[i]).expensesByCategory.find((e) => e.category === c)?.amount ?? 0;
  const pick = (i: number | "all") => (i === "all" ? all : cols[i]);

  const rows: (Row & { cat?: string })[] = [
    { label: "Revenue", kind: "head", get: () => 0 },
    { label: "Online orders — product sales", get: (i) => pick(i).orderSales },
    { label: "Delivery charge billed", get: (i) => pick(i).deliveryBilled },
    { label: "POS walk-in sales (net of returns)", get: (i) => pick(i).posSales },
    { label: "Total revenue", kind: "total", get: (i) => pick(i).revenue },
    { label: "Cost of goods sold (product cost)", negative: true, get: (i) => pick(i).cogs },
    { label: "Gross profit", kind: "total", get: (i) => pick(i).grossProfit },
    { label: "Courier & delivery costs", kind: "head", get: () => 0 },
    { label: "Courier cost on delivered orders", negative: true, get: (i) => pick(i).courierCost },
    { label: "Courier loss on refused / partial parcels", negative: true, get: (i) => pick(i).courierLoss },
    { label: "Operating expenses", kind: "head", get: () => 0 },
    ...categories.map((c) => ({ label: c, negative: true, cat: c, get: (i: number) => catOf(i, c) })),
    { label: "Total operating expenses", kind: "total", negative: true, get: (i) => pick(i).operatingExpenses },
    { label: "Other income", get: (i) => pick(i).otherIncome },
    { label: "NET PROFIT", kind: "total", get: (i) => pick(i).netProfit },
  ];

  // `get(i)` takes a column index; the "Total" column passes "all" through a small shim.
  const cell = (r: Row, i: number | "all") => (r.get as (i: number | "all") => number)(i);

  function exportCsv() {
    const header = [...months.map((m) => m.label), "Total"];
    const data = rows.filter((r) => r.kind !== "head").map((r) => ({ label: r.label, values: [...months.map((_, i) => cell(r, i)), cell(r, "all")].map((v) => (r.negative ? -v : v)) }));
    downloadCsv(
      "profit-and-loss",
      [{ header: "Line", value: (d: (typeof data)[number]) => d.label }, ...header.map((h, i) => ({ header: h, value: (d: (typeof data)[number]) => d.values[i] }))],
      data
    );
  }

  const trend = months.map((m, i) => ({ label: m.label, revenue: cols[i].revenue, netProfit: cols[i].netProfit }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ReportHeader title="Profit & Loss" description="Month by month: what came in, what it cost, and what is left." />
        <div className="flex flex-wrap items-center gap-2">
          {([3, 6, 12] as const).map((n) => (
            <button
              key={n}
              onClick={() => setCount(n)}
              aria-pressed={count === n}
              className="focus-ring rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
              style={{ borderColor: count === n ? "var(--brand)" : "var(--border)", background: count === n ? "var(--brand-soft)" : "var(--surface)", color: count === n ? "var(--brand-strong)" : "var(--text-muted)" }}
            >
              {n} months
            </button>
          ))}
          {can("accounting", "export") && (
            <GhostButton onClick={exportCsv}>
              <Download size={14} /> CSV
            </GhostButton>
          )}
        </div>
      </div>

      <Panel title="Revenue vs net profit">
        <TrendChart data={trend} series={[{ key: "revenue", label: "Revenue", color: COLORS.blue }, { key: "netProfit", label: "Net profit", color: COLORS.green }]} format={taka} height={240} />
      </Panel>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] uppercase" style={{ color: "var(--text-faint)" }}>
              <th className="sticky left-0 px-4 py-2.5 font-semibold" style={{ background: "var(--surface)" }}>Line</th>
              {months.map((m) => (
                <th key={m.key} className="px-3 py-2.5 text-right font-semibold">{m.label}</th>
              ))}
              <th className="px-4 py-2.5 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              if (r.kind === "head")
                return (
                  <tr key={idx} className="border-t" style={{ borderColor: "var(--border-soft)", background: "var(--surface-2)" }}>
                    <td colSpan={months.length + 2} className="px-4 py-1.5 text-[11.5px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>{r.label}</td>
                  </tr>
                );
              const bold = r.kind === "total";
              const net = r.label === "NET PROFIT";
              return (
                <tr key={idx} className="border-t" style={{ borderColor: "var(--border-soft)", fontWeight: bold ? 600 : 400 }}>
                  <td className="sticky left-0 px-4 py-2" style={{ background: "var(--surface)", color: "var(--text)" }}>{r.label}</td>
                  {[...months.map((_, i) => cell(r, i)), cell(r, "all")].map((v, i, arr) => (
                    <td key={i} className="px-3 py-2 text-right tabular-nums" style={{ color: net ? (v >= 0 ? "var(--green)" : "var(--red)") : r.negative && v ? "var(--text-muted)" : "var(--text)", fontWeight: i === arr.length - 1 || bold ? 600 : 400 }}>
                      {r.negative && v ? "−" : ""}
                      {v < 0 ? "−" : ""}
                      {taka(Math.abs(v))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <RuleNote>
        Revenue and product cost count Delivered online orders (on the delivery date) plus POS walk-in sales (on the sale date; returned items are taken off).
        Courier cost is what you pay the courier for delivered parcels; refused or partly delivered parcels add their courier loss. Expenses and other income come from Accounting entries on the day they were paid or received.
        Transfers, owner money and sales money received never change profit.
      </RuleNote>
    </div>
  );
}
