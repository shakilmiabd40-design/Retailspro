"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { formatTaka } from "@/lib/products/utils";

export const money = (n: number) => formatTaka(n);

const SIZES = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-5xl" } as const;

/** Same look as the Settings modal, with more sizes and an optional locked state (no Escape / backdrop close while saving). */
export function PosModal({
  open,
  title,
  onClose,
  children,
  footer,
  size = "md",
  locked,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: keyof typeof SIZES;
  locked?: boolean;
}) {
  useEffect(() => {
    if (!open || locked) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, locked, onClose]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => e.target === e.currentTarget && !locked && onClose()}
    >
      <div className={clsx("card my-4 w-full", SIZES[size])}>
        <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--border-soft)" }}>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </p>
          {!locked && (
            <button onClick={onClose} aria-label="Close" className="focus-ring rounded-md p-1" style={{ color: "var(--text-faint)" }}>
              <X size={17} />
            </button>
          )}
        </div>
        <div className="space-y-4 p-5">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: "var(--border-soft)" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Chip({ active, disabled, onClick, children, title }: { active?: boolean; disabled?: boolean; onClick?: () => void; children: ReactNode; title?: string }) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className="focus-ring rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{
        borderColor: active ? "var(--brand)" : "var(--border)",
        background: active ? "var(--brand-soft)" : "var(--surface)",
        color: active ? "var(--brand-strong)" : "var(--text-muted)",
      }}
    >
      {children}
    </button>
  );
}

export function PrimaryBtn({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={clsx("focus-ring flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40", className)} style={{ background: "var(--brand)", ...props.style }}>
      {children}
    </button>
  );
}

export function GhostBtn({ children, danger, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button {...props} className={clsx("focus-ring flex items-center justify-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40", className)} style={{ borderColor: "var(--border)", color: danger ? "var(--red)" : "var(--text)", background: "var(--surface)", ...props.style }}>
      {children}
    </button>
  );
}

export const fieldInput = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px] disabled:opacity-60";
export const fieldStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" } as const;

export function LabeledField({ label, hint, required, children }: { label: string; hint?: ReactNode; required?: boolean; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
        {required && <span style={{ color: "var(--red)" }}> *</span>}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[11.5px]" style={{ color: "var(--text-faint)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function Loading() {
  return (
    <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
      Loading…
    </p>
  );
}

export function NotFound({ what, href, label }: { what: string; href: string; label: string }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-10 text-center">
      <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
        {what} not found
      </p>
      <a href={href} className="text-[13px] underline" style={{ color: "var(--brand-strong)" }}>
        {label}
      </a>
    </div>
  );
}
