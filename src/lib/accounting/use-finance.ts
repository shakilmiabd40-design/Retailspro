"use client";

import { useCallback, useMemo } from "react";
import { useOrders } from "@/lib/orders/store";
import { useProducts } from "@/lib/products/store";
import { usePos } from "@/lib/pos/store";
import { useAccounting } from "./store";
import { profitLoss } from "./utils";

/** Everything the accounting screens need in one place: the ledger plus the sales data profit & loss is built from. */
export function useFinance() {
  const { orders, hydrated: ordersReady } = useOrders();
  const { products, hydrated: productsReady } = useProducts();
  const { invoices, hydrated: posReady } = usePos();
  const acct = useAccounting();

  const pnl = useCallback((from: string, to: string) => profitLoss({ orders, products, invoices, ledger: acct.entries }, from, to), [orders, products, invoices, acct.entries]);
  const ready = ordersReady && productsReady && posReady && acct.hydrated;
  return useMemo(() => ({ ...acct, ready, pnl }), [acct, ready, pnl]);
}
