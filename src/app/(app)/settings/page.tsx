"use client";

import Link from "next/link";
import { ArrowUpRight, Bell, Boxes, Building2, ClipboardList, Database, History, Lock, Package, Plug, Receipt, ScanBarcode, ShieldCheck, ShoppingCart, Truck, Undo2, Users, Wrench } from "lucide-react";
import { useAccess } from "@/lib/settings/access";
import { useSettings } from "@/lib/settings/store";
import type { ActionKey, ModuleKey } from "@/lib/settings/types";
import { PageHeader, SettingsGate, Tag } from "@/components/settings/ui";

type Card = { href: string; title: string; description: string; icon: React.ComponentType<{ size?: number }>; perm: { module: ModuleKey; action: ActionKey } };

const CARDS: Card[] = [
  { href: "/settings/company", title: "Company / Shop", description: "Shop profile, logo, currency, timezone, date and number format, maintenance mode.", icon: Building2, perm: { module: "settings", action: "view" } },
  { href: "/settings/users", title: "Users & Roles", description: "Staff accounts and the custom role builder with a per-module permission matrix.", icon: Users, perm: { module: "settings", action: "settings" } },
  { href: "/settings/products", title: "Product Settings", description: "Categories, brands, sizes, colors, shoe types and SKU / barcode rules.", icon: Package, perm: { module: "settings", action: "view" } },
  { href: "/settings/inventory", title: "Inventory Settings", description: "Stock rules, low-stock alerts, adjustment reasons and stock-change controls.", icon: Boxes, perm: { module: "settings", action: "view" } },
  { href: "/settings/orders", title: "Orders Settings", description: "Workflow, cancel rules and reasons, delivery charge defaults, return handling.", icon: ShoppingCart, perm: { module: "settings", action: "view" } },
  { href: "/settings/courier", title: "Courier & Settlement", description: "Courier companies, cost formulas and how settlements are tracked.", icon: Truck, perm: { module: "settings", action: "view" } },
  { href: "/settings/purchase", title: "Purchase Settings", description: "PO status workflow, receiving rules and purchase defaults.", icon: ClipboardList, perm: { module: "settings", action: "view" } },
  { href: "/settings/returns", title: "Returns Settings", description: "Customer and supplier return rules, reasons and stock impact.", icon: Undo2, perm: { module: "settings", action: "view" } },
  { href: "/settings/warranty", title: "Warranty Settings", description: "Warranty duration, eligibility, claim rules and issue types.", icon: ShieldCheck, perm: { module: "settings", action: "view" } },
  { href: "/settings/pos", title: "POS Settings", description: "Barcode scanning, payment options, discount limits per role, VAT, return window and receipt text.", icon: ScanBarcode, perm: { module: "settings", action: "view" } },
  { href: "/settings/invoice", title: "Invoice & Numbering", description: "Number prefixes, invoice template, paper size and barcode labels.", icon: Receipt, perm: { module: "settings", action: "view" } },
  { href: "/settings/notifications", title: "Notifications", description: "Which events notify whom, and through which channel.", icon: Bell, perm: { module: "settings", action: "view" } },
  { href: "/settings/data", title: "Data (Import / Export)", description: "CSV imports with validation preview, exports and full backup / restore.", icon: Database, perm: { module: "settings", action: "view" } },
  { href: "/settings/integrations", title: "Integrations & API", description: "API keys and webhooks to connect your online store — stock, orders and status updates.", icon: Plug, perm: { module: "settings", action: "settings" } },
  { href: "/settings/audit", title: "Audit Log & Activity", description: "Who did what, when — with before / after values for critical changes.", icon: History, perm: { module: "audit", action: "view" } },
  { href: "/settings/security", title: "Security", description: "Password policy, sessions, login attempt limit, two-factor.", icon: Lock, perm: { module: "settings", action: "settings" } },
];

function Overview() {
  const { can, currentUser, currentRole, isSuperAdmin } = useAccess();
  const { settings } = useSettings();
  const visible = CARDS.filter((c) => can(c.perm.module, c.perm.action));

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Configure how the whole shop runs. Changes are recorded in the audit log." />

      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Signed in as <b style={{ color: "var(--text)" }}>{currentUser.name}</b> · <Tag tone={isSuperAdmin ? "brand" : "muted"}>{currentRole.name}</Tag>
        </div>
        {settings.company.maintenanceMode && (
          <Tag tone="red">
            <Wrench size={11} />
            Maintenance mode is ON
          </Tag>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((c) => (
          <Link key={c.href} href={c.href} className="card focus-ring group flex flex-col gap-3 p-5 transition-colors hover:border-[var(--brand)]">
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
                <c.icon size={19} />
              </span>
              <ArrowUpRight size={16} style={{ color: "var(--text-faint)" }} />
            </div>
            <div>
              <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                {c.title}
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {c.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function SettingsOverviewPage() {
  return (
    <SettingsGate>
      <Overview />
    </SettingsGate>
  );
}
