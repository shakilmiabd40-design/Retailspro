"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, Search, X, Package, ShoppingCart, Truck } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { NotificationBell } from "./notifications/notification-bell";
import { UserMenu } from "./user-menu";
import { SyncStatus } from "./sync-status";
import { MailShortcut } from "./mail-shortcut";
import { useProducts } from "@/lib/products/store";
import { useOrders } from "@/lib/orders/store";
import { useSuppliers } from "@/lib/suppliers/store";

const MAX_PER_GROUP = 5;

export function Topbar({ onMenuClick }: { onMenuClick?: () => void }) {
  const router = useRouter();
  const { products } = useProducts();
  const { orders } = useOrders();
  const { suppliers } = useSuppliers();

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close the results dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // ⌘K / Ctrl+K focuses the search box from anywhere; Escape closes it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const q = query.trim().toLowerCase();

  const productResults = useMemo(() => {
    if (!q) return [];
    return products
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q))
      .slice(0, MAX_PER_GROUP);
  }, [q, products]);

  const orderResults = useMemo(() => {
    if (!q) return [];
    return orders
      .filter((o) => o.orderNumber.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q) || o.phone.includes(query.trim()))
      .slice(0, MAX_PER_GROUP);
  }, [q, orders, query]);

  const supplierResults = useMemo(() => {
    if (!q) return [];
    return suppliers.filter((s) => s.name.toLowerCase().includes(q) || (s.phone ?? "").includes(query.trim())).slice(0, MAX_PER_GROUP);
  }, [q, suppliers, query]);

  const hasResults = productResults.length > 0 || orderResults.length > 0 || supplierResults.length > 0;

  function go(href: string) {
    router.push(href);
    setOpen(false);
    setQuery("");
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (productResults[0]) return go(`/products/${productResults[0].id}`);
    if (orderResults[0]) return go(`/orders/${orderResults[0].id}`);
    if (supplierResults[0]) return go(`/suppliers/${supplierResults[0].id}`);
  }

  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b px-3 py-3 backdrop-blur sm:gap-4 sm:px-5 sm:py-3.5"
      style={{ background: "color-mix(in srgb, var(--bg) 85%, transparent)", borderColor: "var(--border)" }}
    >
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="focus-ring flex h-9 w-9 shrink-0 items-center justify-center rounded-full border lg:hidden"
        style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
      >
        <Menu size={18} />
      </button>

      <div ref={boxRef} className="relative min-w-0 flex-1 sm:max-w-sm">
        <form
          onSubmit={onSubmit}
          className="focus-ring flex min-w-0 items-center gap-2 rounded-xl border px-3 py-2"
          style={{ background: "var(--surface)", borderColor: "var(--border)" }}
        >
          <Search size={16} className="shrink-0" style={{ color: "var(--text-faint)" }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => query && setOpen(true)}
            placeholder="Search products, orders, suppliers..."
            className="w-full min-w-0 bg-transparent text-[13.5px] outline-none placeholder:text-[var(--text-faint)]"
            style={{ color: "var(--text)" }}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setOpen(false);
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="focus-ring shrink-0 rounded-md p-0.5"
              style={{ color: "var(--text-faint)" }}
            >
              <X size={14} />
            </button>
          ) : (
            <kbd
              className="hidden shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] sm:block"
              style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}
            >
              ⌘K
            </kbd>
          )}
        </form>

        {open && q && (
          <div
            className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-[70vh] overflow-y-auto rounded-xl border py-1.5 shadow-lg"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            {!hasResults && (
              <p className="px-3 py-4 text-center text-[12.5px]" style={{ color: "var(--text-faint)" }}>
                No results for &ldquo;{query}&rdquo;
              </p>
            )}

            {productResults.length > 0 && (
              <div className="py-1">
                <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                  Products
                </p>
                {productResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => go(`/products/${p.id}`)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <Package size={15} className="shrink-0" style={{ color: "var(--text-faint)" }} />
                    <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--text)" }}>
                      {p.name}
                    </span>
                    <span className="shrink-0 text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {p.sku}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {orderResults.length > 0 && (
              <div className="py-1">
                <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                  Orders
                </p>
                {orderResults.map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => go(`/orders/${o.id}`)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <ShoppingCart size={15} className="shrink-0" style={{ color: "var(--text-faint)" }} />
                    <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--text)" }}>
                      #{o.orderNumber} — {o.customerName}
                    </span>
                    <span className="shrink-0 text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {o.phone}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {supplierResults.length > 0 && (
              <div className="py-1">
                <p className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                  Suppliers
                </p>
                {supplierResults.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => go(`/suppliers/${s.id}`)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-[var(--surface-2)]"
                  >
                    <Truck size={15} className="shrink-0" style={{ color: "var(--text-faint)" }} />
                    <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--text)" }}>
                      {s.name}
                    </span>
                    <span className="shrink-0 text-[11px]" style={{ color: "var(--text-faint)" }}>
                      {s.phone}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
        <SyncStatus />

        <ThemeToggle />

        <NotificationBell />

        <MailShortcut />

        <UserMenu />
      </div>
    </header>
  );
}
