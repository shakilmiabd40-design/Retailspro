"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  PackageCheck,
  RefreshCw,
  RotateCw,
  ShieldAlert,
} from "lucide-react";
import { api } from "@/lib/persist/api";
import { useToast } from "@/components/toast";
import { downloadCsv, downloadXlsx, type ExportColumn } from "@/lib/reports/export";
import type { SyncFailureItem } from "@/lib/reports/types";

interface SyncHealthResponse {
  todayWebsiteOrders: number;
  totalWebsiteOrders: number;
  pendingFailuresCount: number;
  failedTodayCount: number;
  latestSyncAt: string | null;
  failures: SyncFailureItem[];
}

export default function SyncHealthReportPage() {
  const showToast = useToast();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SyncHealthResponse | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [inspectItem, setInspectItem] = useState<SyncFailureItem | null>(null);

  const loadData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await api<SyncHealthResponse>("GET", "/api/reports/sync-health");
      setData(res);
    } catch {
      showToast("Failed to load sync health data", "error");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    startTransition(() => {
      void loadData();
    });
    const interval = setInterval(() => void loadData(false), 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleRetry = async (id: string) => {
    setRetryingId(id);
    try {
      const res = await api<{ ok: boolean; orderNumber: string }>("POST", "/api/reports/sync-health/retry", { id });
      showToast(`Sync retry successful! Created Order #${res.orderNumber}`);
      void loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Retry failed", "error");
    } finally {
      setRetryingId(null);
    }
  };

  const exportColumns: ExportColumn<SyncFailureItem>[] = [
    { header: "Received At", value: (f) => f.createdAt },
    { header: "External ID", value: (f) => f.externalId },
    { header: "Source", value: (f) => f.source },
    { header: "API Key", value: (f) => f.apiKeyName ?? "" },
    { header: "Error", value: (f) => f.errorMessage },
    { header: "Status", value: (f) => f.status },
    { header: "Retries", value: (f) => f.retryCount },
    { header: "Resolved At", value: (f) => f.resolvedAt ?? "" },
  ];

  const handleExport = (type: "csv" | "xlsx") => {
    const rows = data?.failures ?? [];
    if (!rows.length) {
      showToast("There are no sync failures to export.", "error");
      return;
    }
    const filename = `sync-health_${new Date().toISOString().slice(0, 10)}`;
    if (type === "csv") downloadCsv(filename, exportColumns, rows);
    else downloadXlsx(filename, "Sync Failures", exportColumns, rows);
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
            R12. Sync Health & Storefront Reconciliation
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Monitor website order parity, live failure logs, and re-attempt dropped syncs. Nothing is silently lost.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
          <button
            onClick={() => void loadData()}
            disabled={loading}
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-semibold shadow-xs disabled:opacity-40"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            <span>Refresh Status</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-5">
          <div className="flex items-center justify-between text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            <span>Today&apos;s Synced Orders</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <p className="mt-2 text-[26px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
            {data?.todayWebsiteOrders ?? 0}
          </p>
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
            Received via website API today
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            <span>Pending Sync Failures</span>
            <ShieldAlert size={16} className={data?.pendingFailuresCount ? "text-rose-500" : "text-emerald-500"} />
          </div>
          <p className={`mt-2 text-[26px] font-bold tabular-nums ${data?.pendingFailuresCount ? "text-rose-600" : "text-emerald-600"}`}>
            {data?.pendingFailuresCount ?? 0}
          </p>
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
            {data?.failedTodayCount ? `${data.failedTodayCount} failed today · ` : ""}Requires manual or automated retry
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            <span>Total Website Orders</span>
            <PackageCheck size={16} style={{ color: "var(--brand)" }} />
          </div>
          <p className="mt-2 text-[26px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
            {data?.totalWebsiteOrders ?? 0}
          </p>
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
            Lifetime storefront orders in DB
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            <span>Latest Ingestion</span>
            <Clock size={16} style={{ color: "var(--text-faint)" }} />
          </div>
          <p className="mt-2 text-[16px] font-semibold tabular-nums" style={{ color: "var(--text)" }}>
            {data?.latestSyncAt ? new Date(data.latestSyncAt).toLocaleTimeString() : "—"}
          </p>
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
            {data?.latestSyncAt ? new Date(data.latestSyncAt).toLocaleDateString() : "No recent sync"}
          </p>
        </div>
      </div>

      {/* Sync Failures Table */}
      <div className="card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              Failed Sync Queue & Error Logs
            </h3>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Orders that failed validation, stock reservation, or network ingestion. Click retry to process.
            </p>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <div className="py-12 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>Loading sync queue...</div>
          ) : !data?.failures.length ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 size={32} className="text-emerald-500 mb-2 opacity-80" />
              <p className="text-[14px] font-medium" style={{ color: "var(--text)" }}>All syncs healthy</p>
              <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>There are no failed or dropped orders in the sync log.</p>
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead>
                <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                  <th className="px-3 py-2 font-medium">Timestamp</th>
                  <th className="px-3 py-2 font-medium">External ID</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Error Reason</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-center">Retries</th>
                  <th className="px-3 py-2 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.failures.map((f) => (
                  <tr key={f.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-3 py-2.5 font-mono text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                      {new Date(f.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 font-medium" style={{ color: "var(--text)" }}>
                      {f.externalId}
                    </td>
                    <td className="px-3 py-2.5 capitalize" style={{ color: "var(--text-muted)" }}>
                      {f.apiKeyName ? `${f.source} · ${f.apiKeyName}` : f.source}
                    </td>
                    <td className="px-3 py-2.5 max-w-xs truncate text-rose-600 dark:text-rose-400" title={f.errorMessage}>
                      {f.errorMessage}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${
                        f.status === "resolved"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                      }`}>
                        {f.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-center font-mono" style={{ color: "var(--text-muted)" }}>
                      {f.retryCount}
                    </td>
                    <td className="px-3 py-2.5 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => setInspectItem(f)}
                        className="rounded-lg border px-2 py-1 text-[11.5px] font-medium"
                        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
                      >
                        Inspect
                      </button>
                      {f.status !== "resolved" && (
                        <button
                          type="button"
                          disabled={retryingId === f.id}
                          onClick={() => handleRetry(f.id)}
                          className="focus-ring inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-40"
                          style={{ background: "var(--brand)" }}
                        >
                          <RotateCw size={12} className={retryingId === f.id ? "animate-spin" : ""} />
                          <span>Retry</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Inspect Payload Modal */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
          <div className="relative max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl border bg-white p-6 shadow-xl dark:bg-[#18181b]" style={{ borderColor: "var(--border)" }}>
            <h3 className="text-[16px] font-semibold" style={{ color: "var(--text)" }}>
              Failed Sync Payload ({inspectItem.externalId})
            </h3>
            <p className="mt-1 text-[12.5px] text-rose-600 dark:text-rose-400">
              Error: {inspectItem.errorMessage}
            </p>

            <pre className="mt-4 max-h-72 overflow-y-auto rounded-xl border p-3 font-mono text-[11.5px]" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text)" }}>
              {JSON.stringify(inspectItem.payload, null, 2)}
            </pre>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInspectItem(null)}
                className="rounded-xl border px-4 py-2 text-[12.5px] font-medium"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
