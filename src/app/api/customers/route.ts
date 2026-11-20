import { query } from "@/server/db";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { json, route } from "@/server/http";
import type { CustomerDbRow } from "@/server/customers/query";
import {
  buildCustomerCountQuery,
  buildCustomerRowsQuery,
  mapCustomerRow,
  parseCustomerQuery,
} from "@/server/customers/query";
import type { CustomersPageResponse } from "@/lib/customers/types";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const params = parseCustomerQuery(req.nextUrl.searchParams);
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) {
    return json({ rows: [], total: 0, page: params.page, limit: params.limit, pages: 0 } satisfies CustomersPageResponse);
  }

  const count = buildCustomerCountQuery(params);
  const rows = buildCustomerRowsQuery(params);
  const [{ rows: countRows }, { rows: customerRows }] = await Promise.all([
    query<{ total: string }>(count.sql, count.params),
    query<CustomerDbRow>(rows.sql, rows.params),
  ]);

  const total = Number(countRows[0]?.total || 0);
  return json({
    rows: customerRows.map(mapCustomerRow),
    total,
    page: params.page,
    limit: params.limit,
    pages: Math.ceil(total / params.limit),
  } satisfies CustomersPageResponse);
});
