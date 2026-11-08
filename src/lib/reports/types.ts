/** Shared report shapes used by both the server aggregators and the client pages. */

export const REPORT_CHANNELS = ["all", "website", "facebook", "instagram", "shop", "unattributed"] as const;

export type ReportChannel = (typeof REPORT_CHANNELS)[number];

export function isReportChannel(value: string): value is ReportChannel {
  return (REPORT_CHANNELS as readonly string[]).includes(value);
}

export interface CodPendingBuckets {
  total: number;
  pending0to7: number;
  pending8to14: number;
  pending15plus: number;
  /** Orders with money still owed by a courier. */
  openOrders: number;
  /** Expected payout across every tracked order (settled or not). */
  expectedTotal: number;
  /** Payout allocations already recorded against those orders. */
  receivedTotal: number;
}

export interface DailySummaryRow {
  reportDate: string;
  channel: string;
  campaign: string;
  placedOrders: number;
  confirmedOrders: number;
  shippedOrders: number;
  deliveredOrders: number;
  refusedOrders: number;
  returnedOrders: number;
  grossSales: number;
  discounts: number;
  netRevenue: number;
  productCost: number;
  outboundCourierCost: number;
  returnCourierCost: number;
  codFees: number;
  adSpend: number;
  grossProfit: number;
  netProfit: number;
  expectedRevenue: number;
  /** Courier profit/loss on partial deliveries, after the courier's charges. */
  partialCourierNet: number;
  /** Full courier cost of refused/returned parcels. */
  refusedCourierCost: number;
}

export interface ChannelBreakdownRow {
  channel: string;
  deliveredOrders: number;
  refusedOrders: number;
  netRevenue: number;
  productCost: number;
  grossProfit: number;
  marginPct: number;
  aov: number;
}

export interface DailyTrendRow {
  date: string;
  deliveredRevenue: number;
  shopRevenue: number;
  netRevenue: number;
  grossProfit: number;
  netProfit: number;
  adSpend: number;
}

export interface ExecutiveKpiSummary {
  realizedRevenue: number;
  prevRealizedRevenue: number;
  deliveredOrders: number;
  prevDeliveredOrders: number;
  grossProfit: number;
  prevGrossProfit: number;
  adSpend: number;
  prevAdSpend: number;
  netProfit: number;
  prevNetProfit: number;
  expectedRevenue: number;
  expectedProfit: number;
  codPending: number;
  codPendingBuckets: Omit<CodPendingBuckets, "expectedTotal" | "receivedTotal">;
  aov: number;
  onlineSharePct: number;
  shopSharePct: number;
  deliveryRatePct: number;
  refusalRatePct: number;
  channelBreakdown: ChannelBreakdownRow[];
  dailyTrends: DailyTrendRow[];
}

export interface ReportBundle {
  rows: DailySummaryRow[];
  kpis: ExecutiveKpiSummary;
}

export interface SyncFailureItem {
  id: string;
  externalId: string;
  source: string;
  apiKeyName: string | null;
  payload: Record<string, unknown>;
  errorMessage: string;
  status: "pending" | "retried" | "resolved";
  retryCount: number;
  createdAt: string;
  resolvedAt?: string;
}
