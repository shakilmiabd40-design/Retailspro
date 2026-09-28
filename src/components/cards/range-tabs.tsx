"use client";

import { RANGE_OPTIONS } from "@/lib/dashboard";
import type { RangeKey } from "@/lib/types";

export function RangeTabs({ value, onChange }: { value: RangeKey; onChange: (key: RangeKey) => void }) {
  return (
    <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
      {RANGE_OPTIONS.map((r) => (
        <button
          key={r.key}
          onClick={() => onChange(r.key)}
          className="focus-ring flex-1 rounded-md py-1.5 text-[11.5px] font-medium transition-colors"
          style={{
            background: value === r.key ? "var(--brand)" : "transparent",
            color: value === r.key ? "#ffffff" : "var(--text-muted)",
          }}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
