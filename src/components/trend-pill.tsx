import { ArrowDown, ArrowUp } from "lucide-react";
import type { Trend } from "@/lib/types";

export function TrendPill({ trend, tone = "auto" }: { trend: Trend; tone?: "auto" | "muted" }) {
  const isUp = trend.direction === "up";
  const color = tone === "muted" ? "var(--text-muted)" : isUp ? "var(--green)" : "var(--red)";
  const Icon = isUp ? ArrowUp : ArrowDown;

  return (
    <span className="inline-flex items-center gap-0.5 text-[12px] font-medium" style={{ color }}>
      <Icon size={12} strokeWidth={2.5} />
      {trend.value}%
    </span>
  );
}
