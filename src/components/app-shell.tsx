"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShieldAlert, Wrench } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { Topbar } from "@/components/topbar";
import { UserMenu } from "@/components/user-menu";
import { useSettings } from "@/lib/settings/store";
import { useAccess } from "@/lib/settings/access";
import { moduleLabel, requiredPermission } from "@/lib/settings/permissions";
import { ACTION_LABELS } from "@/lib/settings/permissions";

function MaintenanceScreen() {
  const { settings } = useSettings();
  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ background: "var(--bg)" }}>
      <div className="card max-w-md space-y-4 p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--brand-soft)" }}>
          <Wrench size={22} style={{ color: "var(--brand)" }} />
        </div>
        <h1 className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>
          {settings.company.shopName} is under maintenance
        </h1>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Only Super Admins can use the dashboard right now. Please try again in a little while.
        </p>
        <div className="flex justify-center">
          <UserMenu />
        </div>
      </div>
    </div>
  );
}

function AccessDenied({ module, action }: { module: string; action: string }) {
  const { currentRole } = useAccess();
  return (
    <div className="card mx-auto mt-10 max-w-lg space-y-3 p-8 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--red-soft)" }}>
        <ShieldAlert size={22} style={{ color: "var(--red)" }} />
      </div>
      <h1 className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
        You don&apos;t have access to this page
      </h1>
      <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        The <b style={{ color: "var(--text)" }}>{currentRole.name}</b> role doesn&apos;t include <b style={{ color: "var(--text)" }}>{module} → {action}</b>. A Super Admin can change this under Settings → Users &amp; Roles.
      </p>
      <Link href="/" className="focus-ring inline-block rounded-xl px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
        Back to dashboard
      </Link>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { settings, hydrated } = useSettings();
  const { can, isSuperAdmin, hydrated: accessReady } = useAccess();
  const [navOpen, setNavOpen] = useState(false);

  const maintenance = hydrated && settings.company.maintenanceMode;
  if (maintenance && accessReady && !isSuperAdmin) return <MaintenanceScreen />;

  const need = requiredPermission(pathname ?? "/");
  const denied = accessReady && !!need && !can(need.module, need.action);

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenuClick={() => setNavOpen(true)} />
        {maintenance && (
          <div className="no-print flex items-center gap-2 px-3 py-2 text-[12.5px] font-medium sm:px-5" style={{ background: "var(--brand-tint-bg)", color: "var(--brand-strong)", borderBottom: "1px solid var(--brand-tint-border)" }}>
            <Wrench size={14} className="shrink-0" />
            Maintenance mode is ON — everyone except Super Admins is locked out.
          </div>
        )}
        <main className="mx-auto w-full max-w-[1400px] flex-1 space-y-5 px-3 py-4 sm:px-5 sm:py-6">
          {denied && need ? <AccessDenied module={moduleLabel(need.module)} action={ACTION_LABELS[need.action]} /> : children}
        </main>
      </div>
    </div>
  );
}
