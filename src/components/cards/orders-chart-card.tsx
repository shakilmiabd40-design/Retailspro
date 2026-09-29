"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/lib/format";
import type { OrdersChartPoint } from "@/lib/types";

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number; dataKey: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const income = payload.find((p) => p.dataKey === "income")?.value ?? 0;
  const profit = payload.find((p) => p.dataKey === "profit")?.value ?? 0;
  const netProfit = payload.find((p) => p.dataKey === "netProfit")?.value ?? 0;

  return (
    <div className="rounded-xl border p-3 text-[12px] shadow-lg" style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}>
      <p className="mb-1.5 font-medium">{label}</p>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--chart-2)" }} />
          Sales
        </span>
        <span className="font-medium">{formatCurrency(income)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--brand)" }} />
          Gross profit
        </span>
        <span className="font-medium">{formatCurrency(profit)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--green)" }} />
          Net profit
        </span>
        <span className="font-medium" style={{ color: netProfit < 0 ? "var(--red)" : undefined }}>{formatCurrency(netProfit)}</span>
      </div>
    </div>
  );
}

export function OrdersChartCard({ data }: { data: OrdersChartPoint[] }) {
  const hasData = data.some((d) => d.income > 0 || d.profit > 0 || d.netProfit !== 0);

  return (
    <div className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            Sales &amp; Profit
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            Delivered orders, last 15 days · gross profit = sales − product cost · net profit = gross profit − courier cost − expenses
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--chart-2)" }} />
            Sales
          </span>
          <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--brand)" }} />
            Gross profit
          </span>
          <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
            <span className="h-2 w-2 rounded-full" style={{ background: "var(--green)" }} />
            Net profit
          </span>
        </div>
      </div>

      <div className="relative h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 0, left: -10, bottom: 0 }} barGap={2}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--text-faint)", fontSize: 11 }} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--text-faint)", fontSize: 11 }}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round((v / 1000) * 10) / 10}K` : `${v}`)}
            />
            <Tooltip cursor={{ fill: "var(--surface-2)" }} content={<CustomTooltip />} />
            <Bar dataKey="income" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={16} />
            <Bar dataKey="profit" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={16} />
            <Bar dataKey="netProfit" fill="var(--green)" radius={[4, 4, 0, 0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
        {!hasData && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            No delivered orders in the last 15 days.
          </p>
        )}
      </div>
    </div>
  );
}
