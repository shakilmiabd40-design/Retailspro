import "server-only";
import { query } from "@/server/db";
import { RevisionCache, revisionKey } from "@/server/revision-cache";
import { previousPeriodRange } from "@/lib/reports/period";
import { isReportChannel, type ReportChannel } from "@/lib/reports/types";
import type {
  ChannelBreakdownRow,
  CodPendingBuckets,
  DailySummaryRow,
  DailyTrendRow,
  ExecutiveKpiSummary,
  ReportBundle,
} from "@/lib/reports/types";
import type { Order } from "@/lib/orders/types";
import type { SettlementMode } from "@/lib/settings/types";
import { computeCodPending, type CodOrderInput, type CodSettings } from "./cod";
import { dhakaDay, REPORT_TIME_ZONE } from "./business-day";

export { dhakaDay, REPORT_TIME_ZONE } from "./business-day";

export type {
  ChannelBreakdownRow,
  CodPendingBuckets,
  DailySummaryRow,
  DailyTrendRow,
  ExecutiveKpiSummary,
  ReportBundle,
} from "@/lib/reports/types";
export { isReportChannel, type ReportChannel } from "@/lib/reports/types";

// ── SQL fragments ──────────────────────────────────────────────────────────

/**
 * Channel attribution rules:
 *  - `pos` is the legacy POS marker; `api` is the legacy public-API marker.
 *  - An order that only has an API `channel` (key name) came through the online store.
 *  - Older orders with neither a source nor a channel are reported as `unattributed`
 *    instead of being guessed as website sales.
 */
function channelExpr(alias: string): string {
  return `case
    when coalesce(${alias}.data->>'source', '') = 'pos' then 'shop'
    when coalesce(${alias}.data->>'source', '') = 'api' then 'website'
    when coalesce(${alias}.data->>'source', '') in ('website', 'facebook', 'instagram', 'shop') then ${alias}.data->>'source'
    when coalesce(${alias}.data->>'channel', '') <> '' then 'website'
    else 'unattributed'
  end`;
}

/**
 * Turns a stored date/time text into a business-day date.
 *  - A plain YYYY-MM-DD is already a calendar day, so it is never shifted.
 *  - A full timestamp is an instant and is converted to Asia/Dhaka before taking the day.
 */
function dayExpr(value: string): string {
  return `case
    when (${value}) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (${value})::date
    when (${value}) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ]' then ((${value})::timestamptz at time zone '${REPORT_TIME_ZONE}')::date
    else null
  end`;
}

/** Latest activity timestamp for a label, matching the client's deliveredDate/finalStatusDate helpers. */
function lastActivityAt(label: string): string {
  return `(select a.value->>'at'
             from jsonb_array_elements(coalesce(o.data->'activity', '[]'::jsonb)) with ordinality as a(value, ord)
            where a.value->>'label' = '${label}'
            order by a.ord desc limit 1)`;
}

/** Super Admin edits don't write a "Marked …" activity; the change line carries the new status. */
function editedIntoAt(statusLabel: string): string {
  return `(select a.value->>'at'
             from jsonb_array_elements(coalesce(o.data->'activity', '[]'::jsonb)) with ordinality as a(value, ord)
            where a.value->>'label' = 'Edited by Super Admin'
              and coalesce(a.value->>'detail', '') like '%→ ${statusLabel}%'
            order by a.ord desc limit 1)`;
}

function itemsSum(alias: string, expression: string): string {
  return `coalesce((select sum(${expression})
                      from jsonb_array_elements(coalesce(${alias}.data->'items', '[]'::jsonb)) i), 0)`;
}

function ordersCte(): string {
  return `
    variant_costs as (
      select
        p.id as product_id,
        v->>'id' as variant_id,
        coalesce((v->>'cost')::numeric, (p.data->>'costPrice')::numeric, 0) as unit_cost
      from app_records p,
           jsonb_array_elements(coalesce(p.data->'variants', '[]'::jsonb)) v
      where p.collection = 'products'
    ),
    order_lines_cost as (
      select
        o.id as order_id,
        sum(coalesce(vc.unit_cost, 0) * coalesce((item->>'qty')::numeric, 0)) as total_cogs
      from app_records o,
           jsonb_array_elements(coalesce(o.data->'items', '[]'::jsonb)) item
      left join variant_costs vc
        on vc.product_id = item->>'productId'
       and (vc.variant_id = item->>'variantId' or vc.variant_id = item->>'id')
      where o.collection = 'orders'
      group by o.id
    ),
    orders_scored as (
      select
        o.id,
        o.data->>'status' as status,
        ${channelExpr("o")} as channel,
        coalesce(nullif(o.data #>> '{utm,campaign}', ''), 'unattributed') as campaign,
        coalesce(
          nullif(o.data #>> '{delivery,deliveryDate}', ''),
          ${lastActivityAt("Marked Delivered")},
          ${editedIntoAt("Delivered")},
          o.data->>'updatedAt'
        ) as delivered_at,
        coalesce(
          ${lastActivityAt("Marked Partial Delivered")},
          ${editedIntoAt("Partial Delivered")},
          nullif(o.data #>> '{delivery,deliveryDate}', ''),
          o.data->>'updatedAt'
        ) as partial_at,
        coalesce(
          ${lastActivityAt("Marked Refuse Return")},
          ${editedIntoAt("Refuse Return")},
          nullif(o.data #>> '{delivery,deliveryDate}', ''),
          o.data->>'updatedAt'
        ) as refused_at,
        o.data->>'createdAt' as created_at,
        ${itemsSum("o", "(i->>'price')::numeric * coalesce((i->>'qty')::numeric, 0)")} as subtotal,
        ${itemsSum("o", "(i->>'discount')::numeric")} as discount,
        coalesce((o.data->>'deliveryCharge')::numeric, 0) as delivery_charge,
        coalesce((o.data #>> '{courier,forwardCost}')::numeric, 0) as forward_cost,
        coalesce((o.data #>> '{courier,returnCost}')::numeric, 0) as return_cost,
        coalesce((o.data #>> '{courier,otherCost}')::numeric, 0) as other_cost,
        coalesce((o.data #>> '{courier,codFee}')::numeric, 0) as cod_fee,
        coalesce((o.data #>> '{delivery,customerPaid}')::numeric, 0) as customer_paid,
        coalesce(olc.total_cogs, 0) as cogs
      from app_records o
      left join order_lines_cost olc on olc.order_id = o.id
      where o.collection = 'orders'
    ),
    orders_dated as (
      select
        orders_scored.*,
        case
          when status = 'delivered' then ${dayExpr("delivered_at")}
          when status = 'partial_delivered' then ${dayExpr("partial_at")}
          when status = 'refuse_return' then ${dayExpr("refused_at")}
          else null
        end as report_day,
        ${dayExpr("created_at")} as created_day
      from orders_scored
    )`;
}

// ── Row loading ────────────────────────────────────────────────────────────

interface RawSummaryRow {
  report_date: string | null;
  channel: string;
  campaign: string;
  placed_orders: string | number;
  delivered_orders: string | number;
  refused_orders: string | number;
  gross_sales: string | number;
  discounts: string | number;
  net_revenue: string | number;
  product_cost: string | number;
  outbound_courier_cost: string | number;
  return_courier_cost: string | number;
  cod_fees: string | number;
  partial_courier_net: string | number;
  refused_courier_cost: string | number;
}

const num = (value: string | number | null | undefined) => Number(value ?? 0);

async function loadRows(from: string, to: string, channel: ReportChannel): Promise<DailySummaryRow[]> {
  const posAllowed = channel === "all" || channel === "shop";
  const posDay = dayExpr("inv.data->>'createdAt'");
  const returnDay = dayExpr("r.data->>'createdAt'");

  const sql = `
    with ${ordersCte()},
    realized_agg as (
      select
        report_day as report_date,
        channel,
        campaign,
        count(*) filter (where status = 'delivered') as delivered_orders,
        count(*) filter (where status = 'refuse_return') as refused_orders,
        sum(case when status = 'delivered' then subtotal else 0 end) as gross_sales,
        sum(case when status = 'delivered' then discount else 0 end) as discounts,
        sum(case when status = 'delivered'
                 then subtotal - discount + delivery_charge - (forward_cost + return_cost + other_cost)
                 else 0 end) as net_revenue,
        sum(case when status = 'delivered' then cogs else 0 end) as product_cost,
        sum(case when status = 'delivered' then forward_cost else 0 end) as outbound_courier_cost,
        sum(case when status = 'delivered' then return_cost + other_cost else 0 end) as return_courier_cost,
        sum(case when status = 'delivered' then cod_fee else 0 end) as cod_fees,
        sum(case when status = 'partial_delivered'
                 then customer_paid - (forward_cost + return_cost + other_cost)
                 else 0 end) as partial_courier_net,
        sum(case when status = 'refuse_return'
                 then forward_cost + return_cost + other_cost
                 else 0 end) as refused_courier_cost
      from orders_dated
      where status in ('delivered', 'partial_delivered', 'refuse_return')
        and report_day between $1::date and $2::date
        and ($3 = 'all' or channel = $3)
      group by report_day, channel, campaign
    ),
    placed_agg as (
      select created_day as report_date, channel, campaign, count(*) as placed_orders
      from orders_dated
      where created_day between $1::date and $2::date
        and ($3 = 'all' or channel = $3)
      group by created_day, channel, campaign
    ),
    pos_sales_agg as (
      select
        ${posDay} as report_date,
        'shop' as channel,
        'walk-in' as campaign,
        count(*) as delivered_orders,
        sum(coalesce((inv.data->>'subtotal')::numeric, 0)
          + coalesce((inv.data->>'vat')::numeric, 0)
          + coalesce((inv.data->>'deliveryCharge')::numeric, 0)) as gross_sales,
        sum(coalesce((inv.data->>'itemDiscount')::numeric, 0) + coalesce((inv.data->>'cartDiscount')::numeric, 0)) as discounts,
        sum(coalesce((inv.data->>'total')::numeric, 0)) as net_revenue,
        sum((
          select coalesce(sum(coalesce((item->>'cost')::numeric, 0) * coalesce((item->>'qty')::numeric, 0)), 0)
          from jsonb_array_elements(coalesce(inv.data->'items', '[]'::jsonb)) item
        )) as product_cost,
        0::numeric as outbound_courier_cost,
        0::numeric as return_courier_cost,
        0::numeric as cod_fees,
        0::numeric as partial_courier_net,
        0::numeric as refused_courier_cost
      from app_records inv
      where inv.collection = 'pos_invoices'
        and inv.data->>'saleType' = 'walk_in'
        and inv.data->>'status' = 'completed'
        and $4::boolean
        and ${posDay} between $1::date and $2::date
      group by ${posDay}
    ),
    pos_returns_agg as (
      select
        ${returnDay} as report_date,
        -coalesce(sum((r.data->>'creditValue')::numeric), 0) as net_revenue
      from app_records r
      where r.collection = 'pos_returns'
        and $4::boolean
        and ${returnDay} between $1::date and $2::date
      group by ${returnDay}
    ),
    unioned as (
      select report_date, channel, campaign,
        placed_orders, 0::bigint as delivered_orders, 0::bigint as refused_orders,
        0::numeric as gross_sales, 0::numeric as discounts, 0::numeric as net_revenue,
        0::numeric as product_cost, 0::numeric as outbound_courier_cost, 0::numeric as return_courier_cost,
        0::numeric as cod_fees, 0::numeric as partial_courier_net, 0::numeric as refused_courier_cost
      from placed_agg
      union all
      select report_date, channel, campaign,
        0::bigint, delivered_orders, refused_orders,
        gross_sales, discounts, net_revenue, product_cost, outbound_courier_cost, return_courier_cost,
        cod_fees, partial_courier_net, refused_courier_cost
      from realized_agg
      union all
      select report_date, channel, campaign,
        0::bigint, delivered_orders, 0::bigint,
        gross_sales, discounts, net_revenue, product_cost, 0, 0, 0, 0, 0
      from pos_sales_agg
      union all
      select report_date, 'shop', 'walk-in',
        0::bigint, 0::bigint, 0::bigint,
        0, 0, net_revenue, 0, 0, 0, 0, 0, 0
      from pos_returns_agg
    )
    select
      report_date::text as report_date,
      channel,
      campaign,
      sum(placed_orders) as placed_orders,
      sum(delivered_orders) as delivered_orders,
      sum(refused_orders) as refused_orders,
      sum(gross_sales) as gross_sales,
      sum(discounts) as discounts,
      sum(net_revenue) as net_revenue,
      sum(product_cost) as product_cost,
      sum(outbound_courier_cost) as outbound_courier_cost,
      sum(return_courier_cost) as return_courier_cost,
      sum(cod_fees) as cod_fees,
      sum(partial_courier_net) as partial_courier_net,
      sum(refused_courier_cost) as refused_courier_cost
    from unioned
    where report_date is not null
    group by report_date, channel, campaign
    order by report_date desc, net_revenue desc
  `;

  const { rows } = await query<RawSummaryRow>(sql, [from, to, channel, posAllowed]);

  return rows.map((r) => {
    const grossSales = num(r.gross_sales);
    const discounts = num(r.discounts);
    const netRevenue = num(r.net_revenue);
    const productCost = num(r.product_cost);
    const outboundCourierCost = num(r.outbound_courier_cost);
    const returnCourierCost = num(r.return_courier_cost);
    const codFees = num(r.cod_fees);
    const partialCourierNet = num(r.partial_courier_net);
    const refusedCourierCost = num(r.refused_courier_cost);

    const grossProfit = netRevenue - productCost;
    // Ad spend is a period-level cost (it can't be split cleanly across channels),
    // so it is deducted once in the KPI totals and daily trend, not per row.
    const netProfit = grossProfit + partialCourierNet - refusedCourierCost - codFees;

    return {
      reportDate: r.report_date ?? "",
      channel: r.channel,
      campaign: r.campaign,
      placedOrders: num(r.placed_orders),
      confirmedOrders: 0,
      shippedOrders: 0,
      deliveredOrders: num(r.delivered_orders),
      refusedOrders: num(r.refused_orders),
      returnedOrders: 0,
      grossSales,
      discounts,
      netRevenue,
      productCost,
      outboundCourierCost,
      returnCourierCost,
      codFees,
      adSpend: 0,
      grossProfit,
      netProfit,
      expectedRevenue: 0,
      partialCourierNet,
      refusedCourierCost,
    };
  });
}

// ── Pipeline (open orders) ─────────────────────────────────────────────────

interface PipelineTotal {
  revenue: number;
  cogs: number;
}

async function loadPipeline(channel: ReportChannel): Promise<PipelineTotal> {
  const sql = `
    with variant_costs as (
      select
        p.id as product_id,
        v->>'id' as variant_id,
        coalesce((v->>'cost')::numeric, (p.data->>'costPrice')::numeric, 0) as unit_cost
      from app_records p,
           jsonb_array_elements(coalesce(p.data->'variants', '[]'::jsonb)) v
      where p.collection = 'products'
    ),
    order_lines_cost as (
      select
        o.id as order_id,
        sum(coalesce(vc.unit_cost, 0) * coalesce((item->>'qty')::numeric, 0)) as total_cogs
      from app_records o,
           jsonb_array_elements(coalesce(o.data->'items', '[]'::jsonb)) item
      left join variant_costs vc
        on vc.product_id = item->>'productId'
       and (vc.variant_id = item->>'variantId' or vc.variant_id = item->>'id')
      where o.collection = 'orders'
      group by o.id
    ),
    open_orders as (
      select
        ${channelExpr("o")} as channel,
        ${itemsSum("o", "(i->>'price')::numeric * coalesce((i->>'qty')::numeric, 0)")} as subtotal,
        ${itemsSum("o", "(i->>'discount')::numeric")} as discount,
        coalesce((o.data->>'deliveryCharge')::numeric, 0) as delivery_charge,
        coalesce(olc.total_cogs, 0) as cogs
      from app_records o
      left join order_lines_cost olc on olc.order_id = o.id
      where o.collection = 'orders'
        and o.data->>'status' in ('pending', 'processing', 'in_transit')
    )
    select
      coalesce(sum(subtotal - discount + delivery_charge), 0)::text as revenue,
      coalesce(sum(cogs), 0)::text as cogs
    from open_orders
    where ($1 = 'all' or channel = $1)
  `;

  const { rows } = await query<{ revenue: string; cogs: string }>(sql, [channel]);
  return { revenue: num(rows[0]?.revenue), cogs: num(rows[0]?.cogs) };
}

// ── Ad spend ───────────────────────────────────────────────────────────────

interface AdSpendSummary {
  total: number;
  byDay: Map<string, number>;
}

async function loadAdSpend(from: string, to: string, channel: ReportChannel): Promise<AdSpendSummary> {
  // Walk-in shop sales are not bought through online ads; attributing ad spend to them
  // would make the shop look unprofitable and the online channels look free.
  if (channel === "shop" || channel === "unattributed") {
    return { total: 0, byDay: new Map() };
  }

  // Meta owns both Facebook and Instagram campaign spend. Filtering one social channel
  // includes the combined Meta rows so the number isn't understated.
  const platformFilter =
    channel === "facebook"
      ? "and platform in ('meta', 'facebook')"
      : channel === "instagram"
        ? "and platform in ('meta', 'instagram')"
        : "";

  const { rows } = await query<{ day: string; spend: string }>(
    `select spend_date::text as day, coalesce(sum(spend), 0)::text as spend
       from app_ad_spend
      where spend_date between $1::date and $2::date
        ${platformFilter}
      group by spend_date`,
    [from, to]
  );

  const byDay = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    const value = num(row.spend);
    byDay.set(row.day, value);
    total += value;
  }
  return { total, byDay };
}

// ── COD pending ────────────────────────────────────────────────────────────

interface SettlementDoc {
  payouts?: { allocations?: { orderId?: string; amount?: number }[] }[];
  overrides?: Record<string, { expected?: number }>;
}

interface SettingsDoc {
  courier?: {
    settlementMode?: SettlementMode;
    codChargePct?: number;
    riskManagementPct?: number;
  };
}

function deliveryDayFor(order: Order): string | null {
  if (order.delivery.deliveryDate) return dhakaDay(order.delivery.deliveryDate);
  const label = order.status === "partial_delivered" ? "Marked Partial Delivered" : "Marked Delivered";
  for (let i = order.activity.length - 1; i >= 0; i--) {
    if (order.activity[i].label === label) return dhakaDay(order.activity[i].at);
  }
  return dhakaDay(order.updatedAt);
}

function toCodOrder(order: Order): CodOrderInput | null {
  if (order.status !== "delivered" && order.status !== "partial_delivered") return null;
  const subtotal = order.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discount = order.items.reduce((sum, item) => sum + item.discount, 0);
  return {
    id: order.id,
    status: order.status,
    deliveryDay: deliveryDayFor(order),
    customerPaid: order.delivery.customerPaid ?? 0,
    expectedCod: subtotal - discount + order.deliveryCharge,
    forwardCost: order.courier.forwardCost ?? 0,
    returnCost: order.courier.returnCost ?? 0,
    otherCost: order.courier.otherCost ?? 0,
    legacySettled: order.delivery.settlementStatus === "settled",
  };
}

async function loadCodPending(channel: ReportChannel): Promise<CodPendingBuckets> {
  const [ordersRes, docsRes] = await Promise.all([
    query<{ data: Order }>(
      `select o.data from app_records o
        where o.collection = 'orders'
          and o.data->>'status' in ('delivered', 'partial_delivered')
          and ($1 = 'all' or ${channelExpr("o")} = $1)`,
      [channel]
    ),
    query<{ key: string; data: unknown }>(
      `select key, data from app_documents where key in ('settings', 'settlements')`
    ),
  ]);

  const settlements = (docsRes.rows.find((row) => row.key === "settlements")?.data ?? {}) as SettlementDoc;
  const settings = (docsRes.rows.find((row) => row.key === "settings")?.data ?? {}) as SettingsDoc;

  const receivedByOrder = new Map<string, number>();
  for (const payout of settlements.payouts ?? []) {
    for (const allocation of payout.allocations ?? []) {
      if (!allocation.orderId || !(Number(allocation.amount) > 0)) continue;
      receivedByOrder.set(allocation.orderId, (receivedByOrder.get(allocation.orderId) ?? 0) + Number(allocation.amount));
    }
  }

  const today = dhakaDay(new Date()) ?? new Date().toISOString().slice(0, 10);
  const orders: CodOrderInput[] = [];
  for (const row of ordersRes.rows) {
    const codOrder = toCodOrder(row.data);
    if (!codOrder) continue;
    const override = settlements.overrides?.[codOrder.id]?.expected;
    orders.push({ ...codOrder, overrideExpected: override === undefined ? undefined : Number(override) });
  }

  const settingsForCod: CodSettings = {
    settlementMode: settings.courier?.settlementMode ?? "auto_override",
    codChargePct: Number(settings.courier?.codChargePct ?? 0),
    riskManagementPct: Number(settings.courier?.riskManagementPct ?? 0),
  };

  return computeCodPending(orders, receivedByOrder, settingsForCod, today);
}

// ── Aggregate helpers ──────────────────────────────────────────────────────

const sumField = (rows: DailySummaryRow[], field: keyof DailySummaryRow) =>
  rows.reduce((total, row) => {
    const value = row[field];
    return total + (typeof value === "number" ? value : 0);
  }, 0);

function buildBundledKpis(
  currentRows: DailySummaryRow[],
  previousRows: DailySummaryRow[],
  pipeline: PipelineTotal,
  adSpend: AdSpendSummary,
  previousAdSpend: AdSpendSummary,
  codPending: CodPendingBuckets
): ExecutiveKpiSummary {
  const realizedRevenue = sumField(currentRows, "netRevenue");
  const prevRealizedRevenue = sumField(previousRows, "netRevenue");
  const deliveredOrders = sumField(currentRows, "deliveredOrders");
  const prevDeliveredOrders = sumField(previousRows, "deliveredOrders");
  const grossProfit = sumField(currentRows, "grossProfit");
  const prevGrossProfit = sumField(previousRows, "grossProfit");
  const refusedOrders = sumField(currentRows, "refusedOrders");
  const netProfit = sumField(currentRows, "netProfit") - adSpend.total;
  const prevNetProfit = sumField(previousRows, "netProfit") - previousAdSpend.total;
  const aov = deliveredOrders > 0 ? realizedRevenue / deliveredOrders : 0;

  const shopRevenue = currentRows.filter((row) => row.channel === "shop").reduce((sum, row) => sum + row.netRevenue, 0);
  const onlineRevenue = realizedRevenue - shopRevenue;

  const channelMap = new Map<string, ChannelBreakdownRow>();
  for (const row of currentRows) {
    const channel = row.channel || "unattributed";
    const current = channelMap.get(channel) ?? {
      channel,
      deliveredOrders: 0,
      refusedOrders: 0,
      netRevenue: 0,
      productCost: 0,
      grossProfit: 0,
      marginPct: 0,
      aov: 0,
    };
    current.deliveredOrders += row.deliveredOrders;
    current.refusedOrders += row.refusedOrders;
    current.netRevenue += row.netRevenue;
    current.productCost += row.productCost;
    current.grossProfit += row.grossProfit;
    channelMap.set(channel, current);
  }
  const channelBreakdown = [...channelMap.values()]
    .map((channel) => ({
      ...channel,
      marginPct: channel.netRevenue > 0 ? (channel.grossProfit / channel.netRevenue) * 100 : 0,
      aov: channel.deliveredOrders > 0 ? channel.netRevenue / channel.deliveredOrders : 0,
    }))
    .sort((a, b) => b.netRevenue - a.netRevenue);

  const dailyMap = new Map<string, DailyTrendRow>();
  for (const row of currentRows) {
    if (!row.reportDate) continue;
    const current = dailyMap.get(row.reportDate) ?? {
      date: row.reportDate,
      deliveredRevenue: 0,
      shopRevenue: 0,
      netRevenue: 0,
      grossProfit: 0,
      netProfit: 0,
      adSpend: 0,
    };
    if (row.channel === "shop") current.shopRevenue += row.netRevenue;
    else current.deliveredRevenue += row.netRevenue;
    current.netRevenue += row.netRevenue;
    current.grossProfit += row.grossProfit;
    current.netProfit += row.netProfit;
    dailyMap.set(row.reportDate, current);
  }
  for (const [date, spend] of adSpend.byDay) {
    const current = dailyMap.get(date) ?? {
      date,
      deliveredRevenue: 0,
      shopRevenue: 0,
      netRevenue: 0,
      grossProfit: 0,
      netProfit: 0,
      adSpend: 0,
    };
    current.adSpend += spend;
    dailyMap.set(date, current);
  }
  const dailyTrends = [...dailyMap.values()]
    .map((row) => ({ ...row, netProfit: row.netProfit - row.adSpend }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    realizedRevenue,
    prevRealizedRevenue,
    deliveredOrders,
    prevDeliveredOrders,
    grossProfit,
    prevGrossProfit,
    adSpend: adSpend.total,
    prevAdSpend: previousAdSpend.total,
    netProfit,
    prevNetProfit,
    expectedRevenue: pipeline.revenue,
    expectedProfit: pipeline.revenue - pipeline.cogs,
    codPending: codPending.total,
    codPendingBuckets: {
      total: codPending.total,
      pending0to7: codPending.pending0to7,
      pending8to14: codPending.pending8to14,
      pending15plus: codPending.pending15plus,
      openOrders: codPending.openOrders,
    },
    aov,
    onlineSharePct: realizedRevenue > 0 ? (onlineRevenue / realizedRevenue) * 100 : 0,
    shopSharePct: realizedRevenue > 0 ? (shopRevenue / realizedRevenue) * 100 : 0,
    deliveryRatePct:
      deliveredOrders + refusedOrders > 0
        ? (deliveredOrders / (deliveredOrders + refusedOrders)) * 100
        : 0,
    refusalRatePct:
      deliveredOrders + refusedOrders > 0
        ? (refusedOrders / (deliveredOrders + refusedOrders)) * 100
        : 0,
    channelBreakdown,
    dailyTrends,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

const SUMMARY_TTL_MS = 45_000;
const summaryCache = new RevisionCache<ReportBundle>(32);

/** Rows only. Prefer `getReportBundle` when the KPIs are also needed (avoids duplicate queries). */
export async function getDailySummaryReport(from: string, to: string, channelFilter?: string): Promise<DailySummaryRow[]> {
  return (await getReportBundle(from, to, channelFilter)).rows;
}

export async function getReportBundle(from: string, to: string, channelFilter?: string): Promise<ReportBundle> {
  const channel: ReportChannel = channelFilter && isReportChannel(channelFilter) ? channelFilter : "all";
  const previous = previousPeriodRange(from, to);

  // Revision-keyed so any write to orders/POS/settings invalidates this immediately;
  // the 45-second bucket caps how long a non-versioned write (ad spend) can look stale.
  const revision = await revisionKey(["orders", "pos_invoices", "pos_returns", "products", "settings", "settlements"]);
  const ttlBucket = Math.floor(Date.now() / SUMMARY_TTL_MS);
  const cacheKey = `${revision}|${ttlBucket}|${from}|${to}|${channel}`;

  return summaryCache.get(cacheKey, async () => {
    const [currentRows, previousRows, pipeline, adSpend, previousAdSpend, codPending] = await Promise.all([
      loadRows(from, to, channel),
      loadRows(previous.from, previous.to, channel),
      loadPipeline(channel),
      loadAdSpend(from, to, channel),
      loadAdSpend(previous.from, previous.to, channel),
      loadCodPending(channel),
    ]);

    return {
      rows: currentRows,
      kpis: buildBundledKpis(currentRows, previousRows, pipeline, adSpend, previousAdSpend, codPending),
    };
  });
}

export async function getExecutiveKpis(from: string, to: string, channelFilter?: string): Promise<ExecutiveKpiSummary> {
  return (await getReportBundle(from, to, channelFilter)).kpis;
}
