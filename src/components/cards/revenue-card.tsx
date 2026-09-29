"use client";

import { Wallet } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatCurrency } from "@/lib/format";
import { TrendPill } from "@/components/trend-pill";
import type { RevenueKpi } from "@/lib/types";

export function RevenueCard({ data }: { data: RevenueKpi }) {
  return (
    <div className="card flex flex-col p-5">
      <div className="mb-1 flex items-start justify-between">
        <p className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
          Net Revenue · Last 30 Days
        </p>
        <Wallet size={16} style={{ color: "var(--text-faint)" }} />
      </div>

      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
          {formatCurrency(data.last30)}
        </p>
        {data.trend && <TrendPill trend={data.trend} />}
      </div>
      <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-faint)" }}>
        {formatCurrency(data.prev30)} in the previous 30 days
      </p>
      <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
        Delivered orders, last 7 days
      </p>

      <div className="mt-2 h-20">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.last7Days} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <XAxis dataKey="label" hide />
            <Tooltip
              cursor={{ fill: "var(--surface-2)" }}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
                color: "var(--text)",
              }}
              labelStyle={{ color: "var(--text-muted)" }}
              formatter={(value) => formatCurrency(Number(value))}
            />
            <Bar dataKey="value" radius={[4, 4, 4, 4]} fill="var(--brand)" maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-between text-[11px]" style={{ color: "var(--text-faint)" }}>
        {data.last7Days.map((p, i) => (
          <span key={i}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}
