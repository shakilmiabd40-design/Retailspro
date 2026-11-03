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

  function handlePreset(p: PresetKey) {
    setPreset(p);
    const r = presetRange(p);
    setFrom(r.from);
    setTo(r.to);
  }

  function handleReset() {
    handlePreset("last30");
  }

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

      {/* Main KPI Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <OrdersKpiCard data={data.orders} />
        <CustomersCard data={data.customers} />
        <RevenueCard data={data.revenue} />
        <TopCategoriesCard data={data.topCategories} />
      </div>

      {reportError && <p className="text-[12px]" role="status" style={{ color: "var(--red)" }}>{reportError}</p>}
      {can("accounting", "view") && <FinanceKpis from={from} to={to} label={dateRange.label} />}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        <OrdersChartCard data={data.salesChart} />
        <TopDistrictsCard data={data.topDistricts} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_400px]">
        <ProductSalesTable data={data.products} />
        <RecentOrdersList data={data.recentOrders} />
      </div>
    </div>
  );
}
