// Run with:  npm run test:customers
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPhoneVariants } from "./phone";

const EXPECTED = ["01712345678", "8801712345678", "+8801712345678"];

test("builds all stored variants from a local number", () => {
  assert.deepEqual(buildPhoneVariants("01712345678"), { valid: true, local: "01712345678", variants: EXPECTED });
});

test("normalizes +880 and 880 prefixes to the local form", () => {
  for (const input of ["+8801712345678", "8801712345678"]) {
    assert.deepEqual(buildPhoneVariants(input), { valid: true, local: "01712345678", variants: EXPECTED });
  }
});

test("converts Bangla digits and strips separators", () => {
  for (const input of ["০১৭১২৩৪৫৬৭৮", "+880 1712-345678", "(017) 1234-5678"]) {
    assert.equal(buildPhoneVariants(input).local, "01712345678");
  }
});

test("rejects incomplete or non-Bangladeshi numbers", () => {
  for (const input of ["", "0171234567", "1712345678", "02012345678", "+911712345678", "01712345678x"]) {
    const result = buildPhoneVariants(input);
    assert.equal(result.valid, false, input);
    assert.deepEqual(result.variants, []);
  }
});
