// Run with:  npm run test:accounting
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Order } from "@/lib/orders/types";
import type { Product } from "@/lib/products/types";
import type { PosInvoice } from "@/lib/pos/types";
import type { Account, LedgerEntry } from "./types";
import { accountBalance, dueRecurring, nextMonthly, profitLoss } from "./utils";

const entry = (over: Partial<LedgerEntry> & Pick<LedgerEntry, "kind" | "amount">): LedgerEntry => ({ id: over.id ?? Math.random().toString(36).slice(2), date: "2026-09-10", createdAt: "2026-09-10T00:00:00Z", ...over });

const product = { id: "p1", costPrice: 600, variants: [{ id: "v1", cost: 600 }] } as unknown as Product;
const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "o1",
    status: "delivered",
    items: [{ productId: "p1", variantId: "v1", price: 1000, qty: 1, discount: 100 }],
    deliveryCharge: 100,
    courier: { company: "Pathao", forwardCost: 100, returnCost: 0, otherCost: 20 },
    delivery: { deliveryDate: "2026-09-12", customerPaid: 0 },
    createdAt: "2026-09-10T00:00:00Z",
    ...over,
  }) as unknown as Order;

test("profit & loss: gross, courier, expenses and net profit line up", () => {
  const ledger = [
    entry({ kind: "expense", amount: 300, category: "Office / shop rent" }),
    entry({ kind: "expense", amount: 200, category: "Marketing — Facebook / Meta boosting" }),
    entry({ kind: "income", amount: 50, category: "Commission" }),
    entry({ kind: "transfer", amount: 999, accountId: "a", toAccountId: "b" }), // never touches profit
    entry({ kind: "owner_in", amount: 5000 }),
    entry({ kind: "receipt", amount: 777 }),
    entry({ kind: "expense", amount: 1000, category: "Old", date: "2026-08-01" }), // outside the period
  ];
  const pl = profitLoss({ orders: [order()], products: [product], invoices: [], ledger }, "2026-09-01", "2026-09-30");
  assert.equal(pl.revenue, 1000); // 900 sales after discount + 100 delivery billed
  assert.equal(pl.cogs, 600);
  assert.equal(pl.grossProfit, 400);
  assert.equal(pl.courierCost, 120);
  assert.equal(pl.operatingExpenses, 500);
  assert.equal(pl.otherIncome, 50);
  assert.equal(pl.netProfit, 400 - 120 - 500 + 50); // −170
  assert.deepEqual(pl.expensesByCategory.map((c) => c.category), ["Office / shop rent", "Marketing — Facebook / Meta boosting"]);
});

test("profit & loss: order counts on its delivery date, and only when delivered", () => {
  const inputs = { products: [product], invoices: [], ledger: [] };
  assert.equal(profitLoss({ ...inputs, orders: [order({ delivery: { deliveryDate: "2026-08-30", customerPaid: 0 } } as Partial<Order>)] }, "2026-09-01", "2026-09-30").revenue, 0);
  assert.equal(profitLoss({ ...inputs, orders: [order({ status: "in_transit" })] }, "2026-09-01", "2026-09-30").revenue, 0);
  const refused = profitLoss({ ...inputs, orders: [order({ status: "refuse_return" })] }, "2026-09-01", "2026-09-30");
  assert.equal(refused.revenue, 0);
  assert.equal(refused.courierLoss, 120); // the courier still has to be paid
});

test("profit & loss: POS walk-in sales are counted net of returns; POS delivery sales are not double counted", () => {
  const item = { net: 2000, cost: 700, qty: 2, returnedQty: 1 };
  const walkIn = { status: "completed", saleType: "walk_in", createdAt: "2026-09-15T10:00:00Z", items: [item] } as unknown as PosInvoice;
  const delivery = { ...walkIn, saleType: "delivery" } as PosInvoice;
  const voided = { ...walkIn, status: "void" } as PosInvoice;
  const pl = profitLoss({ orders: [], products: [], invoices: [walkIn, delivery, voided], ledger: [] }, "2026-09-01", "2026-09-30");
  assert.equal(pl.posSales, 1000); // one of two units kept
  assert.equal(pl.cogs, 700);
  assert.equal(pl.grossProfit, 300);
});

test("account balances: opening + money in − money out, transfers move money between accounts", () => {
  const a = { id: "a", openingBalance: 1000 } as Account;
  const b = { id: "b", openingBalance: 0 } as Account;
  const ledger = [
    entry({ kind: "expense", amount: 200, accountId: "a" }),
    entry({ kind: "receipt", amount: 500, accountId: "a" }),
    entry({ kind: "transfer", amount: 300, accountId: "a", toAccountId: "b" }),
    entry({ kind: "owner_out", amount: 100, accountId: "b" }),
    entry({ kind: "expense", amount: 50 }), // account not tracked: no effect on any balance
  ];
  assert.equal(accountBalance(a, ledger), 1000 - 200 + 500 - 300);
  assert.equal(accountBalance(b, ledger), 300 - 100);
});

test("monthly repeat: same day next month, clamped to the month's last day", () => {
  assert.equal(nextMonthly("2026-01-31"), "2026-02-28");
  assert.equal(nextMonthly("2028-01-31"), "2028-02-29");
  assert.equal(nextMonthly("2026-02-28", 31), "2026-03-31"); // keeps the original 31st when the month has it
  assert.equal(nextMonthly("2026-12-05"), "2027-01-05");
});

test("recurring: only the newest entry of a series is due, and only once its month arrives", () => {
  const rent = entry({ id: "r1", kind: "expense", amount: 25000, category: "Office / shop rent", date: "2026-08-05", repeatMonthly: true, seriesId: "r1" });
  assert.equal(dueRecurring([rent], "2026-09-04").length, 0);
  const due = dueRecurring([rent], "2026-09-05");
  assert.equal(due.length, 1);
  assert.equal(due[0].dueDate, "2026-09-05");
  // after recording September the flag moves on, so August no longer repeats and September isn't due until October
  const aug = { ...rent, repeatMonthly: undefined };
  const sep = entry({ id: "r2", kind: "expense", amount: 25000, date: "2026-09-05", repeatMonthly: true, seriesId: "r1" });
  assert.equal(dueRecurring([aug, sep], "2026-09-30").length, 0);
  assert.equal(dueRecurring([aug, sep], "2026-10-05")[0].dueDate, "2026-10-05");
});
