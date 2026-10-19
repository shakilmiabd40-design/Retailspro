// Run with:  npm run test:access
// Access rules the sync API enforces on every read and write. The point of these is the isolation that
// protects money: a role that can see Reports must NOT be able to pull the raw accounting ledger, and a
// view-only role must never satisfy a write check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canRead, canWrite, COLLECTION_ACCESS, DOCUMENT_ACCESS } from "./collections";
import { PRESET_ROLES } from "@/lib/settings/permissions";
import type { Role } from "@/lib/settings/types";

const preset = (id: string): Role => {
  const r = PRESET_ROLES.find((x) => x.id === id);
  if (!r) throw new Error(`unknown preset role ${id}`);
  return r;
};
const role = (permissions: Role["permissions"], over: Partial<Role> = {}): Role => ({
  id: "role-custom",
  name: "Custom",
  description: "",
  builtIn: false,
  locked: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  permissions,
  ...over,
});

test("a Reports-only role can read settlements but NOT the raw ledger or accounts", () => {
  const reportsOnly = role({ reports: ["view", "export", "financial"] });
  assert.equal(canRead(reportsOnly, DOCUMENT_ACCESS.settlements), true);
  assert.equal(canRead(reportsOnly, COLLECTION_ACCESS.ledger), false);
  assert.equal(canRead(reportsOnly, COLLECTION_ACCESS.accounts), false);
});

test("the Accounts preset can read the ledger and accounts", () => {
  const accounts = preset("role-accounts");
  assert.equal(canRead(accounts, COLLECTION_ACCESS.ledger), true);
  assert.equal(canRead(accounts, COLLECTION_ACCESS.accounts), true);
});

test("read:'any' collections are visible to every role", () => {
  const cashier = preset("role-cashier");
  assert.equal(canRead(cashier, COLLECTION_ACCESS.products), true);
  assert.equal(canRead(cashier, COLLECTION_ACCESS.orders), true);
});

test("a write check needs a real write action, not just view", () => {
  const ordersViewOnly = role({ orders: ["view"] });
  assert.equal(canRead(ordersViewOnly, COLLECTION_ACCESS.orders), true);
  assert.equal(canWrite(ordersViewOnly, COLLECTION_ACCESS.orders), false);

  const productsViewOnly = role({ products: ["view"] });
  assert.equal(canWrite(productsViewOnly, COLLECTION_ACCESS.products), false);

  const ordersEditor = role({ orders: ["view", "edit"] });
  assert.equal(canWrite(ordersEditor, COLLECTION_ACCESS.orders), true);
});

test("creating orders may write products (stock reservation) — the documented coarse cross-module rule", () => {
  const sales = preset("role-sales"); // orders: create/edit/update_status, products: view only
  assert.equal(canWrite(sales, COLLECTION_ACCESS.products), true);
});

test("Super Admin (locked) can read and write every collection and document", () => {
  const sa = preset("role-super-admin");
  for (const access of Object.values(COLLECTION_ACCESS)) {
    assert.equal(canRead(sa, access), true);
    assert.equal(canWrite(sa, access), true);
  }
  for (const access of Object.values(DOCUMENT_ACCESS)) {
    assert.equal(canRead(sa, access), true);
    assert.equal(canWrite(sa, access), true);
  }
});

test("notification settings need an inventory/settings write action; the shared alert data does not", () => {
  const cashier = preset("role-cashier"); // pos/products/warranty only — no inventory, no settings
  assert.equal(canRead(cashier, DOCUMENT_ACCESS.notifications_settings), true); // the engine reads it everywhere
  assert.equal(canWrite(cashier, DOCUMENT_ACCESS.notifications_settings), false);
  assert.equal(canWrite(cashier, DOCUMENT_ACCESS.notifications_data), true); // any browser persists alerts/read-state

  const inventoryStaff = preset("role-inventory"); // inventory: create/edit
  assert.equal(canWrite(inventoryStaff, DOCUMENT_ACCESS.notifications_settings), true);

  const sales = preset("role-sales"); // inventory: view only
  assert.equal(canWrite(sales, DOCUMENT_ACCESS.notifications_settings), false);
});
