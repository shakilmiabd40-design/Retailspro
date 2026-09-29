"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, Columns3, Download } from "lucide-react";
import { downloadCsv, downloadXlsx, type CellValue, type ExportColumn } from "@/lib/reports/export";
import { useToast } from "@/components/toast";

export interface Column<T> {
  key: string;
  header: string;
  /** Plain value: used for sorting and for CSV / Excel export. */
  value: (row: T) => CellValue;
  /** Optional richer cell (badges, links). Falls back to `value`. */
  cell?: (row: T) => ReactNode;
  align?: "right";
  /** Start hidden; the user can turn it on in the column chooser. */
  hidden?: boolean;
  /** Leave out of CSV / Excel exports (e.g. an actions column). */
  noExport?: boolean;
  /** Footer cell computed over every filtered row (all pages). */
  total?: (rows: T[]) => ReactNode;
}

interface Props<T> {
  /** File name base for exports, e.g. "sales-cod". */
  exportName: string;
  title?: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  pageSize?: number;
  emptyText?: string;
  toolbar?: ReactNode;
  /** Hide the Export menu (defaults to true — every existing report is exportable). */
  canExport?: boolean;
}

const STAMP = () => new Date().toISOString().slice(0, 10);

function compare(a: CellValue, b: CellValue): number {
  if (a === null || a === undefined || a === "") return b === null || b === undefined || b === "" ? 0 : 1;
  if (b === null || b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, close]);
  return ref;
}

export function DataTable<T>({ exportName, title, columns, rows, rowKey, pageSize = 25, emptyText = "No records for these filters.", toolbar, canExport = true }: Props<T>) {
  const showToast = useToast();
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.hidden).map((c) => c.key)));
  const [colsOpen, setColsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const colsRef = useOutsideClose(colsOpen, () => setColsOpen(false));
  const exportRef = useOutsideClose(exportOpen, () => setExportOpen(false));

  const visible = useMemo(() => columns.filter((c) => !hidden.has(c.key)), [columns, hidden]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    return [...rows].sort((a, b) => compare(col.value(a), col.value(b)) * sort.dir);
  }, [rows, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);
  const hasTotals = visible.some((c) => c.total);

  const exportCols: ExportColumn<T>[] = visible.filter((c) => !c.noExport).map((c) => ({ header: c.header, value: c.value }));
  function doExport(kind: "csv" | "xlsx", scope: "all" | "page") {
    const data = scope === "all" ? sorted : pageRows;
    if (!data.length) {
      showToast("Nothing to export for these filters", "error");
      return;
    }
    const name = `${exportName}-${STAMP()}${scope === "page" ? `-page${safePage + 1}` : ""}`;
    if (kind === "csv") downloadCsv(name, exportCols, data);
    else downloadXlsx(name, title || exportName, exportCols, data);
    setExportOpen(false);
    showToast(`Exported ${data.length} row${data.length === 1 ? "" : "s"}`);
  }

  const menuItem = "focus-ring block w-full px-3 py-2 text-left text-[12.5px] hover:bg-[var(--surface-2)]";

  return (
    <div className="card overflow-hidden">
      <div className="no-print flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
        <div>
          {title && (
            <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              {title}
            </p>
          )}
          <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            {rows.length} row{rows.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toolbar}
          <div ref={colsRef} className="relative">
            <button onClick={() => setColsOpen((v) => !v)} className="focus-ring flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              <Columns3 size={13} />
              Columns
            </button>
            {colsOpen && (
              <div className="card absolute right-0 top-9 z-30 max-h-72 w-52 overflow-y-auto p-2 shadow-xl" style={{ background: "var(--surface)" }}>
                {columns.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-[var(--surface-2)]" style={{ color: "var(--text)" }}>
                    <input
                      type="checkbox"
                      checked={!hidden.has(c.key)}
                      onChange={() =>
                        setHidden((prev) => {
                          const next = new Set(prev);
                          if (next.has(c.key)) next.delete(c.key);
                          else if (visible.length > 1) next.add(c.key);
                          return next;
                        })
                      }
                    />
                    {c.header}
                  </label>
                ))}
              </div>
            )}
          </div>
          {canExport && <div ref={exportRef} className="relative">
            <button onClick={() => setExportOpen((v) => !v)} className="focus-ring flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white" style={{ background: "var(--brand)" }}>
              <Download size={13} />
              Export
              <ChevronDown size={12} />
            </button>
            {exportOpen && (
              <div className="card absolute right-0 top-9 z-30 w-56 overflow-hidden py-1 shadow-xl" style={{ background: "var(--surface)", color: "var(--text)" }}>
                <button className={menuItem} onClick={() => doExport("csv", "all")}>
                  CSV · all {rows.length} rows
                </button>
                <button className={menuItem} onClick={() => doExport("csv", "page")}>
                  CSV · current page
                </button>
                <button className={menuItem} onClick={() => doExport("xlsx", "all")}>
                  Excel · all {rows.length} rows
                </button>
                <button className={menuItem} onClick={() => doExport("xlsx", "page")}>
                  Excel · current page
                </button>
              </div>
            )}
          </div>}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-12 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          {emptyText}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                {visible.map((c) => (
                  <th key={c.key} className={`whitespace-nowrap px-4 py-2.5 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                    <button
                      onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}
                      className="focus-ring inline-flex items-center gap-1 rounded"
                      aria-label={`Sort by ${c.header}`}
                    >
                      {c.header}
                      {sort?.key === c.key ? <span>{sort.dir === 1 ? "↑" : "↓"}</span> : <ChevronsUpDown size={11} className="no-print opacity-50" />}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, i) => (
                <tr key={rowKey(row, safePage * pageSize + i)} className="border-t align-top" style={{ borderColor: "var(--border-soft)" }}>
                  {visible.map((c) => (
                    <td key={c.key} className={`px-4 py-2.5 ${c.align === "right" ? "text-right tabular-nums" : ""}`} style={{ color: "var(--text)" }}>
                      {c.cell ? c.cell(row) : (c.value(row) ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {hasTotals && (
              <tfoot>
                <tr className="border-t-2 text-[12.5px] font-semibold" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
                  {visible.map((c, i) => (
                    <td key={c.key} className={`px-4 py-2.5 ${c.align === "right" ? "text-right tabular-nums" : ""}`} style={{ color: "var(--text)" }}>
                      {c.total ? c.total(sorted) : i === 0 ? "Total (all pages)" : ""}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="no-print flex items-center justify-between border-t px-4 py-2.5 text-[12px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <span>
            Page {safePage + 1} of {pageCount}
          </span>
          <div className="flex gap-1">
            <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="focus-ring rounded-lg border p-1.5 disabled:opacity-40" style={{ borderColor: "var(--border)" }} aria-label="Previous page">
              <ChevronLeft size={14} />
            </button>
            <button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className="focus-ring rounded-lg border p-1.5 disabled:opacity-40" style={{ borderColor: "var(--border)" }} aria-label="Next page">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
