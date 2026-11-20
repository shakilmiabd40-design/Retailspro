// Run with:  npm run test:customers
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCustomerCountQuery,
  buildCustomerRowsQuery,
  mapCustomerRow,
  parseCustomerQuery,
} from "./query";

test("customer query defaults match the orders list", () => {
  const q = parseCustomerQuery(new URLSearchParams());
  assert.deepEqual(
    { page: q.page, limit: q.limit, offset: q.offset, search: q.search, phoneSearch: q.phoneSearch },
    { page: 1, limit: 20, offset: 0, search: "", phoneSearch: "" }
  );
});

test("customer query bounds page and limit", () => {
  const q = parseCustomerQuery(new URLSearchParams({ page: "0", limit: "1000" }));
  assert.equal(q.page, 1);
  assert.equal(q.limit, 100);

  const negative = parseCustomerQuery(new URLSearchParams({ page: "-5", limit: "-2" }));
  assert.equal(negative.page, 1);
  assert.equal(negative.limit, 1);

  const later = parseCustomerQuery(new URLSearchParams({ page: "3", limit: "10" }));
  assert.equal(later.offset, 20);
});

test("search escapes LIKE wildcards and normalizes phone fragments", () => {
  const q = parseCustomerQuery(new URLSearchParams({ search: "  Rahim%_" }));
  assert.equal(q.search, "rahim\\%\\_");

  const phone = parseCustomerQuery(new URLSearchParams({ search: "+880 ১৭১২-345678" }));
  assert.equal(phone.phoneSearch, "01712345678");

  const partial = parseCustomerQuery(new URLSearchParams({ search: "880171" }));
  assert.equal(partial.phoneSearch, "0171");
});

test("count and rows queries reuse the same grouped CTE and search params", () => {
  const q = parseCustomerQuery(new URLSearchParams({ search: "0171" }));
  const count = buildCustomerCountQuery(q);
  const rows = buildCustomerRowsQuery(q);

  assert.deepEqual(count.params, ["0171", "0171"]);
  assert.deepEqual(rows.params, ["0171", "0171", 20, 0]);
  assert.match(count.sql, /GROUP BY phone/);
  assert.match(rows.sql, /LIMIT \$3 OFFSET \$4/);
  assert.match(rows.sql, /last_order_date DESC NULLS LAST/);
});

test("maps numeric strings and rounds delivered amount", () => {
  assert.deepEqual(
    mapCustomerRow({
      name: "Rahim",
      phone: "01712345678",
      total_orders: "3",
      delivered: "2",
      refused_returned: "1",
      lifetime_delivered: "1250.126",
      last_order_date: "2026-11-20T10:00:00.000Z",
    }),
    {
      name: "Rahim",
      phone: "01712345678",
      totalOrders: 3,
      delivered: 2,
      refusedReturned: 1,
      lifetimeDelivered: 1250.13,
      lastOrderDate: "2026-11-20T10:00:00.000Z",
    }
  );
});
