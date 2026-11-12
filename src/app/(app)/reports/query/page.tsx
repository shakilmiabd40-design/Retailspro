"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import {
  QUERY_AGGREGATIONS,
  QUERY_DATASETS,
  findDataset,
  type QueryAggregation,
  type QueryResult,
} from "@/lib/reports/query-builder";
import { num, taka } from "@/lib/reports/format";
import { useReportFilters } from "@/lib/reports/use-filters";
import { useReportApi } from "@/lib/reports/use-report";
import { useAccess } from "@/lib/settings/access";
import { Panel, ReportHeader, RuleNote } from "@/components/reports/kpi";
import { downloadCsv } from "@/lib/reports/export";

export default function ReportBuilderPage() {
  const state = useReportFilters("order_created");
  const f = state.applied;
  const { can } = useAccess();

  const [datasetKey, setDatasetKey] = useState(QUERY_DATASETS[0].key);
  const [dimension, setDimension] = useState(QUERY_DATASETS[0].defaultDimension);
  const [measure, setMeasure] = useState(QUERY_DATASETS[0].defaultMeasure);
  const [aggregation, setAggregation] = useState<QueryAggregation>("sum");
  const [filters, setFilters] = useState<Record<string, string>>({});

  const dataset = findDataset(datasetKey) ?? QUERY_DATASETS[0];

  const params = useMemo(
    () => ({
      from: f.from,
      to: f.to,
      dataset: datasetKey,
      dimension,
      measure,
      aggregation,
      ...filters,
    }),
    [f.from, f.to, datasetKey, dimension, measure, aggregation, filters]
  );

  const { data, loading, error } = useReportApi<QueryResult & { canSeeCost: boolean; costHidden: boolean }>("/api/reports/query", params);

  const switchDataset = (key: string) => {
    const next = findDataset(key);
    setDatasetKey(key);
    if (next) {
      setDimension(next.defaultDimension);
      setMeasure(next.defaultMeasure);
    }
    setFilters({});
  };

  const exportCsv = () => {
    if (!data) return;
    downloadCsv("report-builder", [
      { header: dataset.dimensions.find((d) => d.key === data.dimension)?.label ?? "Group", value: (row: { group: string }) => row.group },
      { header: "Value", value: (row: { value: number }) => row.value },
      { header: "Records", value: (row: { records: number }) => row.records },
    ], data.rows);
  };

  const measureField = dataset.fields.find((field) => field.key === measure);
  const isMoney = measureField?.type === "money";

  return (
    <div className="space-y-5 pb-10">
      <ReportHeader title="Report Builder" description="Ask a question of your own data: pick what to look at, group it and total it." meta={`${f.from} to ${f.to}`} />

      <div className="card space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <label className="block min-w-0">
            <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>What to look at</span>
            <select value={datasetKey} onChange={(e) => switchDataset(e.target.value)} className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
              {QUERY_DATASETS.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>Group by</span>
            <select value={dimension} onChange={(e) => setDimension(e.target.value)} className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
              {dataset.dimensions.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>Total</span>
            <select value={measure} onChange={(e) => setMeasure(e.target.value)} className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
              {dataset.fields.filter((field) => field.aggregatable).map((field) => (
                <option key={field.key} value={field.key}>{field.label}</option>
              ))}
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>How</span>
            <select value={aggregation} onChange={(e) => setAggregation(e.target.value as QueryAggregation)} className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}>
              {QUERY_AGGREGATIONS.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>

        {dataset.filters.length > 0 && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {dataset.filters.map((filter) => (
              <label key={filter.key} className="block min-w-0">
                <span className="mb-1 block text-[11.5px] font-medium" style={{ color: "var(--text-muted)" }}>{filter.label}</span>
                <select
                  value={filters[filter.key] ?? "all"}
                  onChange={(e) => setFilters((current) => ({ ...current, [filter.key]: e.target.value }))}
                  className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]"
                  style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
                >
                  <option value="all">All</option>
                  {filter.values.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}
      </div>

      <RuleNote>{dataset.description} Only the fields listed here can be used — the builder never runs a query you wrote.</RuleNote>

      {error && <p className="rounded-xl border px-4 py-3 text-[13px]" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)" }}>{error}</p>}

      <Panel
        title={data ? `${data.rows.length} groups from ${num(data.total)} records` : "Results"}
        subtitle={data ? `${dataset.dimensions.find((d) => d.key === data.dimension)?.label ?? "Group"} · ${dataset.fields.find((field) => field.key === data.measure)?.label ?? data.measure}` : undefined}
      >
        <div className="mb-3 flex justify-end">
          {can("reports", "export") && (
            <button onClick={exportCsv} className="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
              <Download size={13} /> CSV
            </button>
          )}
        </div>

        {loading && <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Running…</p>}
        {!loading && data && data.rows.length === 0 && <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Nothing matched these filters.</p>}

        {data && data.rows.length > 0 && (
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] uppercase" style={{ color: "var(--text-faint)" }}>
                <th className="px-2 py-2">{dataset.dimensions.find((d) => d.key === data.dimension)?.label ?? "Group"}</th>
                <th className="px-2 py-2 text-right">Records</th>
                <th className="px-2 py-2 text-right">{dataset.fields.find((field) => field.key === data.measure)?.label ?? "Value"}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.group} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="px-2 py-2" style={{ color: "var(--text)" }}>{row.group}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{num(row.records)}</td>
                  <td className="px-2 py-2 text-right tabular-nums" style={{ color: "var(--text)" }}>
                    {data.costHidden ? "—" : isMoney ? taka(row.value) : num(Math.round(row.value))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
