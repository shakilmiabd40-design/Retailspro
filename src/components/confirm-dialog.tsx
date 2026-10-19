"use client";

import { AlertTriangle } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="card w-full max-w-sm p-5">
        <div className="mb-3 flex items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: danger ? "var(--red-soft)" : "var(--brand-soft)" }}
          >
            <AlertTriangle size={18} style={{ color: danger ? "var(--red)" : "var(--brand)" }} />
          </div>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </p>
        </div>
        <p className="mb-5 text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {message}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="focus-ring rounded-lg border px-3.5 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="focus-ring rounded-lg px-3.5 py-2 text-[13px] font-medium text-white"
            style={{ background: danger ? "var(--red)" : "var(--brand)" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
