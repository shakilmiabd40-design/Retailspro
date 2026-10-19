"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useDocument } from "@/lib/persist/hooks";
import { useOrders } from "@/lib/orders/store";
import { buildAllocationIndex, computeSettlement, legacyFlagFor, type SettlementRow } from "./compute";
import { EMPTY_SETTLEMENTS } from "./types";
import type { CourierPayout, PayoutAllocation, SettlementData, SettlementOverride } from "./types";

export interface NewPayoutInput {
  courier: string;
  amount: number;
  paidDate: string;
  reference?: string;
  allocations: PayoutAllocation[];
}

interface SettlementsContextValue {
  payouts: CourierPayout[];
  overrides: Record<string, SettlementOverride>;
  /** Settlement position of every order that is part of settlement tracking. */
  rows: SettlementRow[];
  hydrated: boolean;
  getRow: (orderId: string) => SettlementRow | undefined;
  recordPayout: (input: NewPayoutInput) => { ok: true; payout: CourierPayout } | { ok: false; error: string };
  deletePayout: (id: string) => void;
  setOverride: (orderId: string, override: SettlementOverride | null) => void;
}

const SettlementsContext = createContext<SettlementsContextValue | null>(null);

export function SettlementsProvider({ children }: { children: ReactNode }) {
  const { orders, hydrated: ordersReady, setSettlementFlags } = useOrders();
  const [data, setData, loaded] = useDocument<SettlementData>("settlements", EMPTY_SETTLEMENTS, {
    normalize: (raw) => ({ ...EMPTY_SETTLEMENTS, ...(raw as Partial<SettlementData>) }),
  });

  const rows = useMemo(() => {
    const index = buildAllocationIndex(data.payouts);
    return orders.map((o) => computeSettlement(o, index, data.overrides)).filter((r) => r.applies);
  }, [orders, data]);

  const value = useMemo<SettlementsContextValue>(() => {
    /** Keeps the order's own Settled / Pending flag (used by the Orders list filter) in step with the ledger. */
    function syncFlags(next: SettlementData, orderIds: string[]) {
      const index = buildAllocationIndex(next.payouts);
      const flags: Record<string, "settled" | "pending"> = {};
      for (const id of orderIds) {
        const order = orders.find((o) => o.id === id);
        if (!order) continue;
        // Compute as if there were no legacy flag, so removing the last payout can flip an order back to pending.
        const row = computeSettlement({ ...order, delivery: { ...order.delivery, settlementStatus: undefined } }, index, next.overrides);
        flags[id] = legacyFlagFor(row);
      }
      setSettlementFlags(flags);
    }

    return {
      payouts: data.payouts,
      overrides: data.overrides,
      rows,
      hydrated: loaded && ordersReady,
      getRow: (orderId) => rows.find((r) => r.order.id === orderId),
      recordPayout: (input) => {
        const allocations = input.allocations.filter((a) => a.amount > 0);
        const allocated = allocations.reduce((s, a) => s + a.amount, 0);
        if (!input.courier.trim()) return { ok: false, error: "Choose a courier company." };
        if (!(input.amount > 0)) return { ok: false, error: "Enter the amount the courier paid." };
        if (!input.paidDate) return { ok: false, error: "Enter the paid date." };
        if (!allocations.length) return { ok: false, error: "Allocate the payout to at least one order." };
        if (allocated > input.amount + 0.001) return { ok: false, error: "Allocated amount can't be more than the paid amount." };
        const payout: CourierPayout = {
          id: crypto.randomUUID(),
          payoutNumber: `PAY-${data.counter}`,
          courier: input.courier.trim(),
          amount: input.amount,
          paidDate: input.paidDate,
          reference: input.reference?.trim() || undefined,
          allocations,
          createdAt: new Date().toISOString(),
        };
        const next: SettlementData = { ...data, payouts: [payout, ...data.payouts], counter: data.counter + 1 };
        setData(next);
        syncFlags(next, allocations.map((a) => a.orderId));
        return { ok: true, payout };
      },
      deletePayout: (id) => {
        const target = data.payouts.find((p) => p.id === id);
        if (!target) return;
        const next: SettlementData = { ...data, payouts: data.payouts.filter((p) => p.id !== id) };
        setData(next);
        syncFlags(next, target.allocations.map((a) => a.orderId));
      },
      setOverride: (orderId, override) => {
        const overrides = { ...data.overrides };
        if (!override || (override.expected === undefined && !override.note?.trim())) delete overrides[orderId];
        else overrides[orderId] = { expected: override.expected, note: override.note?.trim() || undefined };
        const next: SettlementData = { ...data, overrides };
        setData(next);
        // Only re-derive the order's Settled/Pending flag when payouts are involved;
        // an order settled the old way (no ledger entries) must stay settled after a note or amount tweak.
        if (data.payouts.some((p) => p.allocations.some((a) => a.orderId === orderId))) syncFlags(next, [orderId]);
      },
    };
  }, [data, rows, loaded, ordersReady, orders, setSettlementFlags, setData]);

  return <SettlementsContext.Provider value={value}>{children}</SettlementsContext.Provider>;
}

export function useSettlements() {
  const ctx = useContext(SettlementsContext);
  if (!ctx) throw new Error("useSettlements must be used within a SettlementsProvider");
  return ctx;
}
