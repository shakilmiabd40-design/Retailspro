// Run with:  npm run test:db
// These cover the connection-error classification the app uses to decide whether a failed database
// call may be retried. Nothing here touches a real database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isDbBusyError } from "./db";

test("Postgres' too_many_connections code is treated as a busy database", () => {
  assert.equal(isDbBusyError({ code: "53300", message: "too many connections" }), true);
});

test("Postgres' configuration_limit_exceeded code is treated as a busy database", () => {
  assert.equal(isDbBusyError({ code: "53400", message: "sorry, too many clients already" }), true);
});

test("the 'remaining connection slots' message is treated as a busy database", () => {
  assert.equal(isDbBusyError({ code: "53300", message: "FATAL: remaining connection slots are reserved for superusers" }), true);
  assert.equal(isDbBusyError({ message: "sorry, too many clients already" }), true);
});

test("an ordinary database error is not mistaken for a busy database", () => {
  assert.equal(isDbBusyError({ code: "42P01", message: 'relation "app_records" does not exist' }), false);
  assert.equal(isDbBusyError({ code: "23505", message: "duplicate key value violates unique constraint" }), false);
  assert.equal(isDbBusyError(new Error("something went wrong")), false);
  assert.equal(isDbBusyError(null), false);
  assert.equal(isDbBusyError(undefined), false);
});

test("a pool that could not hand out a connection in time counts as busy, not as a crash", () => {
  assert.equal(isDbBusyError(new Error("timeout exceeded when trying to connect")), true);
});
