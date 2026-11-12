/**
 * Profit & Loss — the shared, pure definition of the statement.
 *
 * One engine for both the Reports screen and the Accounting screen, so the two
 * can never show different numbers.
 *
 * Basis:
 *  - Revenue, cost of goods sold, courier, operating expenses, other expenses
 *    and other income come from the **posted journal entries** (the books).
 *  - **Ad spend** and **COD fees** are real costs that are never posted to the
 *    general ledger, so they are added as their own lines. Without them the
 *    books would overstate profit by exactly what was spent on advertising.
 *
 * Nothing here touches the database — it is pure arithmetic over totals, so it
 * can be unit tested and reused from the server and the browser.
 */

export type PnlLineKey =
  | "revenue"
  | "otherIncome"
  | "cogs"
  | "grossProfit"
  | "courier"
  | "codFees"
  | "adSpend"
  | "operating"
  | "otherExpenses"
  | "netProfit"
  | "margin";

export type PnlLineKind = "detail" | "subtotal" | "total";

export interface PnlLineDef {
  key: PnlLineKey;
  label: string;
  kind: PnlLineKind;
  /** Cost lines are stored positive and shown negative. */
  cost?: boolean;
  /** Hidden when every column is zero (e.g. no ad spend recorded yet). */
  optional?: boolean;
  /** Shown under the line as a short explanation. */
  help?: string;
}

/** The default statement. Order matters — it is the order the lines are shown in. */
export const PNL_LINE_DEFS: PnlLineDef[] = [
  { key: "revenue", label: "Revenue", kind: "detail", help: "Sales from delivered orders and walk-in POS sales." },
  { key: "otherIncome", label: "Other income", kind: "detail", optional: true },
  { key: "cogs", label: "Cost of goods sold", kind: "detail", cost: true },
  { key: "grossProfit", label: "Gross profit", kind: "subtotal" },
  { key: "courier", label: "Courier & delivery expense", kind: "detail", cost: true },
  { key: "codFees", label: "COD service fees", kind: "detail", cost: true, optional: true, help: "Charged by the courier on delivery. Not posted to the ledger." },
  { key: "adSpend", label: "Ad spend", kind: "detail", cost: true, optional: true, help: "Marketing spend entered in Reports → Marketing. Not posted to the ledger." },
  { key: "operating", label: "Operating expenses", kind: "detail", cost: true, help: "Rent, salaries and other running costs from Accounting." },
  { key: "otherExpenses", label: "Other expenses", kind: "detail", cost: true, optional: true },
  { key: "netProfit", label: "Net profit", kind: "total" },
  { key: "margin", label: "Net margin", kind: "total" },
];

/** The raw numbers behind one period. All costs are positive. */
export interface PnlTotals {
  revenue: number;
  otherIncome: number;
  cogs: number;
  courier: number;
  codFees: number;
  adSpend: number;
  operating: number;
  otherExpenses: number;
}

export const emptyPnlTotals = (): PnlTotals => ({
  revenue: 0,
  otherIncome: 0,
  cogs: 0,
  courier: 0,
  codFees: 0,
  adSpend: 0,
  operating: 0,
  otherExpenses: 0,
});

export interface PnlPeriod {
  key: string;
  label: string;
  from: string;
  to: string;
}

export interface PnlLine {
  key: PnlLineKey;
  label: string;
  kind: PnlLineKind;
  /** Signed for display: costs are negative, totals positive. */
  values: number[];
  help?: string;
}

/** The statement for one set of periods, ready to render. */
export interface PnlStatement {
  periods: PnlPeriod[];
  lines: PnlLine[];
}

/**
 * Builds the statement. `totals` is one entry per period, in the same order.
 * Lines are signed the way they are shown: costs negative, subtotals positive.
 */
export function buildPnlStatement(periods: PnlPeriod[], totals: PnlTotals[], defs: PnlLineDef[] = PNL_LINE_DEFS): PnlStatement {
  const lines: PnlLine[] = [];
  const at = (index: number, pick: (t: PnlTotals) => number) => totals[index] ? pick(totals[index]) : 0;

  for (const def of defs) {
    const values = periods.map((_, index) => {
      switch (def.key) {
        case "revenue":
          return at(index, (t) => t.revenue);
        case "otherIncome":
          return at(index, (t) => t.otherIncome);
        case "cogs":
          return -at(index, (t) => t.cogs);
        case "grossProfit":
          return at(index, (t) => t.revenue + t.otherIncome - t.cogs);
        case "courier":
          return -at(index, (t) => t.courier);
        case "codFees":
          return -at(index, (t) => t.codFees);
        case "adSpend":
          return -at(index, (t) => t.adSpend);
        case "operating":
          return -at(index, (t) => t.operating);
        case "otherExpenses":
          return -at(index, (t) => t.otherExpenses);
        case "netProfit":
          return at(index, (t) => t.revenue + t.otherIncome - t.cogs - t.courier - t.codFees - t.adSpend - t.operating - t.otherExpenses);
        case "margin": {
          const revenue = at(index, (t) => t.revenue + t.otherIncome);
          const profit = at(index, (t) => t.revenue + t.otherIncome - t.cogs - t.courier - t.codFees - t.adSpend - t.operating - t.otherExpenses);
          return revenue ? (profit / revenue) * 100 : 0;
        }
      }
    });

    // An optional line with nothing in it is noise — drop it.
    if (def.optional && values.every((value) => !value)) continue;

    lines.push({ key: def.key, label: def.label, kind: def.kind, values, help: def.help });
  }

  return { periods, lines };
}

/** Net profit for one period — the single number the whole statement is about. */
export function netProfitOf(totals: PnlTotals): number {
  return totals.revenue + totals.otherIncome - totals.cogs - totals.courier - totals.codFees - totals.adSpend - totals.operating - totals.otherExpenses;
}

/**
 * The lines that carry money behind them. A role without the financial
 * permission keeps the sales side (revenue) but not the cost, the profit or
 * the detail behind them — the same rule the Owner Dashboard uses.
 */
export const PNL_SENSITIVE_LINES: PnlLineKey[] = [
  "cogs",
  "grossProfit",
  "courier",
  "codFees",
  "adSpend",
  "operating",
  "otherExpenses",
  "netProfit",
  "margin",
];

/** Removes the cost and profit figures from a statement, keeping the sales side. */
export function redactPnlStatement(statement: PnlStatement): PnlStatement {
  const sensitive = new Set(PNL_SENSITIVE_LINES);
  return {
    periods: statement.periods,
    lines: statement.lines.map((line) => (sensitive.has(line.key) ? { ...line, values: line.values.map(() => 0) } : line)),
  };
}

// ── Columns (which periods to compare) ────────────────────────────────────────

export type PnlColumnKey = "current" | "previous" | "ytd" | "lastYear";

export interface PnlColumnDef {
  key: PnlColumnKey;
  label: string;
  help: string;
}

export const PNL_COLUMNS: PnlColumnDef[] = [
  { key: "current", label: "Current period", help: "The date range you picked." },
  { key: "previous", label: "Previous period", help: "The same number of days, ending the day before the current period starts." },
  { key: "ytd", label: "Year to date", help: "1 January up to the end of the current period." },
  { key: "lastYear", label: "Same period last year", help: "The same dates one year earlier." },
];

const DAY_MS = 86_400_000;

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** Shifts a day by one year, keeping 29 February on 28 February. */
function shiftYear(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y + delta, m, 0)).getUTCDate();
  return `${y + delta}-${String(m).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00.000Z`).getTime() - new Date(`${from}T00:00:00.000Z`).getTime()) / DAY_MS) + 1;
}

/**
 * Builds the periods for the chosen columns. `from`/`to` are the current period
 * (inclusive). The previous period is the same number of days, ending the day
 * before `from`.
 */
export function buildPnlPeriods(from: string, to: string, columns: PnlColumnKey[]): PnlPeriod[] {
  const out: PnlPeriod[] = [];
  const length = daysBetween(from, to);

  for (const key of columns) {
    switch (key) {
      case "current":
        out.push({ key, label: "Current period", from, to });
        break;
      case "previous": {
        const prevTo = shiftDay(from, -1);
        const prevFrom = shiftDay(prevTo, -(length - 1));
        out.push({ key, label: "Previous period", from: prevFrom, to: prevTo });
        break;
      }
      case "ytd":
        out.push({ key, label: "Year to date", from: `${from.slice(0, 4)}-01-01`, to });
        break;
      case "lastYear":
        out.push({ key, label: "Same period last year", from: shiftYear(from, -1), to: shiftYear(to, -1) });
        break;
    }
  }
  return out;
}

// ── Saved layouts (presets) ──────────────────────────────────────────────────

export interface PnlPreset {
  id: string;
  name: string;
  /** Line keys to show, in order. */
  lines: PnlLineKey[];
  /** Columns to show, in order. */
  columns: PnlColumnKey[];
  /** Dimension to break the revenue down by. */
  dimension: PnlDimension;
}

export type PnlDimension = "none" | "channel" | "campaign" | "category" | "courier";

export const PNL_DIMENSIONS: { key: PnlDimension; label: string; help: string }[] = [
  { key: "none", label: "No breakdown", help: "Just the statement." },
  { key: "channel", label: "Sales channel", help: "Website, Facebook, Instagram, shop and unattributed." },
  { key: "campaign", label: "Campaign", help: "The campaign from the storefront's tracking parameters." },
  { key: "category", label: "Product category", help: "The category of the products sold." },
  { key: "courier", label: "Courier", help: "Which courier delivered the orders." },
];

export const DEFAULT_PRESET: PnlPreset = {
  id: "default",
  name: "Standard",
  lines: PNL_LINE_DEFS.map((def) => def.key),
  columns: ["current", "previous"],
  dimension: "none",
};

/** Keeps a stored preset usable: unknown lines and columns are dropped. */
export function normalisePreset(raw: Partial<PnlPreset> | null | undefined): PnlPreset {
  const knownLines = new Set(PNL_LINE_DEFS.map((def) => def.key));
  const knownColumns = new Set(PNL_COLUMNS.map((col) => col.key));
  const knownDimensions = new Set(PNL_DIMENSIONS.map((dim) => dim.key));
  const lines = (raw?.lines ?? []).filter((key): key is PnlLineKey => knownLines.has(key));
  const columns = (raw?.columns ?? []).filter((key): key is PnlColumnKey => knownColumns.has(key));
  const dimension = knownDimensions.has(raw?.dimension as PnlDimension) ? (raw!.dimension as PnlDimension) : "none";
  return {
    id: raw?.id && typeof raw.id === "string" ? raw.id.slice(0, 60) : "default",
    name: raw?.name && typeof raw.name === "string" ? raw.name.slice(0, 60) : "Standard",
    lines: lines.length ? lines : DEFAULT_PRESET.lines,
    columns: columns.length ? columns : DEFAULT_PRESET.columns,
    dimension,
  };
}
