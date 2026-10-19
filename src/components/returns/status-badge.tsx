import type { ReturnStatus } from "@/lib/returns/types";
import { RETURN_STATUS_LABELS } from "@/lib/returns/utils";

const STYLES: Record<ReturnStatus, { color: string; bg: string }> = {
  requested: { color: "var(--text-muted)", bg: "var(--surface-2)" },
  approved: { color: "var(--blue)", bg: "var(--blue-soft)" },
  rejected: { color: "var(--red)", bg: "var(--red-soft)" },
  received: { color: "var(--brand)", bg: "var(--brand-soft)" },
  closed: { color: "var(--green)", bg: "var(--green-soft)" },
};

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  const s = STYLES[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap"
      style={{ color: s.color, background: s.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {RETURN_STATUS_LABELS[status]}
    </span>
  );
}
