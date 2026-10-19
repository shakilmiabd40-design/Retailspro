"use client";

import { useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { RangeTabs } from "@/components/cards/range-tabs";
import type { RangeKey, TopCategory } from "@/lib/types";

export function TopCategoriesCard({ data }: { data: Record<RangeKey, TopCategory[]> }) {
  const [range, setRange] = useState<RangeKey>("month");
  const categories = data[range];

  return (
    <div className="card flex flex-col p-5">
      <div className="mb-2">
        <p className="text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
          Top Categories
        </p>
        <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          By units ordered · excl. cancelled &amp; refused
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-10">
          <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            No orders in this period.
          </p>
        </div>
      ) : (
        <>
          <div className="mx-auto h-32 w-32">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categories} dataKey="units" nameKey="name" innerRadius="65%" outerRadius="100%" paddingAngle={2} stroke="none">
                  {categories.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    fontSize: 12,
                    color: "var(--text)",
                  }}
                  formatter={(value, name) => [`${value} units`, name]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
            {categories.map((cat) => (
              <div key={cat.name} className="flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: cat.color }} />
                <span className="truncate">{cat.name}</span>
                <span className="ml-auto font-medium" style={{ color: "var(--text)" }}>
                  {cat.pct}%
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-4">
        <RangeTabs value={range} onChange={setRange} />
      </div>
    </div>
  );
}
