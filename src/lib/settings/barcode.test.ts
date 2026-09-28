// Run with:  npm run test:barcode
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBarcode, buildEan13, ean13CheckDigit } from "./barcode";

const base = { barcodeType: "code128" as const, barcodeMode: "sku" as const, barcodePrefix: "", barcodeDigits: 6 };

test("EAN-13 check digit matches the standard GS1 algorithm (real product barcode)", () => {
  // 4006381333931 is a well-known real-world EAN-13 (Nivea Creme); body 400638133393 -> check digit 1.
  assert.equal(ean13CheckDigit("400638133393"), "1");
  assert.equal(buildEan13("400638133393"), "4006381333931");
});

test("EAN-13 body is always padded/truncated to exactly 12 digits before the check digit", () => {
  assert.equal(buildEan13("1").length, 13);
  assert.equal(buildEan13("1234567890123456").length, 13); // too long: truncated, not overflowed
});

test("code128 + sku mode: barcode is just the (cleaned) SKU", () => {
  assert.equal(buildBarcode(base, 1, "nk-am270-blk-42"), "NKAM270BLK42");
});

test("code128 + sequence mode: prefix + zero-padded sequence at the configured digit count", () => {
  const s = { ...base, barcodeMode: "sequence" as const, barcodePrefix: "SHOE", barcodeDigits: 5 };
  assert.equal(buildBarcode(s, 42, "whatever"), "SHOE00042");
  assert.equal(buildBarcode(s, 100000, "whatever"), "SHOE100000"); // never truncates a real sequence number
});

test("code128 + random mode: prefix + digit-count random string, different each call", () => {
  const s = { ...base, barcodeMode: "random" as const, barcodePrefix: "R-", barcodeDigits: 8 };
  const a = buildBarcode(s, 1, "x");
  const b = buildBarcode(s, 1, "x");
  assert.equal(a.length, "R".length + 8); // "-" is stripped by the alnum-only prefix cleaner
  assert.notEqual(a, b);
});

test("ean13: always exactly 13 digits with a valid check digit, regardless of chosen mode", () => {
  const seq = { ...base, barcodeType: "ean13" as const, barcodeMode: "sequence" as const, barcodePrefix: "890" };
  const code = buildBarcode(seq, 7, "NK-AM270-BLK-42");
  assert.equal(code.length, 13);
  assert.match(code, /^\d{13}$/);
  assert.equal(code.slice(0, 12), "890" + String(7).padStart(9, "0")); // prefix "890" + 9 sequence digits (12 - 3)
  assert.equal(code.slice(-1), ean13CheckDigit(code.slice(0, 12)));
  assert.equal(code.startsWith("890"), true);

  const rnd = { ...seq, barcodeMode: "random" as const };
  const r = buildBarcode(rnd, 7, "x");
  assert.match(r, /^\d{13}$/);
  assert.equal(r.slice(-1), ean13CheckDigit(r.slice(0, 12)));

  // "sku" mode isn't valid for EAN-13 (SKU text isn't 12 clean digits), so it must still fall back to a valid code.
  const sku = { ...seq, barcodeMode: "sku" as const };
  const s = buildBarcode(sku, 7, "NK-AM270-BLK-42");
  assert.match(s, /^\d{13}$/);
});

test("two different sequence numbers never collide", () => {
  const s = { ...base, barcodeMode: "sequence" as const, barcodePrefix: "", barcodeDigits: 6 };
  assert.notEqual(buildBarcode(s, 1, "x"), buildBarcode(s, 2, "x"));
});
