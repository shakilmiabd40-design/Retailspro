// Run with:  npm run test:steadfast
// Steadfast's dashboard docs, their Laravel package and live accounts disagree about the exact status
// strings and the types of the amount fields, so these pin down the normalisation the webhook relies on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapSteadfastStatus, normalizeSteadfastStatus, toAmount } from "./steadfast-status";

test("status strings are normalised regardless of case, spaces or hyphens", () => {
  assert.equal(normalizeSteadfastStatus("  Partial Delivered "), "partial_delivered");
  assert.equal(normalizeSteadfastStatus("IN-REVIEW"), "in_review");
  assert.equal(normalizeSteadfastStatus(null), "");
});

test("a parcel accepted by Steadfast is In Transit (this is also the in_review → pending step)", () => {
  assert.equal(mapSteadfastStatus("pending"), "in_transit");
  assert.equal(mapSteadfastStatus("in_transit"), "in_transit");
});

test("in_review, hold and the unconfirmed *_approval_pending stages leave the order alone", () => {
  for (const s of ["in_review", "hold", "unknown", "exceptional", "delivered_approval_pending", "partial_delivered_approval_pending"]) {
    assert.equal(mapSteadfastStatus(s), null, s);
  }
});

test("confirmed outcomes map to their RetailPro status", () => {
  assert.equal(mapSteadfastStatus("delivered"), "delivered");
  assert.equal(mapSteadfastStatus("partial_delivered"), "partial_delivered");
  assert.equal(mapSteadfastStatus("partial_delivered_return_processing"), "partial_delivered");
  assert.equal(mapSteadfastStatus("cancelled"), "cancelled");
  assert.equal(mapSteadfastStatus("cancelled_return_received"), "cancelled");
});

test("amounts may arrive as numbers or numeric strings, and missing stays null (not 0)", () => {
  assert.equal(toAmount(100), 100);
  assert.equal(toAmount("100.50"), 100.5);
  assert.equal(toAmount(""), null);
  assert.equal(toAmount(undefined), null);
  assert.equal(toAmount("abc"), null);
  assert.equal(toAmount(Number.NaN), null);
});
