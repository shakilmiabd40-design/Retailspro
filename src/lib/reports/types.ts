/** Shared report shapes used by both the server aggregators and the client pages. */

import type { OrderStatus } from "@/lib/orders/types";
import type { InventoryStatus } from "@/lib/notifications/types";

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

// ── Order-level reports (Sales & COD, Courier Cost & Profit/Loss) ───────────

export interface SalesCodReportRow {
  orderId: string;
  orderNumber: string;
  /** Business day of the order's Delivered Date, with the YYYY-MM-DD shape. */
  deliveredDay: string;
  /** Business day of the selected date type (drives the trend buckets). */
  reportDay: string;
  customerName: string;
  phone: string;
  expectedCod: number;
  collected: number;
  courier: string;
  courierCost: number;
  /** SettlementLabel, or empty when the order is not part of settlement tracking. */
  settlementStatus: string;
  productSales: number;
  revenue: number;
  deliveryCharge: number;
  difference: number;
}

export interface SalesCodKpis {
  deliveredOrders: number;
  productSales: number;
  grossRevenue: number;
  courierCost: number;
  netRevenue: number;
  deliveryCharge: number;
  expectedCod: number;
  collected: number;
  difference: number;
}

export interface SalesCodReport {
  rows: SalesCodReportRow[];
  kpis: SalesCodKpis;
}

export interface CourierReportRow {
  orderId: string;
  orderNumber: string;
  reportDay: string;
  status: OrderStatus;
  courier: string;
  trackingId: string;
  forwardCost: number;
  returnCost: number;
  otherCost: number;
  actualCost: number;
  /** Customer-paid figure that matters for courier P/L: Partial only; Refuse is 0; Delivered is null. */
  customerPaid: number | null;
  courierNet: number | null;
  profit: number;
  loss: number;
}

export interface CourierKpis {
  forwardCost: number;
  returnCost: number;
  otherCost: number;
  actualCourierCost: number;
  customerPaidPartial: number;
  profit: number;
  loss: number;
  netResult: number;
}

export interface CourierReport {
  rows: CourierReportRow[];
  kpis: CourierKpis;
}

// ── Order Status ────────────────────────────────────────────────────────────

export interface OrderStatusReportRow {
  orderId: string;
  orderNumber: string;
  /** Business day selected by the report's date type (Asia/Dhaka). */
  reportDay: string;
  createdDay: string;
  updatedDay: string;
  status: OrderStatus;
  courier: string;
  trackingId: string;
  customerName: string;
  phone: string;
}

export interface OrderStatusReport {
  /** Every order in the date range. The page applies the status filter to the table
   *  so the distribution and trend keep showing the whole status mix. */
  rows: OrderStatusReportRow[];
}

// ── Product Sales ───────────────────────────────────────────────────────────

export interface ProductSalesReportRow {
  variantId: string;
  productId: string;
  product: string;
  variant: string;
  sku: string;
  category: string;
  brand: string;
  qty: number;
  revenue: number;
  returned: number;
}

export interface ProductSalesKpis {
  qty: number;
  revenue: number;
  returned: number;
  net: number;
}

export interface ProductSalesReport {
  rows: ProductSalesReportRow[];
  kpis: ProductSalesKpis;
}

// ── Purchases ───────────────────────────────────────────────────────────────

export interface PurchaseReportRow {
  poId: string;
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: string;
  /** Business day of the purchase order itself (its PO date). */
  reportDay: string;
  /** Day used for ordering the table: the last receipt in GRN mode, the PO day otherwise. */
  sortDay: string;
  ordered: number;
  received: number;
  pending: number;
  cost: number;
  pendingValue: number;
  receivedInPeriodQty: number;
  receivedInPeriodValue: number;
}

export interface PurchaseGrnRow {
  key: string;
  reportDay: string;
  /** Raw timestamp of the receipt, used to order rows inside one day. */
  occurredAt: string;
  poId: string;
  poNumber: string;
  supplierName: string;
  productName: string;
  color: string;
  size: string;
  sku: string;
  qty: number;
  unitCost: number;
  value: number;
}

export interface PurchaseKpis {
  purchaseOrders: number;
  qtyOrdered: number;
  qtyReceived: number;
  qtyReceivedInPeriod: number;
  totalCost: number;
  pendingQty: number;
  pendingValue: number;
}

export interface PurchaseReport {
  rows: PurchaseReportRow[];
  grn: PurchaseGrnRow[];
  kpis: PurchaseKpis;
}

// ── Suppliers ───────────────────────────────────────────────────────────────

export interface SupplierReportRow {
  id: string;
  name: string;
  poCount: number;
  purchase: number;
  receivedQty: number;
  returnQty: number;
  returnValue: number;
  /** Business day of the last purchase counted for this supplier. */
  lastPurchaseDay: string | null;
}

export interface SupplierKpis {
  totalPurchase: number;
  receivedQty: number;
  returnQty: number;
  returnValue: number;
}

export interface SupplierReport {
  rows: SupplierReportRow[];
  kpis: SupplierKpis;
}

// ── Inventory snapshots ─────────────────────────────────────────────────────

export type StockLabel = "In Stock" | "Low Stock" | "Out of Stock";

export interface InventoryStockRow {
  variantId: string;
  productId: string;
  product: string;
  variant: string;
  sku: string;
  category: string;
  brand: string;
  active: boolean;
  available: number;
  reserved: number;
  onHand: number;
  reorder: number;
  label: StockLabel;
  /** Notification status for this variant, or null when the item is not tracked. */
  alert: InventoryStatus | null;
}

export interface InventoryStockKpis {
  totalVariants: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
}

export interface InventoryStockReport {
  rows: InventoryStockRow[];
  kpis: InventoryStockKpis;
  /** Monitor band: available units at or below this count as Low Stock. */
  lowBand: number;
}

export interface InventoryValueRow {
  variantId: string;
  product: string;
  variant: string;
  sku: string;
  category: string;
  qty: number;
  /** Null when the caller may not see product cost prices. */
  unitCost: number | null;
  /** Null when the caller may not see product cost prices. */
  value: number | null;
  /** Business day of the last delivered sale, or null when never sold. */
  lastSoldDay: string | null;
  dead: boolean;
}

export interface InventoryValueKpis {
  totalQty: number;
  totalValue: number | null;
  deadQty: number;
  deadValue: number | null;
}

export interface InventoryValueReport {
  rows: InventoryValueRow[];
  kpis: InventoryValueKpis;
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
