"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Download,
  FileSpreadsheet,
  Megaphone,
  PackageCheck,
  RefreshCw,
  Truck,
} from "lucide-react";
import { api } from "@/lib/persist/api";
import { formatTaka } from "@/lib/products/utils";
import { PRESETS, presetRange, type PresetKey } from "@/lib/reports/dates";
import { downloadCsv, downloadXlsx, type ExportColumn } from "@/lib/reports/export";
import { AdSpendModal } from "@/components/reports/ad-spend-modal";
import type { ChannelBreakdownRow, ExecutiveKpiSummary } from "@/lib/reports/types";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DailySummaryApiResponse {
  canSeeCostAndProfit: boolean;
  canManageAdSpend: boolean;
  kpis: ExecutiveKpiSummary;
}

export default function OwnerDashboardPage() {
  const [preset, setPreset] = useState<PresetKey>("this_month");
  const [dateRange, setDateRange] = useState(() => presetRange("this_month"));
  const [channelFilter, setChannelFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [adSpendOpen, setAdSpendOpen] = useState(false);
  const [data, setData] = useState<DailySummaryApiResponse | null>(null);
  const [, startTransition] = useTransition();

  const handlePresetChange = (newPreset: PresetKey) => {
    setPreset(newPreset);
    if (newPreset !== "all") {
      const r = presetRange(newPreset);
      setDateRange(r);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await api<DailySummaryApiResponse>(
        "GET",
        `/api/reports/daily-summary?from=${dateRange.from}&to=${dateRange.to}&channel=${channelFilter}`
      );
      setData(res);
    } catch (err) {
      console.error("[reports] Failed to load daily summary:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    startTransition(() => {
      void loadData();
    });
  }, [dateRange.from, dateRange.to, channelFilter]);

  const k = data?.kpis;
  const canSeeCost = data?.canSeeCostAndProfit ?? false;
  const canManageAdSpend = data?.canManageAdSpend ?? false;

  const pctDiff = (cur: number, prev: number) => {
    if (!prev) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / prev) * 100);
  };

  const exportColumns: ExportColumn<ChannelBreakdownRow>[] = [
    { header: "Channel", value: (row) => (row.channel === "shop" ? "Walk-in Shop" : row.channel) },
    { header: "Delivered Orders", value: (row) => row.deliveredOrders },
    { header: "Refused Orders", value: (row) => row.refusedOrders },
    { header: "Net Revenue (BDT)", value: (row) => Math.round(row.netRevenue) },
    { header: "AOV (BDT)", value: (row) => Math.round(row.aov) },
  ];
  if (canSeeCost) {
    exportColumns.push(
      { header: "Product Cost (BDT)", value: (row) => Math.round(row.productCost) },
      { header: "Gross Profit (BDT)", value: (row) => Math.round(row.grossProfit) },
      { header: "Margin (%)", value: (row) => Math.round(row.marginPct) }
    );
  }

  const handleExport = (type: "csv" | "xlsx") => {
    if (!k) return;
    const filename = `owner-dashboard_${dateRange.from}_to_${dateRange.to}`;
    if (type === "csv") downloadCsv(filename, exportColumns, k.channelBreakdown);
    else downloadXlsx(filename, "Channels", exportColumns, k.channelBreakdown);
  };

  const showRefusalWarning = (k?.refusalRatePct ?? 0) > 15;
  const showAgeingWarning = (k?.codPendingBuckets.pending15plus ?? 0) > 0;

  return (
    <div className="space-y-6 pb-12">
      {/* Header and Global Filter Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--text)" }}>
            Owner Dashboard
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Realized delivered revenue, actual net profit, COD pending, and ad spend efficiency.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExport("csv")}
            disabled={!k}
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-semibold shadow-xs disabled:opacity-40"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            <Download size={14} />
            <span>CSV</span>
          </button>
          <button
            onClick={() => handleExport("xlsx")}
            disabled={!k}
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-semibold shadow-xs disabled:opacity-40"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            <FileSpreadsheet size={14} />
            <span>Excel</span>
          </button>

          {canManageAdSpend && (
            <button
              onClick={() => setAdSpendOpen(true)}
              className="focus-ring flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-semibold shadow-xs"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
            >
              <Megaphone size={14} style={{ color: "var(--brand)" }} />
              <span>Record Ad Spend</span>
            </button>
          )}

          <Link
            href="/reports/sync-health"
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-semibold shadow-xs"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            <RefreshCw size={14} style={{ color: "var(--brand)" }} />
            <span>Sync Health</span>
          </Link>
        </div>
      </div>

      {/* Filter Row */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-3 text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.filter((p) => p.key !== "all").map((p) => (
            <button
              key={p.key}
              onClick={() => handlePresetChange(p.key)}
              className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                preset === p.key ? "text-white" : "text-muted hover:text-text"
              }`}
              style={{
                background: preset === p.key ? "var(--brand)" : "var(--surface-2)",
                color: preset === p.key ? "#fff" : "var(--text-muted)",
              }}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => {
              setPreset("custom" as any);
              setDateRange((prev) => ({ ...prev, from: e.target.value }));
            }}
            className="rounded-lg border px-2 py-1 text-[12px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
          <span style={{ color: "var(--text-faint)" }}>→</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => {
              setPreset("custom" as any);
              setDateRange((prev) => ({ ...prev, to: e.target.value }));
            }}
            className="rounded-lg border px-2 py-1 text-[12px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />

          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="rounded-lg border px-2.5 py-1 text-[12px] font-medium"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            <option value="all">All Channels</option>
            <option value="website">Website</option>
            <option value="facebook">Facebook</option>
            <option value="instagram">Instagram</option>
            <option value="shop">Shop (Walk-in)</option>
            <option value="unattributed">Unattributed</option>
          </select>
        </div>
      </div>

      {(showRefusalWarning || showAgeingWarning) && k && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border px-4 py-3 text-[12.5px]" style={{ borderColor: "rgba(245,158,11,0.4)", background: "rgba(245,158,11,0.08)", color: "var(--text)" }}>
          <span className="flex items-center gap-1.5 font-semibold" style={{ color: "#b45309" }}>
            <AlertTriangle size={15} /> Attention
          </span>
          {showRefusalWarning && (
            <span>
              Refusal rate is {Math.round(k.refusalRatePct)}% — above the 15% review threshold.
            </span>
          )}
          {showAgeingWarning && (
            <span>
              {formatTaka(k.codPendingBuckets.pending15plus, 0)} of COD has been with couriers for 15+ days.
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card h-28 animate-pulse p-5" />
          ))}
        </div>
      ) : k ? (
        <>
          {/* Main Financial KPI Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Realized Revenue */}
            <div className="card p-5">
              <div className="flex items-center justify-between text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                <span>Realized Revenue</span>
                <span className="rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wider" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                  Delivered COD + Shop
                </span>
              </div>
              <p className="mt-2 text-[26px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
                {formatTaka(k.realizedRevenue, 0)}
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-[12px]">
                {pctDiff(k.realizedRevenue, k.prevRealizedRevenue) >= 0 ? (
                  <span className="flex items-center font-semibold text-emerald-600">
                    <ArrowUpRight size={14} /> +{pctDiff(k.realizedRevenue, k.prevRealizedRevenue)}%
                  </span>
                ) : (
                  <span className="flex items-center font-semibold text-rose-600">
                    <ArrowDownRight size={14} /> {pctDiff(k.realizedRevenue, k.prevRealizedRevenue)}%
                  </span>
                )}
                <span style={{ color: "var(--text-faint)" }}>vs. previous period</span>
              </div>
              <Link href="/reports/channels" className="mt-1 inline-block text-[11.5px] font-medium" style={{ color: "var(--brand)" }}>
                Break down by channel →
              </Link>
            </div>

            {/* Net Operating Profit */}
            {canSeeCost ? (
              <div className="card p-5">
                <div className="flex items-center justify-between text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  <span>Net Operating Profit</span>
                  <DollarSign size={15} style={{ color: "var(--brand)" }} />
                </div>
                <p className={`mt-2 text-[26px] font-bold tabular-nums ${k.netProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                  {formatTaka(k.netProfit, 0)}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-[12px]">
                  {pctDiff(k.netProfit, k.prevNetProfit) >= 0 ? (
                    <span className="flex items-center font-semibold text-emerald-600">
                      <ArrowUpRight size={14} /> +{pctDiff(k.netProfit, k.prevNetProfit)}%
                    </span>
                  ) : (
                    <span className="flex items-center font-semibold text-rose-600">
                      <ArrowDownRight size={14} /> {pctDiff(k.netProfit, k.prevNetProfit)}%
                    </span>
                  )}
                  <span style={{ color: "var(--text-faint)" }}>after COGS, ads & delivery</span>
                </div>
              </div>
            ) : (
              <div className="card p-5">
                <div className="flex items-center justify-between text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  <span>Delivered Orders</span>
                  <PackageCheck size={15} style={{ color: "var(--brand)" }} />
                </div>
                <p className="mt-2 text-[26px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
                  {k.deliveredOrders}
                </p>
                <p className="mt-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
                  AOV: {formatTaka(k.aov, 0)}
                </p>
                <Link href="/orders?status=delivered" className="mt-1 inline-block text-[11.5px] font-medium" style={{ color: "var(--brand)" }}>
                  View delivered orders →
                </Link>
              </div>
            )}

            {/* Expected Revenue (Isolated pipeline) */}
            <div className="card border-dashed p-5" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                <span>Expected Revenue (Pipeline)</span>
                <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
                  Not Realized
                </span>
              </div>
              <p className="mt-2 text-[26px] font-bold tabular-nums" style={{ color: "#d97706" }}>
                {formatTaka(k.expectedRevenue, 0)}
              </p>
              <p className="mt-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
                Placed, processing &amp; in-transit orders
                {canSeeCost ? ` · Expected profit ${formatTaka(k.expectedProfit, 0)}` : ""}
              </p>
              <Link href="/orders?status=pending" className="mt-1 inline-block text-[11.5px] font-medium" style={{ color: "var(--brand)" }}>
                View open orders →
              </Link>
            </div>

            {/* COD Pending with Couriers */}
            <div className="card p-5">
              <div className="flex items-center justify-between text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                <span>COD Cash with Couriers</span>
                <Truck size={15} style={{ color: "var(--brand)" }} />
              </div>
              <p className="mt-2 text-[26px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
                {formatTaka(k.codPending, 0)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                <span>0–7d {formatTaka(k.codPendingBuckets.pending0to7, 0)}</span>
                <span>·</span>
                <span>8–14d {formatTaka(k.codPendingBuckets.pending8to14, 0)}</span>
                <span>·</span>
                <span style={{ color: k.codPendingBuckets.pending15plus > 0 ? "#e11d48" : undefined }}>
                  15+d {formatTaka(k.codPendingBuckets.pending15plus, 0)}
                </span>
              </div>
              <Link href="/reports/settlement" className="mt-1 inline-block text-[11.5px] font-medium" style={{ color: "var(--brand)" }}>
                Open settlement report →
              </Link>
            </div>
          </div>

          {/* Secondary Operational Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="card p-4">
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Gross Margin</span>
              <p className="mt-1 text-[20px] font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                {canSeeCost && k.realizedRevenue > 0 ? `${Math.round((k.grossProfit / k.realizedRevenue) * 100)}%` : "—"}
              </p>
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                {canSeeCost ? `Gross: ${formatTaka(k.grossProfit, 0)}` : "Restricted"}
              </span>
            </div>

            <div className="card p-4">
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Ad Spend</span>
              <p className="mt-1 text-[20px] font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                {canSeeCost ? formatTaka(k.adSpend, 0) : "—"}
              </p>
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                {canSeeCost && k.adSpend > 0 ? `ROAS: ${(k.realizedRevenue / k.adSpend).toFixed(2)}x` : "Real ROAS"}
              </span>
            </div>

            <div className="card p-4">
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Channel Share</span>
              <p className="mt-1 text-[20px] font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                {Math.round(k.onlineSharePct)}% / {Math.round(k.shopSharePct)}%
              </p>
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>Online vs. Walk-in Shop</span>
            </div>

            <div className="card p-4">
              <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Refusal Rate</span>
              <p className={`mt-1 text-[20px] font-semibold tabular-nums ${k.refusalRatePct > 15 ? "text-rose-600" : "text-text"}`}>
                {Math.round(k.refusalRatePct)}%
              </p>
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                Delivery rate: {Math.round(k.deliveryRatePct)}%
              </span>
            </div>
          </div>

          {/* Daily Realized Revenue vs Profit Trend */}
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                  Daily Realized Trend
                </h3>
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Delivered COD and shop revenue by day
                </p>
              </div>
            </div>

            <div className="mt-4 h-72 w-full">
              {k.dailyTrends.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[13px]" style={{ color: "var(--text-muted)" }}>
                  No delivered sales in this date range.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={k.dailyTrends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `৳${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                    <Tooltip formatter={(v: any) => [`৳${Number(v).toLocaleString()}`, ""]} />
                    <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                    <Line type="monotone" dataKey="netRevenue" name="Net Realized Revenue" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                    {canSeeCost && <Line type="monotone" dataKey="netProfit" name="Net Profit" stroke="#10b981" strokeWidth={2} dot={false} />}
                    {canSeeCost && <Line type="monotone" dataKey="adSpend" name="Ad Spend" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Channel Summary Card */}
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                  Sales by Channel
                </h3>
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Delivered orders and performance across channels
                </p>
              </div>
              <Link href="/reports/channels" className="text-[12.5px] font-medium" style={{ color: "var(--brand)" }}>
                Full Channel Report →
              </Link>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                    <th className="px-3 py-2 font-medium">Channel</th>
                    <th className="px-3 py-2 font-medium text-right">Delivered Orders</th>
                    <th className="px-3 py-2 font-medium text-right">Net Revenue</th>
                    {canSeeCost && <th className="px-3 py-2 font-medium text-right">Gross Profit</th>}
                    {canSeeCost && <th className="px-3 py-2 font-medium text-right">Margin %</th>}
                    <th className="px-3 py-2 font-medium text-right">AOV</th>
                  </tr>
                </thead>
                <tbody>
                  {k.channelBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center" style={{ color: "var(--text-muted)" }}>
                        No orders recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    k.channelBreakdown.map((ch) => (
                      <tr key={ch.channel} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                        <td className="px-3 py-2.5 font-semibold capitalize" style={{ color: "var(--text)" }}>
                          {ch.channel === "shop" ? "Walk-in Shop" : ch.channel}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono" style={{ color: "var(--text)" }}>
                          {ch.deliveredOrders}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold" style={{ color: "var(--text)" }}>
                          {formatTaka(ch.netRevenue, 0)}
                        </td>
                        {canSeeCost && (
                          <td className="px-3 py-2.5 text-right font-medium text-emerald-600">
                            {formatTaka(ch.grossProfit, 0)}
                          </td>
                        )}
                        {canSeeCost && (
                          <td className="px-3 py-2.5 text-right" style={{ color: "var(--text-muted)" }}>
                            {Math.round(ch.marginPct)}%
                          </td>
                        )}
                        <td className="px-3 py-2.5 text-right font-mono" style={{ color: "var(--text)" }}>
                          {formatTaka(ch.aov, 0)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {/* Ad Spend Modal */}
      <AdSpendModal open={adSpendOpen} onClose={() => setAdSpendOpen(false)} onSaved={() => void loadData()} />
    </div>
  );
}
