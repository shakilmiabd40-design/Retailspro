import "server-only";
import type { CustomerSummary } from "@/lib/customers/types";
import { normalizePhoneKey } from "@/lib/customers/phone";

/**
 * Read-only, server-side customer grouping. The parser and SQL builders are pure so they can be
 * unit tested; only the route handlers call `query()` with the SQL produced here.
 *
 * Normalization mirrors `normalizePhoneKey` / `buildPhoneVariants`: Bangla digits become ASCII,
 * the separators removed by `normalizePhoneForCourier` are stripped, and a full `8801…` prefix is
 * moved to local `01…`. Only numbers that end up as `01` + 9 digits form a customer group.
 *
 * Known limitation: separators outside that exact set (for example `/`, `x`, or non-Bangla
 * numeral systems) are not stripped, and whitespace stripping depends on the database collation.
 * Such stored phones stay out of the list instead of being merged into a guessed customer. This
 * avoids a full-table fuzzy scan; an expression index on a normalized phone could be added later
 * as a migration if this needs to change.
 */

export interface CustomerQuery {
  page: number;
  limit: number;
  offset: number;
  /** Lower-cased, LIKE-escaped name fragment. Empty means "no search". */
  search: string;
  /** Same fragment after phone normalization, so `+880 171…` also finds a local number. */
  phoneSearch: string;
}

export interface CustomerDbRow {
  name: string | null;
  phone: string;
  total_orders: string | number;
  delivered: string | number;
  refused_returned: string | number;
  lifetime_delivered: string | number | null;
  last_order_date: string | null;
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
const positiveInt = (raw: string | null, fallback: number, max?: number) => {
  const parsed = Math.max(1, Number.parseInt(raw ?? "", 10) || fallback);
  return max ? Math.min(max, parsed) : parsed;
};

/** Same bounds as `/api/orders`: positive page, positive limit capped at 100. */
export function parseCustomerQuery(params: URLSearchParams): CustomerQuery {
  const page = positiveInt(params.get("page"), 1);
  const limit = positiveInt(params.get("limit"), 20, 100);
  const rawSearch = (params.get("search") ?? "").trim().slice(0, 120);

  const cleaned = normalizePhoneKey(rawSearch);
  // A partial `+880 171…` is not a complete number, but dropping the country code still makes the
  // phone fragment usable for searching. Full numbers are already converted by normalizePhoneKey.
  const loosePhone = cleaned.startsWith("880") ? `0${cleaned.slice(3)}` : cleaned;

  return {
    page,
    limit,
    offset: (page - 1) * limit,
    search: escapeLike(rawSearch.toLowerCase()),
    phoneSearch: escapeLike(loosePhone.toLowerCase()),
  };
}

/** All grouping happens here; no order rows are returned to the browser. */
const CUSTOMERS_BASE_SQL = `
WITH stripped AS (
  SELECT data, seq,
    regexp_replace(
      translate(coalesce(data->>'phone', ''), '০১২৩৪৫৬৭৮৯', '0123456789'),
      '[-()+.[:space:]‐‑‒–—―]', '', 'g'
    ) AS cleaned
  FROM app_records
  WHERE collection = 'orders'
),
normalized AS (
  SELECT data, seq,
    CASE WHEN cleaned ~ '^8801[0-9]{9}$' THEN '0' || substring(cleaned from 4) ELSE cleaned END AS phone
  FROM stripped
),
priced_orders AS (
  SELECT data, seq, phone, data->>'status' AS status,
    coalesce((SELECT sum((i->>'price')::numeric * (i->>'qty')::numeric)
              FROM jsonb_array_elements(coalesce(data->'items', '[]'::jsonb)) i), 0)
    - coalesce((SELECT sum((i->>'discount')::numeric)
                FROM jsonb_array_elements(coalesce(data->'items', '[]'::jsonb)) i), 0)
    + coalesce((data->>'deliveryCharge')::numeric, 0) AS cod
  FROM normalized
  WHERE phone ~ '^01[0-9]{9}$'
),
valid_orders AS (
  SELECT data, seq, phone, status,
    CASE WHEN data->'exchange' IS NULL THEN cod
         ELSE greatest(0, cod - coalesce((data #>> '{exchange,credit}')::numeric, 0))
    END AS amount
  FROM priced_orders
),
grouped AS (
  SELECT phone,
    count(*)::int AS total_orders,
    count(*) FILTER (WHERE status = 'delivered')::int AS delivered,
    count(*) FILTER (WHERE status = 'refuse_return')::int AS refused_returned,
    coalesce(sum(amount) FILTER (WHERE status = 'delivered'), 0)::numeric(14,2) AS lifetime_delivered
  FROM valid_orders
  GROUP BY phone
),
names AS (
  SELECT DISTINCT ON (phone) phone, btrim(coalesce(data->>'customerName', '')) AS name
  FROM valid_orders
  WHERE nullif(btrim(coalesce(data->>'customerName', '')), '') IS NOT NULL
  ORDER BY phone, (data->>'createdAt') DESC NULLS LAST, seq DESC
),
last_orders AS (
  SELECT DISTINCT ON (phone) phone, data->>'createdAt' AS last_order_date
  FROM valid_orders
  ORDER BY phone, (data->>'createdAt') DESC NULLS LAST, seq DESC
),
customers AS (
  SELECT g.phone, coalesce(n.name, '') AS name, g.total_orders, g.delivered,
    g.refused_returned, g.lifetime_delivered, l.last_order_date
  FROM grouped g
  LEFT JOIN names n ON n.phone = g.phone
  LEFT JOIN last_orders l ON l.phone = g.phone
  WHERE ($1::text = ''
    OR lower(coalesce(n.name, '')) LIKE $1::text ESCAPE '\\'
    OR g.phone LIKE $2::text ESCAPE '\\')
)
`;

function baseQuery(q: CustomerQuery) {
  return { sql: CUSTOMERS_BASE_SQL, params: [q.search, q.phoneSearch] as unknown[] };
}

export function buildCustomerCountQuery(q: CustomerQuery) {
  const base = baseQuery(q);
  return { sql: `${base.sql}\nSELECT count(*)::text AS total FROM customers`, params: base.params };
}

export function buildCustomerRowsQuery(q: CustomerQuery, limit = q.limit, offset = q.offset) {
  const base = baseQuery(q);
  return {
    sql: `${base.sql}\nSELECT name, phone, total_orders, delivered, refused_returned, lifetime_delivered, last_order_date
      FROM customers
      ORDER BY last_order_date DESC NULLS LAST, total_orders DESC, phone
      LIMIT $${base.params.length + 1} OFFSET $${base.params.length + 2}`,
    params: [...base.params, limit, offset],
  };
}

export function mapCustomerRow(row: CustomerDbRow): CustomerSummary {
  return {
    name: String(row.name ?? ""),
    phone: String(row.phone ?? ""),
    totalOrders: Number(row.total_orders) || 0,
    delivered: Number(row.delivered) || 0,
    refusedReturned: Number(row.refused_returned) || 0,
    lifetimeDelivered: Math.round((Number(row.lifetime_delivered) || 0) * 100) / 100,
    lastOrderDate: row.last_order_date ? String(row.last_order_date) : null,
  };
}
