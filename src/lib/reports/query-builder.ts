/**
 * The report builder — an ad-hoc question you ask of your own data.
 *
 * Like the pivot/analysis views in the big ERPs: you pick a dataset, a dimension
 * to group by and a measure to total. Nothing here accepts free-form SQL — every
 * dataset, field, dimension and measure is a fixed, named entry, so a query can
 * never reach anything it should not.
 */

export type QueryFieldType = "text" | "number" | "money" | "date";

export interface QueryField {
  key: string;
  label: string;
  type: QueryFieldType;
  /** Can the field be totalled (sum / average / min / max)? */
  aggregatable?: boolean;
  /** Can the field be grouped by? */
  groupable?: boolean;
}

export interface QueryDataset {
  key: string;
  label: string;
  description: string;
  /** What the measure adds up when no aggregation is chosen. */
  defaultMeasure: string;
  defaultDimension: string;
  fields: QueryField[];
  dimensions: QueryField[];
  /** Filters this dataset understands (beyond the date range). */
  filters: { key: string; label: string; values: string[] }[];
}

const ORDER_STATUSES = ["pending", "processing", "in_transit", "delivered", "partial_delivered", "refuse_return", "cancelled"];
const CHANNELS = ["website", "facebook", "instagram", "shop", "unattributed"];
const COURIERS = ["Steadfast", "Pathao", "RedX", "Other"];
const PO_STATUSES = ["draft", "approved", "sent", "partially_received", "received", "cancelled"];

export const QUERY_DATASETS: QueryDataset[] = [
  {
    key: "orders",
    label: "Orders",
    description: "Every order, with its sales, cost and courier money.",
    defaultMeasure: "netRevenue",
    defaultDimension: "channel",
    fields: [
      { key: "orderNumber", label: "Order number", type: "text", groupable: true },
      { key: "customerName", label: "Customer", type: "text", groupable: true },
      { key: "status", label: "Status", type: "text", groupable: true },
      { key: "channel", label: "Channel", type: "text", groupable: true },
      { key: "courier", label: "Courier", type: "text", groupable: true },
      { key: "district", label: "District", type: "text", groupable: true },
      { key: "createdAt", label: "Created", type: "date", groupable: true },
      { key: "items", label: "Items", type: "number", aggregatable: true },
      { key: "productSales", label: "Product sales", type: "money", aggregatable: true },
      { key: "productCost", label: "Product cost", type: "money", aggregatable: true },
      { key: "deliveryCharge", label: "Delivery charge", type: "money", aggregatable: true },
      { key: "courierCost", label: "Courier cost", type: "money", aggregatable: true },
      { key: "netRevenue", label: "Net revenue", type: "money", aggregatable: true },
    ],
    dimensions: [
      { key: "channel", label: "Channel", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "courier", label: "Courier", type: "text" },
      { key: "district", label: "District", type: "text" },
      { key: "customerName", label: "Customer", type: "text" },
      { key: "day", label: "Day", type: "date" },
      { key: "month", label: "Month", type: "date" },
    ],
    filters: [
      { key: "status", label: "Status", values: ORDER_STATUSES },
      { key: "channel", label: "Channel", values: CHANNELS },
      { key: "courier", label: "Courier", values: COURIERS },
    ],
  },
  {
    key: "products",
    label: "Products",
    description: "Your catalog — what you hold, what it cost and what it sells for.",
    defaultMeasure: "stockValue",
    defaultDimension: "category",
    fields: [
      { key: "name", label: "Product", type: "text", groupable: true },
      { key: "sku", label: "SKU", type: "text", groupable: true },
      { key: "category", label: "Category", type: "text", groupable: true },
      { key: "brand", label: "Brand", type: "text", groupable: true },
      { key: "status", label: "Status", type: "text", groupable: true },
      { key: "variants", label: "Variants", type: "number", aggregatable: true },
      { key: "stock", label: "Stock on hand", type: "number", aggregatable: true },
      { key: "cost", label: "Cost price", type: "money", aggregatable: true },
      { key: "price", label: "Selling price", type: "number", aggregatable: true },
      { key: "stockValue", label: "Stock value", type: "money", aggregatable: true },
    ],
    dimensions: [
      { key: "category", label: "Category", type: "text" },
      { key: "brand", label: "Brand", type: "text" },
      { key: "status", label: "Status", type: "text" },
    ],
    filters: [{ key: "status", label: "Status", values: ["active", "inactive"] }],
  },
  {
    key: "purchase-orders",
    label: "Purchase orders",
    description: "What you ordered from suppliers, and how much arrived.",
    defaultMeasure: "cost",
    defaultDimension: "supplier",
    fields: [
      { key: "poNumber", label: "PO number", type: "text", groupable: true },
      { key: "supplier", label: "Supplier", type: "text", groupable: true },
      { key: "status", label: "Status", type: "text", groupable: true },
      { key: "poDate", label: "PO date", type: "date", groupable: true },
      { key: "qtyOrdered", label: "Qty ordered", type: "number", aggregatable: true },
      { key: "qtyReceived", label: "Qty received", type: "number", aggregatable: true },
      { key: "pendingQty", label: "Qty pending", type: "number", aggregatable: true },
      { key: "cost", label: "Purchase cost", type: "money", aggregatable: true },
      { key: "pendingValue", label: "Pending value", type: "money", aggregatable: true },
    ],
    dimensions: [
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "month", label: "Month", type: "date" },
      { key: "day", label: "Day", type: "date" },
    ],
    filters: [{ key: "status", label: "Status", values: PO_STATUSES }],
  },
  {
    key: "returns",
    label: "Returns",
    description: "Everything that came back — from customers and from suppliers.",
    defaultMeasure: "qty",
    defaultDimension: "type",
    fields: [
      { key: "returnNumber", label: "Return number", type: "text", groupable: true },
      { key: "type", label: "Type", type: "text", groupable: true },
      { key: "status", label: "Status", type: "text", groupable: true },
      { key: "party", label: "Customer / supplier", type: "text", groupable: true },
      { key: "reason", label: "Reason", type: "text", groupable: true },
      { key: "createdAt", label: "Raised", type: "date", groupable: true },
      { key: "qty", label: "Units", type: "number", aggregatable: true },
      { key: "value", label: "Value", type: "money", aggregatable: true },
    ],
    dimensions: [
      { key: "type", label: "Type", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "reason", label: "Reason", type: "text" },
      { key: "month", label: "Month", type: "date" },
      { key: "day", label: "Day", type: "date" },
    ],
    filters: [{ key: "type", label: "Type", values: ["customer", "supplier"] }],
  },
];

export type QueryAggregation = "sum" | "count" | "average" | "min" | "max";

export const QUERY_AGGREGATIONS: { key: QueryAggregation; label: string }[] = [
  { key: "sum", label: "Total" },
  { key: "count", label: "Number of records" },
  { key: "average", label: "Average" },
  { key: "min", label: "Smallest" },
  { key: "max", label: "Largest" },
];

export interface QueryRequest {
  dataset: string;
  dimension: string;
  measure: string;
  aggregation: QueryAggregation;
  from: string;
  to: string;
  /** Optional filters: field key → chosen value ("all" for none). */
  filters: Record<string, string>;
}

export function findDataset(key: string): QueryDataset | undefined {
  return QUERY_DATASETS.find((dataset) => dataset.key === key);
}

/**
 * Validates a request against the catalogue. Anything unknown is dropped, so a
 * hand-made request can only ever ask for something the catalogue already lists.
 */
export function normaliseQueryRequest(raw: Partial<QueryRequest> | null | undefined): QueryRequest | null {
  const dataset = findDataset(raw?.dataset ?? "");
  if (!dataset) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw?.from ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(raw?.to ?? "")) return null;
  if ((raw?.from ?? "") > (raw?.to ?? "")) return null;

  const dimension = dataset.dimensions.some((d) => d.key === raw?.dimension) ? raw!.dimension! : dataset.defaultDimension;
  const measureField = dataset.fields.find((f) => f.key === raw?.measure);
  const measure = measureField?.aggregatable ? raw!.measure! : dataset.defaultMeasure;
  const aggregation = (QUERY_AGGREGATIONS.some((a) => a.key === raw?.aggregation) ? raw!.aggregation : "sum") as QueryAggregation;

  const filters: Record<string, string> = {};
  for (const filter of dataset.filters) {
    const value = raw?.filters?.[filter.key];
    if (value && value !== "all" && filter.values.includes(value)) filters[filter.key] = value;
  }

  return { dataset: dataset.key, dimension, measure, aggregation, from: raw!.from!, to: raw!.to!, filters };
}

export interface QueryResultRow {
  group: string;
  value: number;
  records: number;
}

export interface QueryResult {
  dataset: string;
  dimension: string;
  measure: string;
  aggregation: QueryAggregation;
  rows: QueryResultRow[];
  /** How many records matched before grouping. */
  total: number;
}
