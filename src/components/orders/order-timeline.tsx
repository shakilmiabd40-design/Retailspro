import { Check } from "lucide-react";
import { formatOrderDate } from "@/lib/orders/utils";
import type { ActivityEntry } from "@/lib/orders/types";

export function OrderTimeline({ activity }: { activity: ActivityEntry[] }) {
  return (
    <div className="space-y-0">
      {activity.map((entry, i) => (
        <div key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
          {i < activity.length - 1 && (
            <span className="absolute left-[11px] top-6 h-full w-px" style={{ background: "var(--border)" }} />
          )}
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            <Check size={13} />
          </span>
          <div>
            <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
              {entry.label}
            </p>
            {entry.detail && (
              <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                {entry.detail}
              </p>
            )}
            <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              {formatOrderDate(entry.at)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
