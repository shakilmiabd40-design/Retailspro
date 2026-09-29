import type { ReactNode } from "react";

export type Tone = "neutral" | "good" | "bad" | "warn" | "brand";

const TONE_COLOR: Record<Tone, string> = {
  neutral: "var(--text)",
  good: "var(--green)",
  bad: "var(--red)",
  warn: "#b45309",
  brand: "var(--brand)",
};

export interface KpiItem {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: Tone;
}

export function KpiGrid({ items, columns = 4 }: { items: KpiItem[]; columns?: 3 | 4 | 6 }) {
  const cols = columns === 6 ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6" : columns === 3 ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4";
  return (
    <div className={`grid gap-3 ${cols}`}>
      {items.map((k) => (
        <div key={k.label} className="card p-4">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            {k.label}
          </p>
          <p className="mt-1 text-[20px] font-semibold tabular-nums" style={{ color: TONE_COLOR[k.tone ?? "neutral"] }}>
            {k.value}
          </p>
          {k.sub && (
            <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              {k.sub}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function ReportHeader({ title, description, meta }: { title: string; description: string; meta?: string }) {
  return (
    <div>
      <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
        {title}
      </h1>
      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
        {description}
      </p>
      {meta && (
        <p className="print-only mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          {meta}
        </p>
      )}
    </div>
  );
}

/** A short, plain-language note about how the numbers on the page are counted. */
export function RuleNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border px-3.5 py-2.5 text-[12.5px]" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text-muted)" }}>
      {children}
    </p>
  );
}

export function Panel({ title, subtitle, children, right }: { title: string; subtitle?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </p>
          {subtitle && (
            <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              {subtitle}
            </p>
          )}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
