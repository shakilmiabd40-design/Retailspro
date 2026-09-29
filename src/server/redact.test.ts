// Run with:  npm run test:redact
// Cost price is a field-level permission (products:financial). The sync API used to send it to every browser,
// so these cover the two server-side guards: stripping cost on read for roles that can't see it, and putting
// the STORED cost back on write so stripping can never zero a real value (e.g. a bulk stock re-save).
import { test } from "node:test";
import assert from "node:assert/strict";
import { canSeeProductCost, redactProductCost, preserveProductCost } from "./redact";
import { PRESET_ROLES } from "@/lib/settings/permissions";
import type { Role } from "@/lib/settings/types";

const preset = (id: string): Role => {
  const r = PRESET_ROLES.find((x) => x.id === id);
  if (!r) throw new Error(`unknown preset role ${id}`);
  return r;
};

const stored = () => ({
  id: "p1",
  name: "Shoe",
  costPrice: 500,
  sellingPrice: 1000,
  variants: [
    { id: "v1", color: "Black", size: "42", cost: 500, price: 1000, stock: 10 },
    { id: "v2", color: "White", size: "43", cost: 520, price: 1050, stock: 4 },
  ],
});

// ── Who can see cost ───────────────────────────────────────────────────────

test("only products:financial (or Super Admin) can see cost", () => {
  assert.equal(canSeeProductCost(preset("role-accounts")), true); // products: view, financial
  assert.equal(canSeeProductCost(preset("role-super-admin")), true); // locked → full access
  assert.equal(canSeeProductCost(preset("role-inventory")), false); // products: view/create/edit/export
  assert.equal(canSeeProductCost(preset("role-sales")), false); // products: view only
});

// ── Read path: strip ───────────────────────────────────────────────────────

test("redact removes costPrice and every variant cost, leaving the rest intact", () => {
  const out = redactProductCost(stored()) as ReturnType<typeof stored>;
  assert.equal("costPrice" in out, false);
  assert.equal(out.sellingPrice, 1000); // non-cost fields survive
  assert.deepEqual(
    out.variants.map((v) => "cost" in v),
    [false, false]
  );
  assert.deepEqual(
    out.variants.map((v) => v.price),
    [1000, 1050]
  );
});

test("redact does not mutate the original record", () => {
  const original = stored();
  redactProductCost(original);
  assert.equal(original.costPrice, 500);
  assert.equal(original.variants[0].cost, 500);
});

test("redact passes non-objects through untouched", () => {
  assert.equal(redactProductCost(null), null);
  assert.equal(redactProductCost("x"), "x");
});

// ── Write path: preserve ───────────────────────────────────────────────────

test("preserve puts the stored cost back over a redacted (cost-less) re-save", () => {
  const incoming = redactProductCost({ ...stored(), name: "Shoe (renamed)", sellingPrice: 1100 });
  const out = preserveProductCost(incoming, stored()) as ReturnType<typeof stored>;
  assert.equal(out.costPrice, 500); // restored from storage
  assert.equal(out.name, "Shoe (renamed)"); // the caller's real edit is kept
  assert.equal(out.sellingPrice, 1100);
  assert.equal(out.variants[0].cost, 500);
  assert.equal(out.variants[1].cost, 520);
});

test("preserve matches variant cost by id, not by position", () => {
  const reordered = { ...stored(), variants: [stored().variants[1], stored().variants[0]] };
  const out = preserveProductCost(reordered, stored()) as ReturnType<typeof stored>;
  assert.equal(out.variants[0].cost, 520); // v2's cost follows v2
  assert.equal(out.variants[1].cost, 500); // v1's cost follows v1
});

test("preserve leaves a brand-new record (no stored row) untouched", () => {
  const fresh = { id: "p9", costPrice: 0, variants: [{ id: "v9", cost: 0 }] };
  const out = preserveProductCost(fresh, undefined) as typeof fresh;
  assert.equal(out.costPrice, 0);
  assert.equal(out.variants[0].cost, 0);
});

test("preserve can't be tricked into raising cost by a caller who can't see it", () => {
  const tampered = { ...stored(), costPrice: 1, variants: [{ ...stored().variants[0], cost: 1 }] };
  const out = preserveProductCost(tampered, stored()) as ReturnType<typeof stored>;
  assert.equal(out.costPrice, 500); // stored value wins, not the sent 1
  assert.equal(out.variants[0].cost, 500);
});

test("preserve passes non-object incoming through untouched", () => {
  assert.equal(preserveProductCost(null, stored()), null);
});
