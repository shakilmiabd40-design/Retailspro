import { zipSync, strToU8 } from "fflate";

export type CellValue = string | number | null | undefined;

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => CellValue;
}

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Spreadsheet apps run text that starts with = + - @ as a formula. Prefix such text so exports can't be used to inject one. */
function safeText(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

function csvCell(v: CellValue): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? String(v) : safeText(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(","));
  return lines.join("\r\n");
}

export function downloadCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]) {
  // BOM so Excel opens UTF-8 (৳, Bengali names) correctly.
  download(`${filename}.csv`, new Blob(["\uFEFF" + toCsv(columns, rows)], { type: "text/csv;charset=utf-8" }));
}

// ---- minimal .xlsx writer (no dependency beyond fflate for zipping) -----------

const xmlEscape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
// XML 1.0 forbids most control characters; strip them so the file always opens.
const stripControl = (s: string) => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

function colName(i: number): string {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function buildXlsx<T>(sheetName: string, columns: ExportColumn<T>[], rows: T[]): Uint8Array {
  const cell = (v: CellValue, ref: string, style?: number) => {
    const s = style ? ` s="${style}"` : "";
    if (v === null || v === undefined || v === "") return `<c r="${ref}"${s}/>`;
    if (typeof v === "number" && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEscape(stripControl(safeText(String(v))))}</t></is></c>`;
  };

  const sheetRows: string[] = [];
  sheetRows.push(`<row r="1">${columns.map((c, ci) => cell(c.header, `${colName(ci)}1`, 1)).join("")}</row>`);
  rows.forEach((row, ri) => {
    const r = ri + 2;
    sheetRows.push(`<row r="${r}">${columns.map((c, ci) => cell(c.value(row), `${colName(ci)}${r}`)).join("")}</row>`);
  });

  const widths = columns.map((c, ci) => {
    const longest = Math.max(c.header.length, ...rows.slice(0, 200).map((r) => String(c.value(r) ?? "").length));
    return `<col min="${ci + 1}" max="${ci + 1}" width="${Math.min(45, Math.max(10, longest + 2))}" customWidth="1"/>`;
  });

  const safeSheet = xmlEscape(stripControl(sheetName).replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Report");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${safeSheet}" sheetId="1" r:id="rId1"/></sheets></workbook>`
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
    ),
    "xl/styles.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
    ),
    "xl/worksheets/sheet1.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.join("")}</cols><sheetData>${sheetRows.join("")}</sheetData></worksheet>`
    ),
  };
  return zipSync(files, { level: 6 });
}

export function downloadXlsx<T>(filename: string, sheetName: string, columns: ExportColumn<T>[], rows: T[]) {
  const bytes = buildXlsx(sheetName, columns, rows);
  // Copy into a fresh ArrayBuffer-backed view so Blob accepts it regardless of the TS lib version.
  const copy = new Uint8Array(bytes);
  download(`${filename}.xlsx`, new Blob([copy], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
}
