import type { ProductSettings } from "./types";

const digitsOnly = (s: string) => s.replace(/\D+/g, "");
const alnumOnly = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "");

/** Standard GS1 check digit for a 12-digit EAN-13 body. */
export function ean13CheckDigit(body12: string): string {
  const d = digitsOnly(body12).padStart(12, "0").slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

/** Pads/truncates to a full, valid 13-digit EAN-13 code (12 body digits + check digit). */
export function buildEan13(body12: string): string {
  const body = digitsOnly(body12).padStart(12, "0").slice(0, 12);
  return body + ean13CheckDigit(body);
}

function randomDigits(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function randomAlnum(n: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

/**
 * Builds one auto-generated barcode value. `nextSeq` is a number reserved from the shared "barcode" counter
 * (unique across everyone using the shop), so two people generating variants at the same time never collide.
 * Falls back sensibly (e.g. to the SKU) when a setting doesn't make sense for the chosen mode.
 */
export function buildBarcode(settings: Pick<ProductSettings, "barcodeType" | "barcodeMode" | "barcodePrefix" | "barcodeDigits">, nextSeq: number, sku: string): string {
  const { barcodeType, barcodeMode, barcodePrefix, barcodeDigits } = settings;

  if (barcodeType === "ean13") {
    // EAN-13 must be exactly 13 numeric digits, so "sku" mode falls back to a random/sequential body here.
    const prefix = digitsOnly(barcodePrefix).slice(0, 11);
    const bodyDigits = Math.max(1, 12 - prefix.length);
    const rest = barcodeMode === "random" ? randomDigits(bodyDigits) : String(nextSeq).padStart(bodyDigits, "0").slice(-bodyDigits);
    return buildEan13(prefix + rest);
  }

  if (barcodeMode === "sku") return alnumOnly(sku);

  const digits = Math.min(14, Math.max(3, barcodeDigits || 6));
  const prefix = alnumOnly(barcodePrefix);
  if (barcodeMode === "random") return `${prefix}${randomAlnum(digits)}`;
  return `${prefix}${String(nextSeq).padStart(digits, "0")}`;
}

export const BARCODE_MODE_LABELS: Record<ProductSettings["barcodeMode"], string> = {
  sku: "Same as SKU",
  sequence: "Sequential number",
  random: "Random unique code",
};
