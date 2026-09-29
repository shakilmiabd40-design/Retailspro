import type { SupplierStatus } from "@/lib/suppliers/types";

const STYLES: Record<SupplierStatus, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "var(--green)", bg: "var(--green-soft)" },
  inactive: { label: "Inactive", color: "var(--text-muted)", bg: "var(--surface-2)" },
};

export function SupplierStatusBadge({ status }: { status: SupplierStatus }) {
  const s = STYLES[status];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap"
      style={{ color: s.color, background: s.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}
