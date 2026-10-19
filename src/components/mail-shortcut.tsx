"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Mail, Search, Send } from "lucide-react";
import { useSuppliers } from "@/lib/suppliers/store";

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/**
 * Topbar "mail" button. There's no email-sending backend in this app, and
 * customers/orders have no email field — only Suppliers do — so this opens
 * a small picker (search suppliers with an email on file, or type any
 * address) and hands off to the user's own mail app via `mailto:`.
 */
export function MailShortcut() {
  const { suppliers } = useSuppliers();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCustomEmail("");
    }
  }, [open]);

  const activeSuppliers = useMemo(() => suppliers.filter((s) => !s.archived), [suppliers]);
  const withEmail = useMemo(
    () =>
      activeSuppliers
        .filter((s) => s.email && s.email.trim())
        .filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [activeSuppliers, query]
  );

  const compose = (email: string) => {
    window.location.href = `mailto:${email.trim()}`;
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        aria-label="Email a supplier"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
      >
        <Mail size={17} />
      </button>

      {open && (
        <div
          className="card absolute right-0 top-11 z-50 w-[min(92vw,340px)] overflow-hidden shadow-xl"
          style={{ background: "var(--surface)" }}
          role="dialog"
          aria-label="Email shortcut"
        >
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <p className="text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
              Email
            </p>
            <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              Opens your default mail app.
            </p>
          </div>

          <div className="border-b px-3 py-2" style={{ borderColor: "var(--border)" }}>
            <label
              className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
              style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
            >
              <Search size={13} style={{ color: "var(--text-faint)" }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search suppliers…"
                className="w-full bg-transparent text-[12.5px] outline-none"
                style={{ color: "var(--text)" }}
              />
            </label>
          </div>

          <div className="max-h-64 divide-y overflow-y-auto" style={{ borderColor: "var(--border-soft)" }}>
            {withEmail.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
                {activeSuppliers.length === 0 ? "No suppliers yet." : "No match, or that supplier has no email on file."}
              </p>
            ) : (
              withEmail.map((s) => (
                <button
                  key={s.id}
                  onClick={() => compose(s.email!)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium" style={{ color: "var(--text)" }}>
                      {s.name}
                    </span>
                    <span className="block truncate text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                      {s.email}
                    </span>
                  </span>
                  <Send size={13} style={{ color: "var(--text-faint)" }} />
                </button>
              ))
            )}
          </div>

          <div className="space-y-1.5 border-t p-3" style={{ borderColor: "var(--border)" }}>
            <label className="block text-[11px] font-medium" style={{ color: "var(--text-faint)" }}>
              Or enter any email
            </label>
            <div className="flex gap-1.5">
              <input
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && isValidEmail(customEmail) && compose(customEmail)}
                placeholder="someone@example.com"
                className="focus-ring w-full rounded-lg border px-2.5 py-1.5 text-[12.5px]"
                style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
              />
              <button
                disabled={!isValidEmail(customEmail)}
                onClick={() => compose(customEmail)}
                className="focus-ring shrink-0 rounded-lg px-3 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                style={{ background: "var(--brand)" }}
              >
                Compose
              </button>
            </div>
          </div>

          <Link
            href="/suppliers"
            onClick={() => setOpen(false)}
            className="focus-ring block border-t px-4 py-2.5 text-center text-[12px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--brand)" }}
          >
            Manage suppliers →
          </Link>
        </div>
      )}
    </div>
  );
}
