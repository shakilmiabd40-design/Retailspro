"use client";

import { useState } from "react";
import { RangeTabs } from "@/components/cards/range-tabs";
import type { DistrictShare, RangeKey } from "@/lib/types";

export function TopDistrictsCard({ data }: { data: Record<RangeKey, DistrictShare[]> }) {
  const [range, setRange] = useState<RangeKey>("all");
  const rows = data[range];
  const max = Math.max(...rows.map((d) => d.pct), 1);

  return (
    <div className="card flex flex-col p-5">
      <div className="mb-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Top Districts
        </p>
        <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          Share of orders by customer district
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            No orders in this period.
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-4">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 truncate text-[12px]" style={{ color: "var(--text-muted)" }} title={row.label}>
                {row.label}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
                <div className="h-full rounded-full" style={{ width: `${(row.pct / max) * 100}%`, background: "var(--brand)" }} />
              </div>
              <span className="w-14 shrink-0 text-right text-[12px] font-medium" style={{ color: "var(--text)" }}>
                {row.pct}% <span style={{ color: "var(--text-faint)" }}>· {row.count}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-5">
        <RangeTabs value={range} onChange={setRange} />
      </div>
    </div>
  );
}
