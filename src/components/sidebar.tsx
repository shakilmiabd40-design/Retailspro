"use client";

import {
  Calculator,
  LayoutGrid,
  Package,
  FolderTree,
  Tag,
  SlidersHorizontal,
  ShoppingCart,
  Truck,
  ClipboardList,
  Undo2,
  BarChart3,
  Settings,
  ChevronDown,
  Plus,
  RefreshCcw,
  ListOrdered,
  Clock,
  PackageCheck,
  PackageX,
  RotateCcw,
  Ban,
  ShieldCheck,
  Bell,
  Wallet,
  Landmark,
  ListChecks,
  Boxes,
  Coins,
  Store,
  Building2,
  Users,
  Receipt,
  Database,
  History,
  Lock,
  ScanBarcode,
  ReceiptText,
  ArrowLeftRight,
  Banknote,
  Plug,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import { useOrders } from "@/lib/orders/store";
import { useNotifications } from "@/lib/notifications/store";
import { useSettings } from "@/lib/settings/store";
import { useAccess } from "@/lib/settings/access";
import type { ActionKey, ModuleKey } from "@/lib/settings/types";

type Perm = { module: ModuleKey; action: ActionKey };
type NavChild = { label: string; href: string; icon: React.ComponentType<{ size?: number }>; count?: number; perm?: Perm };
type NavItem = {
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  href: string;
  matchPrefix?: string;
  badge?: number;
  perm?: Perm;
  children?: NavChild[];
};

export function Sidebar({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { statusCounts } = useOrders();
  const { unreadCount } = useNotifications();
  const { settings } = useSettings();
  const { can } = useAccess();
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => {
    if (pathname?.startsWith("/pos")) setOpenMenu("POS");
    if (pathname?.startsWith("/products")) setOpenMenu("Products");
    if (pathname?.startsWith("/orders")) setOpenMenu("Orders");
    if (pathname?.startsWith("/reports")) setOpenMenu("Reports");
    if (pathname?.startsWith("/accounting")) setOpenMenu("Accounting");
    if (pathname?.startsWith("/settings")) setOpenMenu("Settings");
  }, [pathname]);

  // Close the mobile drawer whenever the route changes, or on Escape.
  useEffect(() => {
    onClose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  const ALL_NAV_ITEMS: NavItem[] = [
    { label: "Dashboard", icon: LayoutGrid, href: "/" },
    {
      label: "POS",
      icon: ScanBarcode,
      href: "/pos",
      matchPrefix: "/pos",
      perm: { module: "pos", action: "view" },
      children: [
        { label: "New Sale", href: "/pos", icon: ScanBarcode, perm: { module: "pos", action: "create" } },
        { label: "Sales", href: "/pos/sales", icon: ReceiptText },
        { label: "Returns / Exchange", href: "/pos/returns", icon: ArrowLeftRight },
        { label: "Cash Register", href: "/pos/sessions", icon: Banknote },
        { label: "POS Reports", href: "/pos/reports", icon: BarChart3 },
      ],
    },
    {
      label: "Products",
      icon: Package,
      href: "/products",
      matchPrefix: "/products",
      perm: { module: "products", action: "view" },
      children: [
        { label: "All Products", href: "/products", icon: Package },
        { label: "Add Product", href: "/products/new", icon: Plus },
        { label: "Bulk Stock Update", href: "/products/bulk-stock-update", icon: RefreshCcw, perm: { module: "inventory", action: "edit" } },
        { label: "Categories", href: "/products/categories", icon: FolderTree },
        { label: "Brands", href: "/products/brands", icon: Tag },
        { label: "Attributes", href: "/products/attributes", icon: SlidersHorizontal },
      ],
    },
    {
      label: "Orders",
      icon: ShoppingCart,
      href: "/orders",
      matchPrefix: "/orders",
      perm: { module: "orders", action: "view" },
      children: [
        { label: "All Orders", href: "/orders", icon: ListOrdered, count: statusCounts.all },
        { label: "Pending", href: "/orders?status=pending", icon: Clock, count: statusCounts.pending },
        { label: "Processing", href: "/orders?status=processing", icon: RefreshCcw, count: statusCounts.processing },
        { label: "In Transit", href: "/orders?status=in_transit", icon: Truck, count: statusCounts.in_transit },
        { label: "Delivered", href: "/orders?status=delivered", icon: PackageCheck, count: statusCounts.delivered },
        { label: "Partial Delivered", href: "/orders?status=partial_delivered", icon: RotateCcw, count: statusCounts.partial_delivered },
        { label: "Refuse Return", href: "/orders?status=refuse_return", icon: PackageX, count: statusCounts.refuse_return },
        { label: "Cancelled", href: "/orders?status=cancelled", icon: Ban, count: statusCounts.cancelled },
      ],
    },
    {
      label: "Accounting",
      icon: Calculator,
      href: "/accounting",
      matchPrefix: "/accounting",
      perm: { module: "accounting", action: "view" },
      children: [
        { label: "Overview", href: "/accounting", icon: LayoutGrid },
        { label: "Expenses", href: "/accounting/expenses", icon: Receipt },
        { label: "All transactions", href: "/accounting/ledger", icon: ListChecks },
        { label: "Accounts & balances", href: "/accounting/accounts", icon: Landmark },
        { label: "Profit & Loss", href: "/accounting/profit-loss", icon: BarChart3 },
      ],
    },
    { label: "Suppliers", icon: Truck, href: "/suppliers", matchPrefix: "/suppliers", perm: { module: "suppliers", action: "view" } },
    { label: "Purchase Orders", icon: ClipboardList, href: "/purchase-orders", matchPrefix: "/purchase-orders", perm: { module: "purchase", action: "view" } },
    { label: "Returns", icon: Undo2, href: "/returns", matchPrefix: "/returns", perm: { module: "returns", action: "view" } },
    { label: "Warranty", icon: ShieldCheck, href: "/warranty", matchPrefix: "/warranty", perm: { module: "warranty", action: "view" } },
    { label: "Notifications", icon: Bell, href: "/notifications", matchPrefix: "/notifications", badge: unreadCount, perm: { module: "inventory", action: "view" } },
    {
      label: "Reports",
      icon: BarChart3,
      href: "/reports",
      matchPrefix: "/reports",
      perm: { module: "reports", action: "view" },
      children: [
        { label: "Dashboard (Summary)", href: "/reports", icon: LayoutGrid },
        { label: "Sales & COD", href: "/reports/sales-cod", icon: Wallet },
        { label: "Courier Cost & P/L", href: "/reports/courier", icon: Truck },
        { label: "Settlement Report", href: "/reports/settlement", icon: Landmark, perm: { module: "settlement", action: "view" } },
        { label: "Order Status", href: "/reports/order-status", icon: ListChecks },
        { label: "Product Sales", href: "/reports/product-sales", icon: ShoppingCart },
        { label: "Inventory Stock", href: "/reports/inventory-stock", icon: Boxes },
        { label: "Inventory Valuation", href: "/reports/inventory-valuation", icon: Coins },
        { label: "Purchase Report", href: "/reports/purchases", icon: ClipboardList },
        { label: "Supplier Report", href: "/reports/suppliers", icon: Store },
        { label: "Returns Report", href: "/reports/returns", icon: Undo2 },
        { label: "Warranty Report", href: "/reports/warranty", icon: ShieldCheck },
      ],
    },
    {
      label: "Settings",
      icon: Settings,
      href: "/settings",
      matchPrefix: "/settings",
      perm: { module: "settings", action: "view" },
      children: [
        { label: "Overview", href: "/settings", icon: LayoutGrid },
        { label: "Company / Shop", href: "/settings/company", icon: Building2 },
        { label: "Users & Roles", href: "/settings/users", icon: Users, perm: { module: "settings", action: "settings" } },
        { label: "Product Settings", href: "/settings/products", icon: Package },
        { label: "Inventory Settings", href: "/settings/inventory", icon: Boxes },
        { label: "Orders Settings", href: "/settings/orders", icon: ShoppingCart },
        { label: "Courier & Settlement", href: "/settings/courier", icon: Truck },
        { label: "Purchase Settings", href: "/settings/purchase", icon: ClipboardList },
        { label: "Returns Settings", href: "/settings/returns", icon: Undo2 },
        { label: "Warranty Settings", href: "/settings/warranty", icon: ShieldCheck },
        { label: "POS Settings", href: "/settings/pos", icon: ScanBarcode },
        { label: "Invoice & Numbering", href: "/settings/invoice", icon: Receipt },
        { label: "Notifications", href: "/settings/notifications", icon: Bell },
        { label: "Data (Import / Export)", href: "/settings/data", icon: Database },
        { label: "Integrations & API", href: "/settings/integrations", icon: Plug, perm: { module: "settings", action: "settings" } },
        { label: "Audit Log & Activity", href: "/settings/audit", icon: History, perm: { module: "audit", action: "view" } },
        { label: "Security", href: "/settings/security", icon: Lock, perm: { module: "settings", action: "settings" } },
      ],
    },
  ];

  const NAV_ITEMS: NavItem[] = ALL_NAV_ITEMS.filter((item) => !item.perm || can(item.perm.module, item.perm.action)).map((item) =>
    item.children ? { ...item, children: item.children.filter((c) => !c.perm || can(c.perm.module, c.perm.action)) } : item
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 px-2 mb-6 focus-ring rounded-lg" onClick={onClose}>
      {settings.company.logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={settings.company.logo} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
      ) : (
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl text-base font-bold text-white shrink-0"
          style={{ background: "var(--brand)" }}
        >
          {settings.company.shopName.trim().charAt(0).toUpperCase() || "R"}
        </div>
      )}
      <div className="min-w-0 leading-tight">
        <p className="truncate text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          {settings.company.shopName || "RetailPro"}
        </p>
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Inventory Management
        </p>
      </div>
    </Link>
  );

  const nav = (
    <nav className="flex-1 space-y-1 overflow-y-auto">
      {NAV_ITEMS.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : item.matchPrefix ? pathname?.startsWith(item.matchPrefix) : pathname === item.href;
        const isParentActive = item.matchPrefix ? pathname?.startsWith(item.matchPrefix) : isActive;
        const isOpen = openMenu === item.label;

        if (item.children) {
          return (
            <div key={item.label}>
              <button
                onClick={() => setOpenMenu(isOpen ? null : item.label)}
                className="focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors"
                style={{
                  background: isParentActive ? "var(--sidebar-active-bg)" : "transparent",
                  color: isParentActive ? "var(--sidebar-active-text)" : "var(--text-muted)",
                }}
              >
                <item.icon size={18} strokeWidth={2} />
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronDown
                  size={14}
                  className="transition-transform"
                  style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                />
              </button>
              {isOpen && (
                <div className="mt-1 ml-4 space-y-0.5 border-l pl-3" style={{ borderColor: "var(--border)" }}>
                  {item.children.map((child) => {
                    // Exact match, or a page inside it (e.g. an invoice under Sales) — but never the section's own root.
                    const childActive = pathname === child.href || (child.href !== item.href && !child.href.includes("?") && !!pathname?.startsWith(child.href + "/"));
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={onClose}
                        className={clsx(
                          "focus-ring flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors"
                        )}
                        style={{
                          background: childActive ? "var(--sidebar-active-bg)" : "transparent",
                          color: childActive ? "var(--sidebar-active-text)" : "var(--text-muted)",
                        }}
                      >
                        <child.icon size={15} />
                        <span className="flex-1">{child.label}</span>
                        {typeof child.count === "number" && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold"
                            style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}
                          >
                            {child.count}
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={onClose}
            className={clsx(
              "focus-ring flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors"
            )}
            style={{
              background: isActive ? "var(--sidebar-active-bg)" : "transparent",
              color: isActive ? "var(--sidebar-active-text)" : "var(--text-muted)",
            }}
          >
            <item.icon size={18} strokeWidth={2} />
            <span className="flex-1">{item.label}</span>
            {!!item.badge && (
              <span className="rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold text-white" style={{ background: "var(--red)" }}>
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop: always-visible static sidebar */}
      <aside
        className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r h-screen sticky top-0 px-4 py-5"
        style={{ background: "var(--sidebar-bg)", borderColor: "var(--border)" }}
      >
        {brand}
        {nav}
      </aside>

      {/* Mobile: slide-in drawer, opened from the Topbar's menu button */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose} aria-hidden="true" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[85vw] max-w-xs flex-col px-4 py-5 shadow-2xl"
            style={{ background: "var(--sidebar-bg)" }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">{brand}</div>
              <button onClick={onClose} aria-label="Close menu" className="focus-ring -mt-6 shrink-0 rounded-lg p-1.5" style={{ color: "var(--text-faint)" }}>
                <X size={20} />
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}
    </>
  );
}
