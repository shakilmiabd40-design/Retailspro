// Run with:  npm run test:auth
// These cover the security primitives that never touch the database: password hashing/verification
// and the role-permission predicate the sync API and every route handler rely on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, dummyVerify, roleHas } from "./auth";
import { SUPER_ADMIN_ROLE_ID } from "@/lib/settings/permissions";
import type { Role } from "@/lib/settings/types";

// ── Passwords ──────────────────────────────────────────────────────────────

test("a password round-trips through hash/verify and uses the scrypt parameters", async () => {
  const hash = await hashPassword("Secret123!");
  assert.match(hash, /^scrypt\$16384\$8\$1\$/);
  assert.equal(await verifyPassword("Secret123!", hash), true);
});

test("a wrong password never verifies (case, whitespace and empty all fail)", async () => {
  const hash = await hashPassword("Secret123!");
  assert.equal(await verifyPassword("secret123!", hash), false);
  assert.equal(await verifyPassword("Secret123! ", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("the same password hashes differently each time (random 16-byte salt)", async () => {
  const a = await hashPassword("Secret123!");
  const b = await hashPassword("Secret123!");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("Secret123!", a), true);
  assert.equal(await verifyPassword("Secret123!", b), true);
});

test("a different scheme or a malformed hash is rejected, not thrown", async () => {
  assert.equal(await verifyPassword("Secret123!", "bcrypt$12$abcdefghijklmnopqrstuv"), false);
  assert.equal(await verifyPassword("Secret123!", "plaintext:Secret123!"), false);
});

test("dummyVerify burns a real scrypt check and never rejects (user-enumeration defence)", async () => {
  await assert.doesNotReject(dummyVerify("anything"));
  await assert.doesNotReject(dummyVerify(""));
});

// ── roleHas ────────────────────────────────────────────────────────────────

type CheckRole = Pick<Role, "id" | "locked" | "permissions">;
const role = (permissions: Role["permissions"], over: Partial<CheckRole> = {}): CheckRole => ({
  id: "role-custom",
  locked: false,
  permissions,
  ...over,
});

test("roleHas grants an explicitly permitted module/action and denies everything else", () => {
  const sales = role({ orders: ["view", "create", "update_status"] });
  assert.equal(roleHas(sales, "orders", "view"), true);
  assert.equal(roleHas(sales, "orders", "create"), true);
  assert.equal(roleHas(sales, "orders", "delete"), false);
  assert.equal(roleHas(sales, "products", "view"), false);
  assert.equal(roleHas(sales, "orders"), true); // action defaults to "view"
});

test("a locked role (Super Admin) passes every check even with an empty permission map", () => {
  const sa = role({}, { id: SUPER_ADMIN_ROLE_ID, locked: true });
  assert.equal(roleHas(sa, "accounting", "delete"), true);
  assert.equal(roleHas(sa, "settings", "settings"), true);
});

test("the Super Admin role id passes even if it isn't flagged locked", () => {
  const sa = role({}, { id: SUPER_ADMIN_ROLE_ID, locked: false });
  assert.equal(roleHas(sa, "audit", "export"), true);
});

test("a module missing from the permission map denies access", () => {
  assert.equal(roleHas(role({}), "inventory", "view"), false);
});
