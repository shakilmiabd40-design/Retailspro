import type { OrderStatus } from "./orders/types";

export type Trend = {
  value: number; // percentage, always positive
  direction: "up" | "down";
};

export type SparkPoint = { label: string; value: number };

/** Time window used by the range tabs on the Top Categories / Top Districts cards. */
export type RangeKey = "all" | "week" | "month";

export type OrdersKpi = {
  /** Orders created in the last 30 days. */
  last30: number;
  /** Orders created in the 30 days before that. */
  prev30: number;
  trend: Trend | null;
  /** Orders per day, last 7 days. */
  sparkline: SparkPoint[];
};

export type CustomersKpi = {
  /** Unique customers (by phone number) across all orders. */
  total: number;
  /** Growth in unique customers over the last 30 days. */
  trend: Trend | null;
  /** Customers whose first order was in the last 30 days. */
  new30: number;
  newTrend: Trend | null;
  oneTimeCount: number;
  repeatCount: number;
  oneTimePct: number;
  repeatPct: number;
};

export type RevenueKpi = {
  /** Delivered product revenue in the last 30 days. */
  last30: number;
  prev30: number;
  trend: Trend | null;
  /** Delivered revenue per day, last 7 days. */
  last7Days: SparkPoint[];
};

export type TopCategory = {
  name: string;
  pct: number;
  units: number;
  color: string;
};

export type OrdersChartPoint = {
  label: string;
  /** Gross revenue: everything the customer paid. */
  income: number;
  /** Gross profit = gross revenue − product cost. */
  profit: number;
  /** Net profit = gross profit − courier & other cost. */
  netProfit: number;
};

export type DistrictShare = {
  label: string;
  pct: number;
  count: number;
};

export type ProductSalesRow = {
  id: string;
  name: string;
  imageUrl?: string;
  /** null when the product no longer exists in the catalogue. */
  stock: number | null;
  /** Regular price, only set when a discount price exists. */
  oldPrice: number | null;
  salePrice: number;
  discountPct: number;
  itemsSold: number;
  /** false when the product has been deleted from the catalogue. */
  exists: boolean;
};

export type RecentOrderRow = {
  id: string;
  orderNumber: string;
  customerName: string;
  amount: number;
  status: OrderStatus;
  createdAt: string;
};

export type DashboardData = {
  orders: OrdersKpi;
  customers: CustomersKpi;
  revenue: RevenueKpi;
  topCategories: Record<RangeKey, TopCategory[]>;
  salesChart: OrdersChartPoint[];
  topDistricts: Record<RangeKey, DistrictShare[]>;
  products: ProductSalesRow[];
  recentOrders: RecentOrderRow[];
};
