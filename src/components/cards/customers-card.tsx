import { Users } from "lucide-react";
import { formatCompact } from "@/lib/format";
import { TrendPill } from "@/components/trend-pill";
import type { CustomersKpi } from "@/lib/types";

export function CustomersCard({ data }: { data: CustomersKpi }) {
  return (
    <div
      className="flex flex-col rounded-2xl border p-5"
      style={{ background: "var(--brand-tint-bg)", borderColor: "var(--brand-tint-border)" }}
    >
      <div className="mb-1 flex items-start justify-between">
        <p className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
          Total Customers
        </p>
        <Users size={16} style={{ color: "var(--brand)" }} />
      </div>

      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-semibold" style={{ color: "var(--text)" }}>
          {formatCompact(data.total)}
        </p>
        {data.trend && <TrendPill trend={data.trend} />}
      </div>
      <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-faint)" }}>
        {data.trend ? "vs 30 days ago" : "Unique customers by phone number"}
      </p>

      <div className="my-4 flex items-center justify-between rounded-xl border px-3 py-2" style={{ borderColor: "var(--brand-tint-border)" }}>
        <div>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            New Customers (30 days)
          </p>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            {formatCompact(data.new30)}
          </p>
        </div>
        {data.newTrend && <TrendPill trend={data.newTrend} />}
      </div>

      <div className="mb-2">
        <p className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
          New vs Repeat Customers
        </p>
      </div>

      <div className="mb-3 flex h-1.5 overflow-hidden rounded-full" style={{ background: "var(--brand-tint-border)" }}>
        <div style={{ width: `${data.oneTimePct}%`, background: "var(--brand)" }} />
        <div style={{ width: `${data.repeatPct}%`, background: "var(--chart-4)" }} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            {data.oneTimePct}%
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            One-time
          </p>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            {formatCompact(data.oneTimeCount)}
          </p>
        </div>
        <div>
          <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            {data.repeatPct}%
          </p>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Repeat (2+ orders)
          </p>
          <p className="mt-1 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            {formatCompact(data.repeatCount)}
          </p>
        </div>
      </div>
    </div>
  );
}
