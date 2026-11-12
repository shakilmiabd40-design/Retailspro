import "server-only";
import { findDataset, type QueryRequest, type QueryResult, type QueryResultRow } from "@/lib/reports/query-builder";
import { query } from "@/server/db";

/**
 * Runs a report-builder request.
 *
 * Every piece of SQL below is fixed and named — the request only chooses which
 * of these expressions to use. Values always travel as parameters, so nothing
 * from the browser is ever pasted into a query string.
 */

/** Channel attribution — the same rules the Owner Dashboard uses. */
const CHANNEL = `case
  when coalesce(o.data->>'source', '') = 'pos' then 'shop'
  when coalesce(o.data->>'source', '') = 'api' then 'website'
  when coalesce(o.data->>'source', '') in ('website', 'facebook', 'instagram', 'shop') then o.data->>'source'
  when coalesce(o.data->>'channel', '') <> '' then 'website'
  else 'unattributed'
end`;

/** The day an order counts on — the same rule the ledger postings use. */
const ORDER_DAY = `coalesce(nullif(o.data #>> '{delivery,deliveryDate}',''), left(o.data->>'createdAt',10))`;

/** Courier money on a delivered, partly delivered or refused parcel. */
const COURIER_COST = `case when o.data->>'status' in ('delivered','partial_delivered','refuse_return')
  then coalesce((o.data #>> '{courier,forwardCost}')::numeric,0)
     + coalesce((o.data #>> '{courier,returnCost}')::numeric,0)
     + coalesce((o.data #>> '{courier,otherCost}')::numeric,0)
  else 0 end`;

interface DatasetSql {
  /** The collection this dataset reads — always filtered, never assumed. */
  collection: string;
  /** The FROM part; the record is aliased `o`. */
  from: string;
  /** Expressions for the group-by dimension. */
  dimensions: Record<string, string>;
  /** Expressions for the measure. */
  measures: Record<string, string>;
  /** Measures that are already an aggregate — used as they are, never wrapped again. */
  aggregateMeasures: string[];
  /** How many records one row represents. */
  recordsExpr: string;
  /** Which date field the range applies to. */
  dayExpr: string;
}

const DATASETS: Record<string, DatasetSql> = {
  orders: {
    collection: 'orders',
    from: `app_records o
      left join lateral (
        select
          sum(case when o.data->>'status' = 'delivered' then coalesce((i->>'price')::numeric,0)*coalesce((i->>'qty')::numeric,0) - coalesce((i->>'discount')::numeric,0) else 0 end) as product_sales,
          sum(case when o.data->>'status' = 'delivered' then coalesce((i->>'qty')::numeric,0) else 0 end) as items,
          sum(case when o.data->>'status' = 'delivered' then coalesce(vc.unit_cost,0)*coalesce((i->>'qty')::numeric,0) else 0 end) as product_cost
        from jsonb_array_elements(coalesce(o.data->'items','[]'::jsonb)) i
        left join lateral (
          select coalesce((v->>'cost')::numeric,(pr.data->>'costPrice')::numeric,0) as unit_cost
          from app_records pr, jsonb_array_elements(coalesce(pr.data->'variants','[]'::jsonb)) v
          where pr.collection='products' and v->>'id' = i->>'variantId'
          limit 1
        ) vc on true
      ) l on true`,
    dimensions: {
      channel: CHANNEL,
      status: `o.data->>'status'`,
      courier: `coalesce(nullif(o.data #>> '{courier,company}',''),'—')`,
      district: `coalesce(nullif(o.data->>'district',''),'unspecified')`,
      customerName: `coalesce(nullif(o.data->>'customerName',''),'—')`,
      day: `left(o.data->>'createdAt',10)`,
      month: `left(o.data->>'createdAt',7)`,
    },
    measures: {
      orders: `1`,
      items: `coalesce(l.items,0)`,
      productSales: `coalesce(l.product_sales,0)`,
      productCost: `coalesce(l.product_cost,0)`,
      deliveryCharge: `case when o.data->>'status' = 'delivered' then coalesce((o.data->>'deliveryCharge')::numeric,0) else 0 end`,
      courierCost: COURIER_COST,
      netRevenue: `case when o.data->>'status' = 'delivered' then coalesce((o.data->>'deliveryCharge')::numeric,0) else 0 end + coalesce(l.product_sales,0) - ${COURIER_COST}`,
    },
    aggregateMeasures: ["orders"],
    recordsExpr: `count(*)`,
    dayExpr: ORDER_DAY,
  },

  products: {
    collection: 'products',
    from: `app_records o
      cross join lateral jsonb_array_elements(coalesce(o.data->'variants','[]'::jsonb)) v`,
    dimensions: {
      category: `coalesce(nullif(o.data->>'category',''),'Uncategorized')`,
      brand: `coalesce(nullif(o.data->>'brand',''),'—')`,
      status: `o.data->>'status'`,
      name: `coalesce(nullif(o.data->>'name',''),'—')`,
    },
    measures: {
      variants: `1`,
      stock: `coalesce((v->>'stock')::numeric,0)`,
      cost: `coalesce((v->>'cost')::numeric,0)`,
      price: `coalesce((v->>'price')::numeric,0)`,
      stockValue: `coalesce((v->>'stock')::numeric,0) * coalesce((v->>'cost')::numeric,0)`,
    },
    aggregateMeasures: ["variants"],
    recordsExpr: `count(*)`,
    dayExpr: `left(o.data->>'createdAt',10)`,
  },

  "purchase-orders": {
    collection: 'purchase_orders',
    from: `app_records o
      left join lateral (
        select
          sum(coalesce((i->>'qtyOrdered')::numeric,0)) as qty_ordered,
          sum(coalesce((i->>'qtyReceived')::numeric,0)) as qty_received,
          sum(greatest(0, coalesce((i->>'qtyOrdered')::numeric,0) - coalesce((i->>'qtyReceived')::numeric,0))) as pending_qty,
          sum(coalesce((i->>'qtyOrdered')::numeric,0) * coalesce((i->>'unitCost')::numeric,0)) as cost,
          sum(greatest(0, coalesce((i->>'qtyOrdered')::numeric,0) - coalesce((i->>'qtyReceived')::numeric,0)) * coalesce((i->>'unitCost')::numeric,0)) as pending_value
        from jsonb_array_elements(coalesce(o.data->'items','[]'::jsonb)) i
      ) l on true`,
    dimensions: {
      supplier: `coalesce(nullif(o.data->>'supplierId',''),'—')`,
      status: `o.data->>'status'`,
      month: `left(coalesce(nullif(o.data->>'poDate',''), o.data->>'createdAt'),7)`,
      day: `left(coalesce(nullif(o.data->>'poDate',''), o.data->>'createdAt'),10)`,
    },
    measures: {
      purchaseOrders: `1`,
      qtyOrdered: `coalesce(l.qty_ordered,0)`,
      qtyReceived: `coalesce(l.qty_received,0)`,
      pendingQty: `coalesce(l.pending_qty,0)`,
      cost: `coalesce(l.cost,0)`,
      pendingValue: `coalesce(l.pending_value,0)`,
    },
    aggregateMeasures: ["purchaseOrders"],
    recordsExpr: `count(*)`,
    dayExpr: `left(coalesce(nullif(o.data->>'poDate',''), o.data->>'createdAt'),10)`,
  },

  returns: {
    collection: 'returns',
    from: `app_records o
      cross join lateral jsonb_array_elements(coalesce(o.data->'items','[]'::jsonb)) i
      left join lateral (
        select coalesce((v->>'cost')::numeric,(pr.data->>'costPrice')::numeric,0) as unit_cost
        from app_records pr, jsonb_array_elements(coalesce(pr.data->'variants','[]'::jsonb)) v
        where pr.collection='products' and v->>'id' = i->>'variantId'
        limit 1
      ) vc on true`,
    dimensions: {
      type: `coalesce(nullif(o.data->>'type',''),'—')`,
      status: `coalesce(nullif(o.data->>'status',''),'—')`,
      reason: `coalesce(nullif(i->>'reason',''),'—')`,
      party: `coalesce(nullif(o.data->>'partyName',''),'—')`,
      month: `left(o.data->>'createdAt',7)`,
      day: `left(o.data->>'createdAt',10)`,
    },
    measures: {
      returns: `1`,
      qty: `coalesce((i->>'qty')::numeric,0)`,
      value: `coalesce((i->>'qty')::numeric,0) * coalesce(vc.unit_cost,0)`,
    },
    aggregateMeasures: ["returns"],
    recordsExpr: `count(distinct o.id)`,
    dayExpr: `left(o.data->>'createdAt',10)`,
  },
};

export async function runQuery(request: QueryRequest): Promise<QueryResult> {
  const dataset = DATASETS[request.dataset];
  const meta = findDataset(request.dataset);
  if (!dataset || !meta) throw new Error("Unknown dataset.");

  const dimensionExpr = dataset.dimensions[request.dimension] ?? dataset.dimensions[meta.defaultDimension];
  const measureExpr = dataset.measures[request.measure] ?? dataset.measures[meta.defaultMeasure];

  const values: unknown[] = [];
  const whereParts: string[] = [];

  // Which collection this dataset reads — always stated, never assumed.
  whereParts.push(`o.collection = $${values.push(dataset.collection)}`);

  // The dataset's own filters — each one is a fixed expression with the value
  // travelling as a parameter.
  for (const filter of meta.filters) {
    const value = request.filters[filter.key];
    if (!value || value === "all") continue;
    if (filter.key === "channel" && request.dataset === "orders") {
      whereParts.push(`${CHANNEL} = $${values.push(value)}`);
    } else if (filter.key === "courier" && request.dataset === "orders") {
      whereParts.push(
        value === "Other"
          ? `coalesce(o.data #>> '{courier,company}','') not in ('Steadfast','Pathao','RedX')`
          : `coalesce(o.data #>> '{courier,company}','') = $${values.push(value)}`,
      );
    } else if (filter.key === "status" && request.dataset === "products") {
      whereParts.push(`o.data->>'status' = $${values.push(value)}`);
    } else if (filter.key === "status" && request.dataset === "purchase-orders") {
      whereParts.push(`o.data->>'status' = $${values.push(value)}`);
    } else if (filter.key === "type" && request.dataset === "returns") {
      whereParts.push(`o.data->>'type' = $${values.push(value)}`);
    } else if (filter.key === "status" && request.dataset === "orders") {
      whereParts.push(`o.data->>'status' = $${values.push(value)}`);
    }
  }

  // The date range.
  whereParts.push(`${dataset.dayExpr} >= $${values.push(request.from)}`);
  whereParts.push(`${dataset.dayExpr} <= $${values.push(request.to)}`);

  const isAggregateMeasure = dataset.aggregateMeasures.includes(request.measure);
  const aggregate = isAggregateMeasure
    ? measureExpr
    : request.aggregation === "count"
      ? "count(*)"
      : request.aggregation === "average"
        ? `avg(${measureExpr})`
        : request.aggregation === "min"
          ? `min(${measureExpr})`
          : request.aggregation === "max"
            ? `max(${measureExpr})`
            : `sum(${measureExpr})`;

  const where = whereParts.join(" and ");
  const { rows } = await query<{ group: string | null; value: string; records: string }>(
    `select ${dimensionExpr} as "group", coalesce(${aggregate},0)::text as value, ${dataset.recordsExpr}::text as records
       from ${dataset.from}
      where ${where}
      group by 1
      order by 2 desc
      limit 500`,
    values,
  );

  const counted = await query<{ n: string }>(
    `select ${dataset.recordsExpr}::text as n from ${dataset.from} where ${where}`,
    values,
  );

  const resultRows: QueryResultRow[] = rows.map((row) => ({
    group: row.group ?? "—",
    value: Number(row.value) || 0,
    records: Number(row.records) || 0,
  }));

  return {
    dataset: request.dataset,
    dimension: request.dimension,
    measure: request.measure,
    aggregation: request.aggregation,
    rows: resultRows,
    total: Number(counted.rows[0]?.n ?? 0) || 0,
  };
}
