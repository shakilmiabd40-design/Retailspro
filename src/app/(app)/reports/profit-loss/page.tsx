"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, Settings2 } from "lucide-react";
import { api } from "@/lib/persist/api";
import {
  PNL_COLUMNS,
  PNL_DIMENSIONS,
  PNL_LINE_DEFS,
  type PnlColumnKey,
  type PnlDimension,
  type PnlLineKey,
  type PnlPreset,
} from "@/lib/reports/profit-loss";
import { num, taka } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { useReportApi } from "@/lib/reports/use-report";
import { useAccess } from "@/lib/settings/access";
import { useToast } from "@/components/toast";
import { Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { downloadCsv } from "@/lib/reports/export";

interface PnlLineRow {
  key: PnlLineKey;
  label: string;
  kind: "detail" | "subtotal" | "total";
  values: number[];
  help?: string;
}

interface PnlAccountRow {
  code: string;
  name: string;
  type: string;
  values: number[];
}

interface ProfitLossPayload {
  periods: { key: string; label: string; from: string; to: string }[];
  lines: PnlLineRow[];
  accounts: PnlAccountRow[];
  breakdown: { key: string; label: string; revenue: number; productCost: number; grossProfit: number; orders: number }[] | null;
  unposted: { label: string; amount: number; note: string }[];
  canSeeCost: boolean;
}

const LINE_DEFS_BY_KEY = new Map(PNL_LINE_DEFS.map((def) => [def.key, def]));

export default function ProfitLossReportPage() {
  const state = useReportFilters("order_created", "daily");
  const f = state.applied;
  const { can } = useAccess();
  const showToast = useToast();

  const [presets, setPresets] = useState<PnlPreset[]>([]);
  const [presetId, setPresetId] = useState("default");
  const [lines, setLines] = useState<PnlLineKey[]>(PNL_LINE_DEFS.map((def) => def.key));
  const [columns, setColumns] = useState<PnlColumnKey[]>(["current", "previous"]);
  const [dimension, setDimension] = useState<PnlDimension>("none");
  const [showLayout, setShowLayout] = useState(false);
  const [presetName, setPresetName] = useState("My layout");

  const canManage = can("reports", "financial") || can("accounting", "view");

  // Saved layouts.
  useEffect(() => {
    let current = true;
    api<{ presets: PnlPreset[] }>("GET", "/api/reports/profit-loss/presets")
      .then((result) => { if (current) setPresets(result.presets ?? []); })
      .catch(() => { /* Layouts are optional; the report still works without them. */ });
    return () => { current = false; };
  }, []);

  const applyPreset = useCallback((preset: PnlPreset) => {
    setPresetId(preset.id);
    setLines(preset.lines);
    setColumns(preset.columns);
    setDimension(preset.dimension);
  }, []);

  const params = useMemo(
    () => ({ from: f.from, to: f.to, columns: columns.join(","), dimension }),
    [f.from, f.to, columns, dimension]
  );

  const { data: payload, loading, error: loadError } = useReportApi<ProfitLossPayload>("/api/reports/profit-loss", params);

  const visibleLines = useMemo(
    () => lines.map((key) => LINE_DEFS_BY_KEY.get(key)).filter(Boolean).map((def) => def!),
    [lines]
  );

  const toggleLine = (key: PnlLineKey) => {
    setLines((current) => (current.includes(key) ? current.filter((k) => k !== key) : [...current, key]));
  };

  const moveLine = (key: PnlLineKey, direction: -1 | 1) => {
    setLines((current) => {
      const index = current.indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const toggleColumn = (key: PnlColumnKey) => {
    setColumns((current) => {
      if (current.includes(key)) {
        // The statement always needs at least one period.
        return current.length === 1 ? current : current.filter((k) => k !== key);
      }
      return [...current, key];
    });
  };

  const savePreset = async () => {
    try {
      const result = await api<{ presets: PnlPreset[] }>("POST", "/api/reports/profit-loss/presets", {
        preset: { id: presetId === "default" ? `custom-${Date.now()}` : presetId, name: presetName, lines, columns, dimension },
      });
      setPresets(result.presets ?? []);
      const saved = result.presets?.find((p) => p.name === presetName);
      if (saved) setPresetId(saved.id);
      showToast("Layout saved");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not save the layout.", "error");
    }
  };

  const exportCsv = () => {
    if (!payload) return;
    downloadCsv("profit-and-loss", [
      { header: "Line", value: (row: { label: string; values: number[] }) => row.label },
      ...payload.periods.map((period, index) => ({ header: period.label, value: (row: { values: number[] }) => row.values[index] })),
    ], payload.lines.map((line) => ({ label: line.label, values: line.values })));
  };

  if (loadError) return <p className="rounded-xl border px-4 py-3 text-[13px]" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{loadError}</p>;
  if (loading || !payload) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading profit & loss…</p>;

  const netProfit = payload.lines.find((line) => line.key === "netProfit")?.values ?? [];
  const revenue = payload.lines.find((line) => line.key === "revenue")?.values ?? [];
  const margin = payload.lines.find((line) => line.key === "margin")?.values ?? [];

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader
        title="Profit & Loss"
        description="What the shop actually made — from the books, with ad spend and COD fees included."
        meta={`${f.from} to ${f.to}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={presetId}
          onChange={(e) => {
            const preset = presets.find((p) => p.id === e.target.value);
            if (preset) applyPreset(preset);
          }}
          className="focus-ring rounded-xl border px-3 py-1.5 text-[12.5px]"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        >
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
          {presets.length === 0 && <option value="default">Standard</option>}
        </select>
        <button
          onClick={() => setShowLayout((v) => !v)}
          aria-pressed={showLayout}
          className="focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium"
          style={{ borderColor: showLayout ? "var(--brand)" : "var(--border)", background: showLayout ? "var(--brand-soft)" : "var(--surface)", color: showLayout ? "var(--brand-strong)" : "var(--text-muted)" }}
        >
          <Settings2 size={13} /> Customise
        </button>
        {canManage && (
          <button onClick={exportCsv} className="focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
            <Download size={13} /> CSV
          </button>
        )}
      </div>

      {showLayout && (
        <Panel title="Customise this report" subtitle="Choose the lines, the periods to compare and the breakdown — then save it as a layout.">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div>
              <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text)" }}>Lines</h3>
              <ul className="space-y-1">
                {PNL_LINE_DEFS.map((def) => {
                  const on = lines.includes(def.key);
                  return (
                    <li key={def.key} className="flex items-center gap-2 text-[12.5px]">
                      <input type="checkbox" checked={on} onChange={() => toggleLine(def.key)} />
                      <span className="flex-1" style={{ color: on ? "var(--text)" : "var(--text-faint)" }}>{def.label}</span>
                      <button type="button" onClick={() => moveLine(def.key, -1)} className="focus-ring rounded px-1" style={{ color: "var(--text-faint)" }} aria-label={`Move ${def.label} up`}>↑</button>
                      <button type="button" onClick={() => moveLine(def.key, 1)} className="focus-ring rounded px-1" style={{ color: "var(--text-faint)" }} aria-label={`Move ${def.label} down`}>↓</button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text)" }}>Periods to compare</h3>
              <ul className="space-y-1">
                {PNL_COLUMNS.map((col) => (
                  <li key={col.key} className="text-[12.5px]" title={col.help}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={columns.includes(col.key)} onChange={() => toggleColumn(col.key)} />
                      {col.label}
                    </label>
                  </li>
                ))}
              </ul>
              <h3 className="mb-2 mt-4 text-[12px] font-semibold" style={{ color: "var(--text)" }}>Breakdown</h3>
              <select
                value={dimension}
                onChange={(e) => setDimension(e.target.value as PnlDimension)}
                className="focus-ring w-full rounded-lg border px-2.5 py-1.5 text-[12.5px]"
                style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
              >
                {PNL_DIMENSIONS.map((dim) => (
                  <option key={dim.key} value={dim.key}>{dim.label}</option>
                ))}
              </select>
            </div>

            <div>
              <h3 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text)" }}>Save as a layout</h3>
              <input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Layout name"
                className="focus-ring w-full rounded-lg border px-2.5 py-1.5 text-[12.5px]"
                style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
              />
              <button onClick={savePreset} disabled={!canManage} className="focus-ring mt-2 w-full rounded-lg border px-3 py-1.5 text-[12.5px] font-medium disabled:opacity-40" style={{ borderColor: "var(--brand)", color: "var(--brand-strong)" }}>
                {canManage ? "Save layout" : "Only a financial role can save layouts"}
              </button>
              <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                Layouts are stored for everyone. They change what this report shows — never what it counts.
              </p>
            </div>
          </div>
        </Panel>
      )}

      <RuleNote>
        Revenue, cost of goods sold, courier, operating expenses and other income come from the posted ledger entries.
        Ad spend and COD service fees are real costs that are never posted to the ledger, so they are added as their own lines —
        without them the books would overstate profit by exactly what was spent on advertising.
      </RuleNote>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Revenue</p>
          <p className="text-[20px] font-semibold tabular-nums" style={{ color: "var(--text)" }}>{taka(revenue[0] ?? 0)}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Net profit</p>
          <p className="text-[20px] font-semibold tabular-nums" style={{ color: (netProfit[0] ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>{taka(netProfit[0] ?? 0)}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>Net margin</p>
          <p className="text-[20px] font-semibold tabular-nums" style={{ color: (margin[0] ?? 0) >= 0 ? "var(--green)" : "var(--red)" }}>{Math.round(margin[0] ?? 0)}%</p>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] uppercase" style={{ color: "var(--text-faint)" }}>
              <th className="sticky left-0 px-4 py-2.5" style={{ background: "var(--surface)" }}>Line</th>
              {payload.periods.map((period) => (
                <th key={period.key} className="px-3 py-2.5 text-right">
                  {period.label}
                  <span className="block text-[10.5px] font-normal normal-case" style={{ color: "var(--text-faint)" }}>
                    {period.from} → {period.to}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleLines.map((def) => {
              const line = payload.lines.find((l) => l.key === def.key);
              if (!line) return null;
              return (
                <tr key={def.key} className="border-t" style={{ borderColor: "var(--border-soft)", fontWeight: def.kind === "detail" ? 400 : 650 }}>
                  <td className="sticky left-0 px-4 py-2" style={{ background: "var(--surface)", color: "var(--text)" }}>
                    {def.label}
                    {def.help && <span className="block text-[11px] font-normal" style={{ color: "var(--text-faint)" }}>{def.help}</span>}
                  </td>
                  {line.values.map((value, index) => (
                    <td key={index} className="px-3 py-2 text-right tabular-nums" style={{ color: def.key === "netProfit" ? value >= 0 ? "var(--green)" : "var(--red)" : "var(--text)" }}>
                      {def.key === "margin" ? `${Math.round(value)}%` : taka(value)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {payload.unposted.length > 0 && (
        <Panel title="Not in the ledger" subtitle="Real costs that are counted here but were never posted as journal entries.">
          <ul className="space-y-1 text-[12.5px]">
            {payload.unposted.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3">
                <span style={{ color: "var(--text)" }}>{row.label} <span style={{ color: "var(--text-faint)" }}>· {row.note}</span></span>
                <span className="tabular-nums" style={{ color: "var(--text)" }}>{taka(row.amount)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {payload.breakdown && payload.breakdown.length > 0 && (
        <Panel title="Breakdown" subtitle="Revenue and product cost for the current period.">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] uppercase" style={{ color: "var(--text-faint)" }}>
                <th className="px-2 py-2">{PNL_DIMENSIONS.find((d) => d.key === dimension)?.label ?? "Breakdown"}</th>
                <th className="px-2 py-2 text-right">Orders</th>
                <th className="px-2 py-2 text-right">Revenue</th>
                <th className="px-2 py-2 text-right">Product cost</th>
                <th className="px-2 py-2 text-right">Gross profit</th>
              </tr>
            </thead>
            <tbody>
              {payload.breakdown.map((row) => (
                <tr key={row.key} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-2 py-2" style={{ color: "var(--text)" }}>{row.label}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{num(row.orders)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{taka(row.revenue)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{payload.canSeeCost ? taka(row.productCost) : "—"}</td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: row.grossProfit >= 0 ? "var(--green)" : "var(--red)" }}>{payload.canSeeCost ? taka(row.grossProfit) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <nav className="flex flex-wrap gap-2 text-[12px]">
        <Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/reports">Owner Dashboard</Link>
        <Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/accounting/profit-loss">Accounting P&L</Link>
        <Link className="rounded-lg border px-3 py-1.5" style={{ borderColor: "var(--border)" }} href="/reports/channels">Sales by Channel</Link>
      </nav>
    </div>
  );
}
