// Run with:  npm run test:steadfast
// Steadfast's dashboard docs, their Laravel package and live accounts disagree about the exact status
// strings and the types of the amount fields, so these pin down the normalisation the webhook relies on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapSteadfastStatus, normalizeSteadfastStatus, readCourierPaidAmount, readLatestRiderTrackingMessage, readPaidAmount, readRiderNoteAmount, toAmount } from "./steadfast-status";

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
});

test("a courier cancellation is a Refuse Return (the parcel is coming back), not a Cancelled order", () => {
  assert.equal(mapSteadfastStatus("cancelled"), "refuse_return");
  assert.equal(mapSteadfastStatus("cancelled_return_received"), "refuse_return");
});

test("return_list and returned also map to Refuse Return (parcel entering the return manifest)", () => {
  assert.equal(mapSteadfastStatus("return_list"), "refuse_return");
  assert.equal(mapSteadfastStatus("returned"), "refuse_return");
  // Case/separator variants
  assert.equal(mapSteadfastStatus("Return_List"), "refuse_return");
  assert.equal(mapSteadfastStatus("RETURNED"), "refuse_return");
});

test("amounts may arrive as numbers or numeric strings, and missing stays null (not 0)", () => {
  assert.equal(toAmount(100), 100);
  assert.equal(toAmount("100.50"), 100.5);
  assert.equal(toAmount(""), null);
  assert.equal(toAmount(undefined), null);
  assert.equal(toAmount("abc"), null);
  assert.equal(toAmount(Number.NaN), null);
});

test("the paid amount is read from any of the field names Steadfast uses", () => {
  assert.equal(readPaidAmount({ cod_amount: "450.00" }), 450);
  assert.equal(readPaidAmount({ codAmount: 450 }), 450);
  assert.equal(readPaidAmount({ collected_amount: 320 }), 320);
  assert.equal(readPaidAmount({ paid_amount: "80" }), 80);
  assert.equal(readPaidAmount({ customerPaid: 0 }), 0);
  // An explicitly collected/paid field is what the customer handed over, so it wins over the
  // original (higher) COD amount Steadfast may still include in the same payload.
  assert.equal(readPaidAmount({ cod_amount: 1200, collected_amount: 450 }), 450);
  assert.equal(readPaidAmount({}), null);
  assert.equal(readPaidAmount(null), null);
});

test("consignment_update reads the changed COD from values and prefers it to a stale top-level amount", () => {
  assert.equal(readCourierPaidAmount({ notification_type: "consignment_update", cod_amount: 2490, values: { cod_amount: "1890.00" } }), 1890);
  assert.equal(readCourierPaidAmount({ notification_type: "consignment_update", values: { cod_amount: 0 } }), 0);
  assert.equal(readCourierPaidAmount({ notification_type: "consignment_update", values: { cus_address: "House 12" } }), null);
});

test("partial-delivery rider note supplies collected amount when COD is absent or stale", () => {
  const message = 'Consignment has been marked as partially delivered at the hub. Note: Rider Note: "কাস্টমার পার্সেল নেবেনা বিকাশে ১০০ টাকা ডেলিভারি চার্জ দিয়েছে"';
  assert.equal(readRiderNoteAmount(message), 100);
  assert.equal(readCourierPaidAmount({ status: "partial_delivered", tracking_message: message }), 100);
  assert.equal(readCourierPaidAmount({ status: "partial_delivered", cod_amount: 2490, tracking_message: message }), 100);
  assert.equal(readCourierPaidAmount({ values: { cod_amount: 80 }, tracking_message: message }), 100);
});

test("an explicit rider-note amount wins over a stale COD change while an explicit collected amount wins over the note", () => {
  const message = 'Delivered. Note: Rider Note: "2450 tk hobe refar by marchant"';
  assert.equal(readCourierPaidAmount({ status: "delivered", values: { cod_amount: 2490 }, tracking_message: message }), 2450);
  assert.equal(readCourierPaidAmount({ status: "delivered", values: { collected_amount: 2460, cod_amount: 2490 }, tracking_message: message }), 2460);
});

test("tracking history selects the newest rider-note entry for manual partial-delivery sync", () => {
  const latest = 'Partial delivery. Note: Rider Note: "কাস্টমার বিকাশে ১০০ টাকা দিয়েছে"';
  const history = {
    status: 200,
    tracking: [
      { text: 'Partial delivery. Note: Rider Note: "কাস্টমার ৫০ টাকা দিয়েছে"', created_at: "2026-11-04T10:00:00Z" },
      { text: latest, created_at: "2026-11-05T10:00:00Z" },
      { text: "Parcel reached hub", created_at: "2026-11-05T11:00:00Z" },
    ],
  };
  assert.equal(readLatestRiderTrackingMessage(history), latest);
  assert.equal(readCourierPaidAmount({ tracking_message: readLatestRiderTrackingMessage(history) }), 100);
});
