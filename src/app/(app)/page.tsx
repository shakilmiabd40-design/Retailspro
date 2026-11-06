"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, RotateCcw } from "lucide-react";
import { OrdersKpiCard } from "@/components/cards/orders-kpi-card";
import { CustomersCard } from "@/components/cards/customers-card";
import { RevenueCard } from "@/components/cards/revenue-card";
import { TopCategoriesCard } from "@/components/cards/top-categories-card";
import { OrdersChartCard } from "@/components/cards/orders-chart-card";
import { TopDistrictsCard } from "@/components/cards/top-districts-card";
import { ProductSalesTable } from "@/components/cards/product-sales-table";
import { RecentOrdersList } from "@/components/cards/recent-orders-list";
import type { DashboardData } from "@/lib/types";
import type { DashboardDateRange } from "@/lib/dashboard";
import { api } from "@/lib/persist/api";
import { useAccess } from "@/lib/settings/access";
import { FinanceKpis } from "@/components/cards/finance-kpis";
import { PRESETS, presetRange, type PresetKey } from "@/lib/reports/dates";
import { useCallback } from "react";

type SectionKey = "orders" | "customers" | "revenue" | "categories" | "finance" | "chart" | "districts" | "products" | "recent";
type SectionSetting = { key: SectionKey; visible: boolean; width: 1 | 2 | 3 | 4 };
const DEFAULT_LAYOUT: SectionSetting[] = [
  { key: "orders", visible: true, width: 1 }, { key: "customers", visible: true, width: 1 },
  { key: "revenue", visible: true, width: 1 }, { key: "categories", visible: true, width: 1 },
  { key: "finance", visible: true, width: 4 }, { key: "chart", visible: true, width: 3 },
  { key: "districts", visible: true, width: 1 }, { key: "products", visible: true, width: 3 },
  { key: "recent", visible: true, width: 1 },
];
const SECTION_LABELS: Record<SectionKey, string> = { orders: "Orders", customers: "Customers", revenue: "Revenue", categories: "Top categories", finance: "Finance KPIs", chart: "Sales chart", districts: "Top districts", products: "Product sales", recent: "Recent orders" };

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
const inputClass = "focus-ring rounded-xl border px-3 py-1.5 text-[12.5px]";

export default function DashboardPage() {
  const { can } = useAccess();

  // Dashboard Date Filter State
  const [preset, setPreset] = useState<PresetKey | "custom">("last30");
  const [from, setFrom] = useState(() => presetRange("last30").from);
  const [to, setTo] = useState(() => presetRange("last30").to);

  const dateRange: DashboardDateRange = useMemo(() => {
    const label = PRESETS.find((p) => p.key === preset)?.label ?? `${from} to ${to}`;
    return { from, to, label };
  }, [from, to, preset]);

  const [data, setData] = useState<DashboardData | null>(null);
  const [reportError, setReportError] = useState("");
  const [layout, setLayout] = useState<SectionSetting[]>(DEFAULT_LAYOUT);
  const [layoutOpen, setLayoutOpen] = useState(false);
  useEffect(() => {
    const toggleCustomizer = () => setLayoutOpen((open) => !open);
    window.addEventListener("retailspro:toggle-dashboard-customizer", toggleCustomizer);
    return () => window.removeEventListener("retailspro:toggle-dashboard-customizer", toggleCustomizer);
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("retailspro-dashboard-layout-v1");
      if (raw) {
        const saved = JSON.parse(raw) as SectionSetting[];
        setLayout(DEFAULT_LAYOUT.map((fallback) => saved.find((item) => item.key === fallback.key) ?? fallback).sort((a, b) => saved.findIndex((x) => x.key === a.key) - saved.findIndex((x) => x.key === b.key)));
      }
    } catch { /* Keep the default layout if saved preferences are unavailable. */ }
  }, []);
  const saveLayout = useCallback((next: SectionSetting[]) => {
    setLayout(next);
    try { localStorage.setItem("retailspro-dashboard-layout-v1", JSON.stringify(next)); } catch { /* The current session still uses the chosen layout. */ }
  }, []);
  const moveSection = (key: SectionKey, offset: number) => {
    const index = layout.findIndex((item) => item.key === key);
    const destination = Math.max(0, Math.min(layout.length - 1, index + offset));
    const next = [...layout];
    [next[index], next[destination]] = [next[destination], next[index]];
    saveLayout(next);
  };
  useEffect(() => {
    let current = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      const params = new URLSearchParams({ from, to, label: dateRange.label ?? "" });
      try {
        const result = await api<{ data: DashboardData }>("GET", `/api/dashboard?${params.toString()}`);
        if (current) { setData(result.data); setReportError(""); }
      } catch (error) {
        if (current) setReportError(error instanceof Error ? error.message : "Could not load dashboard reports.");
      } finally {
        inFlight = false;
      }
    };
    void refresh();
    // Keep the report fresh when courier syncs or another staff member updates records.
    const interval = setInterval(() => void refresh(), 30_000);
    return () => { current = false; clearInterval(interval); };
  }, [from, to, dateRange.label]);

  // Relative presets follow the shop's local calendar date while the dashboard stays open.
  useEffect(() => {
    if (preset === "custom") return;
    const updateRelativeRange = () => {
      const next = presetRange(preset);
      setFrom((current) => current === next.from ? current : next.from);
      setTo((current) => current === next.to ? current : next.to);
    };
    const timer = setInterval(updateRelativeRange, 60_000);
    return () => clearInterval(timer);
  }, [preset]);

  function handlePreset(p: PresetKey) {
    setPreset(p);
    const r = presetRange(p);
    setFrom(r.from);
    setTo(r.to);
  }

  function handleReset() {
    handlePreset("last30");
  }

  const categoryRange = preset === "all" ? "all" : preset === "last7" ? "week" : preset === "last30" ? "month" : undefined;

  if (!data) {
    if (reportError) return <p className="rounded-xl border px-4 py-3 text-[13px]" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{reportError}</p>;
    return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  return (
    <div className="space-y-5">
      {/* Dashboard Date Filter Bar */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
            <Calendar size={14} style={{ color: "var(--brand)" }} />
            Period:
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => handlePreset(p.key)}
              className="focus-ring rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors"
              style={{
                borderColor: preset === p.key ? "var(--brand)" : "var(--border)",
                background: preset === p.key ? "var(--brand-soft)" : "transparent",
                color: preset === p.key ? "var(--brand)" : "var(--text-muted)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreset("custom");
              }}
              className={inputClass}
              style={inputStyle}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPreset("custom");
              }}
              className={inputClass}
              style={inputStyle}
            />
          </div>
          {preset !== "last30" && (
            <button
              onClick={handleReset}
              className="focus-ring flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--surface-2)]"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              title="Reset to Last 30 Days"
            >
              <RotateCcw size={13} />
              Reset
            </button>
          )}
        </div>
      </div>

      {layoutOpen && <div className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        {layout.map((section, index) => <div key={section.key} className="flex items-center gap-2 rounded-xl border p-2.5" style={{ borderColor: "var(--border)" }}>
          <label className="flex min-w-0 flex-1 items-center gap-2 text-[12px]" style={{ color: "var(--text)" }}><input type="checkbox" checked={section.visible} onChange={(event) => saveLayout(layout.map((x) => x.key === section.key ? { ...x, visible: event.target.checked } : x))} />{SECTION_LABELS[section.key]}</label>
          <select aria-label={`${SECTION_LABELS[section.key]} width`} value={section.width} onChange={(event) => saveLayout(layout.map((x) => x.key === section.key ? { ...x, width: Number(event.target.value) as 1 | 2 | 3 | 4 } : x))} className="rounded-lg border px-2 py-1 text-[11px]" style={inputStyle}><option value={1}>Narrow</option><option value={2}>Half</option><option value={3}>Three columns</option><option value={4}>Wide</option></select>
          <button disabled={index === 0} onClick={() => moveSection(section.key, -1)} className="rounded border px-2 py-1 text-xs disabled:opacity-30" style={{ borderColor: "var(--border)", color: "var(--text)" }} aria-label={`Move ${SECTION_LABELS[section.key]} earlier`}>↑</button>
          <button disabled={index === layout.length - 1} onClick={() => moveSection(section.key, 1)} className="rounded border px-2 py-1 text-xs disabled:opacity-30" style={{ borderColor: "var(--border)", color: "var(--text)" }} aria-label={`Move ${SECTION_LABELS[section.key]} later`}>↓</button>
        </div>)}
        <button onClick={() => saveLayout(DEFAULT_LAYOUT)} className="text-left text-[12px] font-medium" style={{ color: "var(--brand)" }}>Reset dashboard layout</button>
      </div>}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {layout.filter((s) => s.visible).map((s) => {
          const className = s.width === 4 ? "sm:col-span-2 xl:col-span-4" : s.width === 3 ? "sm:col-span-2 xl:col-span-3" : s.width === 2 ? "sm:col-span-2 xl:col-span-2" : "xl:col-span-1";
          const content = s.key === "orders" ? <OrdersKpiCard data={data.orders} /> : s.key === "customers" ? <CustomersCard data={data.customers} /> : s.key === "revenue" ? <RevenueCard data={data.revenue} /> : s.key === "categories" ? <TopCategoriesCard data={data.topCategories} range={categoryRange} onRangeChange={(range) => handlePreset(range === "all" ? "all" : range === "week" ? "last7" : "last30")} /> : s.key === "finance" ? (can("accounting", "view") ? <FinanceKpis from={from} to={to} label={dateRange.label} /> : null) : s.key === "chart" ? <OrdersChartCard data={data.salesChart} periodLabel={dateRange.label} groupBy={data.salesChartGroup} /> : s.key === "districts" ? <TopDistrictsCard data={data.topDistricts} /> : s.key === "products" ? <ProductSalesTable data={data.products} /> : <RecentOrdersList data={data.recentOrders} />;
          return content ? <div key={s.key} className={`h-full ${className}`}>{content}</div> : null;
        })}
      </div>

      {reportError && <p className="text-[12px]" role="status" style={{ color: "var(--red)" }}>{reportError}</p>}
    </div>
  );
}
