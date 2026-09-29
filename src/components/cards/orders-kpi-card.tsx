"use client";

import { ShoppingCart } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { formatCompact } from "@/lib/format";
import { TrendPill } from "@/components/trend-pill";
import type { OrdersKpi } from "@/lib/types";

export function OrdersKpiCard({ data }: { data: OrdersKpi }) {
  return (
    <div className="card flex flex-col p-5">
      <div className="mb-1 flex items-start justify-between">
        <p className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
          Orders · Last 30 Days
        </p>
        <ShoppingCart size={15} style={{ color: "var(--text-faint)" }} />
      </div>

      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
          {formatCompact(data.last30)}
        </p>
        {data.trend && <TrendPill trend={data.trend} />}
      </div>
      <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-faint)" }}>
        {formatCompact(data.prev30)} in the previous 30 days
      </p>

      <div className="mt-3 h-20">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.sparkline} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="ordersKpiFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" hide />
            <Tooltip
              cursor={false}
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontSize: 12,
                color: "var(--text)",
              }}
              labelStyle={{ color: "var(--text-muted)" }}
              formatter={(value) => [value, "Orders"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--brand)"
              strokeWidth={2.25}
              fill="url(#ordersKpiFill)"
              dot={{ r: 3, fill: "var(--brand)", strokeWidth: 0 }}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-between text-[11px]" style={{ color: "var(--text-faint)" }}>
        {data.sparkline.map((p, i) => (
          <span key={i}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}
