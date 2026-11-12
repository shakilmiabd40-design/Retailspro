"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, FileSpreadsheet } from "lucide-react";
import { api } from "@/lib/persist/api";
import { formatTaka } from "@/lib/products/utils";
import { PRESETS, presetRange, type PresetKey } from "@/lib/reports/dates";
import { downloadCsv, downloadXlsx, type ExportColumn } from "@/lib/reports/export";
import type { ChannelBreakdownRow, DailySummaryRow, ExecutiveKpiSummary } from "@/lib/reports/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ChannelReportData {
  canSeeCostAndProfit: boolean;
  kpis: ExecutiveKpiSummary;
  rows: DailySummaryRow[];
}

export default function SalesByChannelPage() {
  const [preset, setPreset] = useState<PresetKey | "custom">("this_month");
  const [dateRange, setDateRange] = useState(() => presetRange("this_month"));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ChannelReportData | null>(null);

  const handlePresetChange = (newPreset: PresetKey) => {
    setPreset(newPreset);
    if (newPreset !== "all") {
      const r = presetRange(newPreset);
      setDateRange(r);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<ChannelReportData>(
        "GET",
        `/api/reports/daily-summary?from=${dateRange.from}&to=${dateRange.to}&channel=all`
      );
      setData(res);
    } catch (err) {
      console.error("[reports] Failed to load channel report:", err);
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to]);

  useEffect(() => {
    startTransition(() => {
      void loadData();
    });
  }, [loadData]);

  const canSeeCost = data?.canSeeCostAndProfit ?? false;
  const channelBreakdown = data?.kpis.channelBreakdown ?? [];
  const totalRevenue = data?.kpis.realizedRevenue || 0;

  // Chart data: Group rows by date, stacked by channel
  const rows = data?.rows;
  const chartData = useMemo(() => {
    if (!rows) return [];
    const dateMap = new Map<string, Record<string, number>>();

    for (const r of rows) {
      const d = r.reportDate;
      if (!d) continue;
      const cur = dateMap.get(d) ?? { website: 0, facebook: 0, instagram: 0, shop: 0, unattributed: 0, total: 0 };
      const ch = r.channel || "unattributed";
      cur[ch] = (cur[ch] ?? 0) + r.netRevenue;
      cur.total = (cur.total ?? 0) + r.netRevenue;
      dateMap.set(d, cur);
    }

    return [...dateMap.entries()]
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);

  const exportColumns = useMemo<ExportColumn<ChannelBreakdownRow>[]>(() => {
    const cols: ExportColumn<ChannelBreakdownRow>[] = [
      { header: "Channel", value: (r) => (r.channel === "shop" ? "Walk-in Shop" : r.channel === "unattributed" ? "Unattributed" : r.channel) },
      { header: "Delivered Orders", value: (r) => r.deliveredOrders },
      { header: "Net Revenue (BDT)", value: (r) => r.netRevenue },
      { header: "Share of Total (%)", value: (r) => (totalRevenue > 0 ? Math.round((r.netRevenue / totalRevenue) * 100) : 0) },
      { header: "AOV (BDT)", value: (r) => Math.round(r.aov) },
    ];
    if (canSeeCost) {
      cols.push(
        { header: "Product Cost (BDT)", value: (r) => r.productCost },
        { header: "Gross Profit (BDT)", value: (r) => r.grossProfit },
        { header: "Margin (%)", value: (r) => Math.round(r.marginPct) }
      );
    }
    return cols;
  }, [canSeeCost, totalRevenue]);

  const handleExport = (type: "csv" | "xlsx") => {
    const filename = `sales-by-channel_${dateRange.from}_to_${dateRange.to}`;
    if (type === "csv") {
      downloadCsv(filename, exportColumns, channelBreakdown);
    } else {
      downloadXlsx(filename, "Channels", exportColumns, channelBreakdown);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link href="/reports" className="focus-ring mb-1.5 flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
            <ArrowLeft size={14} /> Back to Dashboard
          </Link>
          <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--text)" }}>
            R2. Sales by Channel
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Delivered revenue, order volume, gross margin, and AOV across Website, Social, and Walk-in Shop.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport("csv")}
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-semibold shadow-xs"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            <Download size={14} />
            <span>CSV</span>
          </button>
          <button
            onClick={() => handleExport("xlsx")}
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-semibold shadow-xs"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            <FileSpreadsheet size={14} />
            <span>Excel</span>
          </button>
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

        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => {
              setPreset("custom");
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
              setPreset("custom");
              setDateRange((prev) => ({ ...prev, to: e.target.value }));
            }}
            className="rounded-lg border px-2 py-1 text-[12px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          />
        </div>
      </div>

      {loading ? (
        <div className="card h-64 animate-pulse p-6" />
      ) : (
        <>
          {/* Channel Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {["website", "facebook", "instagram", "shop", "unattributed"].map((chKey) => {
              const ch = channelBreakdown.find((c) => c.channel === chKey);
              const rev = ch?.netRevenue ?? 0;
              const orders = ch?.deliveredOrders ?? 0;
              const share = totalRevenue > 0 ? Math.round((rev / totalRevenue) * 100) : 0;
              const displayName = chKey === "shop" ? "Walk-in Shop" : chKey === "unattributed" ? "Unattributed" : chKey.toUpperCase();

              return (
                <div key={chKey} className="card p-5">
                  <div className="flex items-center justify-between text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                    <span className="font-semibold">{displayName}</span>
                    <span className="font-mono text-[11px] font-bold">{share}% share</span>
                  </div>
                  <p className="mt-2 text-[22px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
                    {formatTaka(rev, 0)}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[12px]" style={{ color: "var(--text-faint)" }}>
                    <span>{orders} delivered orders</span>
                    {canSeeCost && ch && <span className="text-emerald-600 font-medium">{Math.round(ch.marginPct)}% margin</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stacked Revenue Chart */}
          <div className="card p-5">
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              Revenue Trend by Channel
            </h3>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Daily delivered net revenue contributions by sales channel
            </p>

            <div className="mt-4 h-72 w-full">
              {chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[13px]" style={{ color: "var(--text-muted)" }}>
                  No delivered revenue recorded for this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `৳${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`} />
                    <Tooltip formatter={(v) => [`৳${Number(v).toLocaleString()}`, ""]} />
                    <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                    <Bar dataKey="website" name="Website" fill="#3b82f6" stackId="a" />
                    <Bar dataKey="facebook" name="Facebook" fill="#8b5cf6" stackId="a" />
                    <Bar dataKey="instagram" name="Instagram" fill="#ec4899" stackId="a" />
                    <Bar dataKey="shop" name="Walk-in Shop" fill="#10b981" stackId="a" />
                    <Bar dataKey="unattributed" name="Unattributed" fill="#94a3b8" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Performance Table */}
          <div className="card p-5">
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              Channel Performance Breakdown
            </h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                    <th className="px-3 py-2 font-medium">Channel</th>
                    <th className="px-3 py-2 font-medium text-right">Delivered Orders</th>
                    <th className="px-3 py-2 font-medium text-right">Net Revenue</th>
                    <th className="px-3 py-2 font-medium text-right">Share %</th>
                    <th className="px-3 py-2 font-medium text-right">AOV</th>
                    {canSeeCost && <th className="px-3 py-2 font-medium text-right">Product Cost</th>}
                    {canSeeCost && <th className="px-3 py-2 font-medium text-right">Gross Profit</th>}
                    {canSeeCost && <th className="px-3 py-2 font-medium text-right">Margin %</th>}
                  </tr>
                </thead>
                <tbody>
                  {channelBreakdown.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center" style={{ color: "var(--text-muted)" }}>
                        No orders recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    channelBreakdown.map((ch) => {
                      const share = totalRevenue > 0 ? Math.round((ch.netRevenue / totalRevenue) * 100) : 0;
                      return (
                        <tr key={ch.channel} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                          <td className="px-3 py-3 font-semibold capitalize" style={{ color: "var(--text)" }}>
                            {ch.channel === "shop" ? "Walk-in Shop" : ch.channel === "unattributed" ? "Unattributed" : ch.channel}
                          </td>
                          <td className="px-3 py-3 text-right font-mono" style={{ color: "var(--text)" }}>
                            {ch.deliveredOrders}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold" style={{ color: "var(--text)" }}>
                            {formatTaka(ch.netRevenue, 0)}
                          </td>
                          <td className="px-3 py-3 text-right font-mono" style={{ color: "var(--text-muted)" }}>
                            {share}%
                          </td>
                          <td className="px-3 py-3 text-right font-mono" style={{ color: "var(--text)" }}>
                            {formatTaka(ch.aov, 0)}
                          </td>
                          {canSeeCost && (
                            <td className="px-3 py-3 text-right" style={{ color: "var(--text-muted)" }}>
                              {formatTaka(ch.productCost, 0)}
                            </td>
                          )}
                          {canSeeCost && (
                            <td className="px-3 py-3 text-right font-medium text-emerald-600">
                              {formatTaka(ch.grossProfit, 0)}
                            </td>
                          )}
                          {canSeeCost && (
                            <td className="px-3 py-3 text-right font-semibold" style={{ color: "var(--text)" }}>
                              {Math.round(ch.marginPct)}%
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
