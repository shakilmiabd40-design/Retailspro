"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, KeyRound, LogOut, Users } from "lucide-react";
import { useAccess } from "@/lib/settings/access";
import { useAuth } from "@/lib/auth/context";
import { initialsOf } from "@/lib/settings/utils";

export function UserMenu() {
  const { currentUser, currentRole, can } = useAccess();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const itemClass = "focus-ring flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[13px] font-medium hover:bg-[var(--surface-2)]";

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" className="focus-ring flex items-center gap-1.5 rounded-full pl-0.5 pr-1.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold text-white" style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-strong))" }}>
          {initialsOf(currentUser.name)}
        </div>
        <ChevronDown size={14} style={{ color: "var(--text-faint)" }} className="hidden sm:block" />
      </button>

      {open && (
        <div role="menu" className="card absolute right-0 top-11 z-30 w-64 overflow-hidden p-0 shadow-lg">
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-soft)" }}>
            <p className="truncate text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
              {currentUser.name}
            </p>
            <p className="truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
              {currentRole.name}
              {currentUser.email ? ` · ${currentUser.email}` : ""}
            </p>
          </div>

          {can("settings", "settings") && (
            <Link href="/settings/users" role="menuitem" onClick={() => setOpen(false)} className={itemClass} style={{ color: "var(--text-muted)" }}>
              <Users size={15} />
              Manage users &amp; roles
            </Link>
          )}
          <Link href="/change-password" role="menuitem" className={itemClass} style={{ color: "var(--text-muted)" }}>
            <KeyRound size={15} />
            Change password
          </Link>
          <button
            role="menuitem"
            disabled={signingOut}
            onClick={() => {
              setSigningOut(true);
              void signOut();
            }}
            className={`${itemClass} border-t`}
            style={{ borderColor: "var(--border-soft)", color: "var(--red)" }}
          >
            <LogOut size={15} />
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
