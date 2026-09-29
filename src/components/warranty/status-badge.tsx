import type { WarrantyStatus } from "@/lib/warranty/types";
import { WARRANTY_STATUS_LABELS } from "@/lib/warranty/utils";

const STYLES: Record<WarrantyStatus, { color: string; bg: string }> = {
  active: { color: "var(--green)", bg: "var(--green-soft)" },
  expired: { color: "var(--text-muted)", bg: "var(--surface-2)" },
  claimed: { color: "var(--brand)", bg: "var(--brand-soft)" },
  closed: { color: "var(--blue)", bg: "var(--blue-soft)" },
  void: { color: "var(--red)", bg: "var(--red-soft)" },
};

export function WarrantyStatusBadge({ status }: { status: WarrantyStatus }) {
  const s = STYLES[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap"
      style={{ color: s.color, background: s.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {WARRANTY_STATUS_LABELS[status]}
    </span>
  );
}
