"use client";

import { useState } from "react";
import { PERIODS, periodRange, type PeriodKey } from "@/lib/accounting/utils";

export function usePeriod(initial: Exclude<PeriodKey, "custom"> = "this_month") {
  const [key, setKey] = useState<PeriodKey>(initial);
  const [custom, setCustom] = useState(() => periodRange(initial));
  const range = key === "custom" ? custom : periodRange(key);
  return { key, setKey, custom, setCustom, from: range.from, to: range.to };
}
export type PeriodState = ReturnType<typeof usePeriod>;

export function PeriodBar({ period }: { period: PeriodState }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              if (p.key === "custom") period.setCustom({ from: period.from, to: period.to });
              period.setKey(p.key);
            }}
            aria-pressed={period.key === p.key}
            className="focus-ring rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
            style={{ borderColor: period.key === p.key ? "var(--brand)" : "var(--border)", background: period.key === p.key ? "var(--brand-soft)" : "var(--surface)", color: period.key === p.key ? "var(--brand-strong)" : "var(--text-muted)" }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period.key === "custom" && (
        <div className="flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          <input type="date" value={period.custom.from} max={period.custom.to} onChange={(e) => e.target.value && period.setCustom({ ...period.custom, from: e.target.value })} className="focus-ring rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} aria-label="From date" />
          →
          <input type="date" value={period.custom.to} min={period.custom.from} onChange={(e) => e.target.value && period.setCustom({ ...period.custom, to: e.target.value })} className="focus-ring rounded-lg border px-2 py-1.5" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }} aria-label="To date" />
        </div>
      )}
    </div>
  );
}
