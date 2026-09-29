"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import clsx from "clsx";

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };

export function AuthCard({ title, subtitle, brand, children }: { title: string; subtitle?: string; brand: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${brand} — ${title}`;
  }, [brand, title]);
  return (
    <div className="w-full max-w-[420px]">
      <div className="mb-6 flex items-center justify-center gap-2.5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-bold text-white" style={{ background: "var(--brand)" }}>
          {brand.trim().charAt(0).toUpperCase() || "R"}
        </div>
        <span className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>
          {brand}
        </span>
      </div>
      <div className="card space-y-5 p-7">
        <div className="space-y-1">
          <h1 className="text-[19px] font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {subtitle}
            </p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function AuthField({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
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

export function AuthInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx("focus-ring w-full rounded-xl border px-3.5 py-2.5 text-[14px]", props.className)} style={inputStyle} />;
}

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <AuthInput {...props} type={show ? "text" : "password"} className="pr-11" />
      <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5" style={{ color: "var(--text-faint)" }}>
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function AuthButton({ loading, children, ...props }: { loading?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} disabled={loading || props.disabled} className="focus-ring flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60" style={{ background: "var(--brand)" }}>
      {loading && <Loader2 size={16} className="animate-spin" />}
      {children}
    </button>
  );
}

export function AuthAlert({ tone = "error", children }: { tone?: "error" | "info"; children: ReactNode }) {
  const c = tone === "error" ? { bg: "var(--red-soft)", fg: "var(--red)" } : { bg: "var(--brand-tint-bg)", fg: "var(--brand-strong)" };
  return (
    <div role={tone === "error" ? "alert" : "status"} className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[13px]" style={{ background: c.bg, color: c.fg }}>
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** Only ever redirect to a path inside this site. */
export function safeNext(value: string | null | undefined): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}
