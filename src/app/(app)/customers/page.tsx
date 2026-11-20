"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { GhostButton } from "@/components/settings/ui";
import { useToast } from "@/components/toast";
import type { CustomersPageResponse } from "@/lib/customers/types";
import { api } from "@/lib/persist/api";
import { formatTaka } from "@/lib/products/utils";

const PAGE_SIZES = [20, 50, 100] as const;

const emptyPage: CustomersPageResponse = { rows: [], total: 0, page: 1, limit: 20, pages: 0 };

export default function CustomersPage() {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(20);
  const [data, setData] = useState<CustomersPageResponse>(emptyPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let current = true;
    const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
    if (search.trim()) params.set("search", search.trim());
    const timer = setTimeout(() => {
      api<CustomersPageResponse>("GET", `/api/customers?${params.toString()}`)
        .then((result) => {
          if (!current) return;
          setData(result);
          setError("");
        })
        .catch((err: unknown) => {
          if (current) setError(err instanceof Error ? err.message : "Could not load customers.");
        })
        .finally(() => { if (current) setLoading(false); });
    }, search.trim() ? 250 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [page, pageSize, search]);

  async function exportCsv() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("search", search.trim());
      const query = params.toString();
      const res = await fetch(`/api/customers/export${query ? `?${query}` : ""}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        let message = "Could not export customers.";
        try {
          const body = (await res.json()) as { message?: string };
          if (body?.message) message = body.message;
        } catch { /* non-JSON error body */ }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (res.headers.get("X-Truncated") === "1") toast("Export limited to the first 10,000 customers.", "error");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not export customers.", "error");
    } finally {
      setExporting(false);
    }
  }

  const totalPages = Math.max(1, data.pages);
  const currentPage = Math.min(page, totalPages);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>Customers</h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {data.total} customer{data.total === 1 ? "" : "s"} grouped by phone
          </p>
        </div>
        <GhostButton onClick={exportCsv} disabled={exporting}>
          <Download size={14} />
          {exporting ? "Exporting…" : "Export CSV"}
        </GhostButton>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
          <Search size={15} style={{ color: "var(--text-faint)" }} />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); setLoading(true); }}
            placeholder="Search by name or phone"
            className="w-full bg-transparent text-[13px] outline-none"
            style={{ color: "var(--text)" }}
          />
        </label>
      </div>

      {error && <p className="rounded-xl border px-4 py-3 text-[13px]" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</p>}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                <th className="px-3 py-3 font-medium">Name</th>
                <th className="px-3 py-3 font-medium">Phone</th>
                <th className="px-3 py-3 text-right font-medium">Total orders</th>
                <th className="px-3 py-3 text-right font-medium">Delivered</th>
                <th className="px-3 py-3 text-right font-medium">Refused/returned</th>
                <th className="px-3 py-3 text-right font-medium">Lifetime delivered amount</th>
                <th className="px-3 py-3 font-medium">Last order date</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.phone} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-3 py-3 text-[13px]" style={{ color: "var(--text)" }}>{row.name || "—"}</td>
                  <td className="px-3 py-3 text-[13px]" style={{ color: "var(--text)" }}>{row.phone}</td>
                  <td className="px-3 py-3 text-right text-[13px]" style={{ color: "var(--text)" }}>{row.totalOrders}</td>
                  <td className="px-3 py-3 text-right text-[13px]" style={{ color: "var(--text)" }}>{row.delivered}</td>
                  <td className="px-3 py-3 text-right text-[13px]" style={{ color: row.refusedReturned ? "var(--red)" : "var(--text-muted)" }}>{row.refusedReturned}</td>
                  <td className="px-3 py-3 text-right text-[13px]" style={{ color: "var(--text)" }}>{formatTaka(row.lifetimeDelivered, 2)}</td>
                  <td className="px-3 py-3 text-[13px]" style={{ color: "var(--text-muted)" }}>
                    {row.lastOrderDate ? new Date(row.lastOrderDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {data.rows.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16">
              <p className="text-[13.5px] font-medium" style={{ color: "var(--text)" }}>
                {loading ? "Loading customers…" : "No customers found"}
              </p>
              {!loading && <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Try a different name or phone.</p>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Show
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value) as (typeof PAGE_SIZES)[number]); setPage(1); setLoading(true); }}
              className="focus-ring rounded-lg border px-2 py-1"
              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
            >
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            per page · {data.total} results{loading ? " · loading" : ""}
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={currentPage <= 1}
              onClick={() => { setPage((p) => Math.max(1, p - 1)); setLoading(true); }}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
              aria-label="Previous page"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>Page {currentPage} of {totalPages}</span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); setLoading(true); }}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg border disabled:opacity-40"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
              aria-label="Next page"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
