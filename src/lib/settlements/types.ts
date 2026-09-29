/** Courier payout ledger: money the courier remits (COD collected minus its fees), allocated to orders. */

export interface PayoutAllocation {
  orderId: string;
  amount: number;
}

export interface CourierPayout {
  id: string;
  payoutNumber: string;
  courier: string;
  amount: number;
  /** YYYY-MM-DD */
  paidDate: string;
  reference?: string;
  allocations: PayoutAllocation[];
  createdAt: string;
}

/** Admin adjustment on top of the calculated settlement (courier payout rules differ). */
export interface SettlementOverride {
  expected?: number;
  note?: string;
}

export interface SettlementData {
  payouts: CourierPayout[];
  overrides: Record<string, SettlementOverride>;
  counter: number;
}

export const EMPTY_SETTLEMENTS: SettlementData = { payouts: [], overrides: {}, counter: 1001 };
