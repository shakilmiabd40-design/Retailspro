import type { Product } from "./types";
import { totalStock } from "./utils";

const EXPORT_HEADERS = [
  "name",
  "sku",
  "brand",
  "category",
  "costPrice",
  "sellingPrice",
  "totalStock",
  "variants",
  "status",
];

function csvEscape(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function productsToCsv(products: Product[]): string {
  const rows = products.map((p) =>
    [p.name, p.sku, p.brand, p.category, p.costPrice, p.sellingPrice, totalStock(p), p.variants.length, p.status]
      .map(csvEscape)
      .join(",")
  );
  return [EXPORT_HEADERS.join(","), ...rows].join("\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Minimal CSV parser for the Import flow. Expects a header row with (at least)
 * name,sku,brand,category,costPrice,sellingPrice,stock,status — matching the
 * shape produced by "Export". Does not handle quoted/escaped commas.
 */
export function parseImportCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
}
