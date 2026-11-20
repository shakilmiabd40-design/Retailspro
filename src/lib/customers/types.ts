import type { OrderStatus } from "@/lib/orders/types";

/** Compact order projection used by the customer lookup (no ledger, cost or customer fields). */
export interface LookupOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  /** Order total (Expected COD) as a number. */
  total: number;
  refusalReason?: string | null;
}

export interface CustomerActiveOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  total: number;
}

export interface CustomerLastOrder {
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
}

export interface CustomerLastRefusal {
  orderNumber: string;
  createdAt: string;
  refusalReason: string | null;
}

export interface CustomerLookupResult {
  found: boolean;
  valid: boolean;
  total: number;
  counts: Record<OrderStatus, number>;
  activeOrders: CustomerActiveOrder[];
  lastOrder: CustomerLastOrder | null;
  lifetimeDelivered: number;
  lastRefusal: CustomerLastRefusal | null;
  lastRefusalReason: string | null;
}

/** One row in the customers list: all orders sharing the same normalized phone. */
export interface CustomerSummary {
  /** Most recent non-empty name on the matching orders. */
  name: string;
  /** Normalized local phone (01XXXXXXXXX). */
  phone: string;
  totalOrders: number;
  delivered: number;
  refusedReturned: number;
  lifetimeDelivered: number;
  lastOrderDate: string | null;
}

export interface CustomersPageResponse {
  rows: CustomerSummary[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
