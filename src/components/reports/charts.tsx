"use client";

import type { OrderStatus } from "@/lib/orders/types";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface Series {
  key: string;
  label: string;
  color: string;
}

const axis = { fill: "var(--text-faint)", fontSize: 11 };
const tooltipStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--text)" };

/** Fixed hues that read on both the light and dark theme. */
export const COLORS = {
  green: "#22c55e",
  red: "#f43f5e",
  amber: "#f59e0b",
  blue: "#3b82f6",
  brand: "#f97316",
  grey: "#94a3b8",
  purple: "#8b5cf6",
};

export const STATUS_CHART_COLORS: Record<OrderStatus, string> = {
  pending: COLORS.grey,
  processing: COLORS.brand,
  in_transit: COLORS.blue,
  delivered: COLORS.green,
  partial_delivered: COLORS.amber,
  refuse_return: COLORS.red,
  cancelled: "#64748b",
};

const compact = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round((v / 1000) * 10) / 10}K` : `${v}`);

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
      {text}
    </div>
  );
}

export function TrendChart({
  data,
  series,
  kind = "bar",
  stacked,
  height = 260,
  format,
  emptyText = "No data for these filters.",
}: {
  data: Record<string, string | number>[];
  series: Series[];
  kind?: "bar" | "line";
  stacked?: boolean;
  height?: number;
  format?: (v: number) => string;
  emptyText?: string;
}) {
  const hasData = data.some((d) => series.some((s) => Number(d[s.key]) !== 0));
  const fmt = format ?? ((v: number) => v.toLocaleString("en-US"));
  return (
    <div style={{ height }} className="w-full">
      {!hasData ? (
        <Empty text={emptyText} />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          {kind === "line" ? (
            <LineChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border-soft)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axis} minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} tick={axis} tickFormatter={compact} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmt(Number(v)), n]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              {series.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.25} dot={false} />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid stroke="var(--border-soft)" vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axis} minTickGap={16} />
              <YAxis tickLine={false} axisLine={false} tick={axis} tickFormatter={compact} />
              <Tooltip cursor={{ fill: "var(--surface-2)" }} contentStyle={tooltipStyle} formatter={(v, n) => [fmt(Number(v)), n]} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} stackId={stacked ? "a" : undefined} radius={stacked ? 0 : [3, 3, 0, 0]} maxBarSize={28} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function DonutChart({ data, height = 220 }: { data: { name: string; value: number; color: string }[]; height?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <div style={{ height }}><Empty text="No data for these filters." /></div>;
  return (
    <div className="flex flex-wrap items-center justify-center gap-6">
      <div style={{ height, width: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data.filter((d) => d.value > 0)} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
              {data.filter((d) => d.value > 0).map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [`${v} (${Math.round((Number(v) / total) * 100)}%)`, n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.name} className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            <span className="w-32">{d.name}</span>
            <span className="font-medium tabular-nums" style={{ color: "var(--text)" }}>
              {d.value}
            </span>
            <span className="tabular-nums" style={{ color: "var(--text-faint)" }}>
              {Math.round((d.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ranked horizontal bars for "top N" lists. */
export function RankBars({ rows, unit = "", color = "var(--brand)" }: { rows: { label: string; value: number; sub?: string }[]; unit?: string; color?: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="py-8 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>No data for these filters.</p>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="truncate" style={{ color: "var(--text)" }} title={r.label}>
              {r.label}
            </span>
            <span className="shrink-0 font-medium tabular-nums" style={{ color: "var(--text)" }}>
              {r.value.toLocaleString("en-US")}
              {unit}
              {r.sub && <span className="ml-1.5 font-normal" style={{ color: "var(--text-faint)" }}>{r.sub}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
