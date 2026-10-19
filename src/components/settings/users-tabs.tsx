"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

export function UsersTabs() {
  const pathname = usePathname();
  const tabs = [
    { href: "/settings/users", label: "Users" },
    { href: "/settings/users/roles", label: "Roles & Permissions" },
  ];
  return (
    <div className="flex gap-1 border-b" style={{ borderColor: "var(--border)" }}>
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx("focus-ring -mb-px border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors")}
            style={{ borderColor: active ? "var(--brand)" : "transparent", color: active ? "var(--brand-strong)" : "var(--text-muted)" }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
