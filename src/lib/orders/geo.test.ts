// Run with:  npm run test:geo
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectDistrictArea } from "./geo";

test("finds an area and implies Dhaka", () => {
  assert.deepEqual(detectDistrictArea("House 5, Road 3, Uttara"), { district: "Dhaka", area: "Uttara" });
});

test("handles Mirpur10 / Mirpur-10 written without spaces", () => {
  assert.equal(detectDistrictArea("Mirpur10, block C").area, "Mirpur");
  assert.equal(detectDistrictArea("mirpur-10").area, "Mirpur");
});

test("alternate spellings map to the canonical district", () => {
  assert.equal(detectDistrictArea("Kotwali, Chittagong").district, "Chattogram");
  assert.equal(detectDistrictArea("Comilla sadar").district, "Cumilla");
  assert.equal(detectDistrictArea("Bogra town").district, "Bogura");
  assert.equal(detectDistrictArea("Cox Bazar sea beach").district, "Cox's Bazar");
});

test("Bangla names work", () => {
  assert.deepEqual(detectDistrictArea("বাসা ৫, উত্তরা, ঢাকা"), { district: "Dhaka", area: "Uttara" });
  assert.equal(detectDistrictArea("কোতোয়ালী, চট্টগ্রাম").district, "Chattogram");
});

test("whole words only: no false hits inside other words", () => {
  assert.equal(detectDistrictArea("Bhawari market").area, undefined); // contains 'wari'
  assert.equal(detectDistrictArea("Uttarakhand road").area, undefined); // contains 'uttara'
});

test("if several districts appear, the last one (where addresses end) wins", () => {
  assert.equal(detectDistrictArea("Near Dhaka bus stand, Sylhet").district, "Sylhet");
});

test("empty or unknown text gives nothing", () => {
  assert.deepEqual(detectDistrictArea(""), {});
  assert.deepEqual(detectDistrictArea("some random place"), { district: undefined, area: undefined });
});
