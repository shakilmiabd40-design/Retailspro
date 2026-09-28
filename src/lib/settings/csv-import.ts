/** RFC-4180-ish CSV parsing (quoted fields, escaped quotes, CRLF, BOM) for the Data import flow. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export interface ParsedTable {
  headers: string[];
  rows: { line: number; values: Record<string, string> }[];
}

export function toTable(text: string): ParsedTable {
  const grid = parseCsv(text);
  if (!grid.length) return { headers: [], rows: [] };
  const headers = grid[0].map((h) => h.trim());
  return {
    headers,
    rows: grid.slice(1).map((cells, i) => ({
      line: i + 2,
      values: Object.fromEntries(headers.map((h, idx) => [h, (cells[idx] ?? "").trim()])),
    })),
  };
}

export function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header.map(csvEscape).join(","), ...rows.map((r) => r.map(csvEscape).join(","))].join("\n");
}
