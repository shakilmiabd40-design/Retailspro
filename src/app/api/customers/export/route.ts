import type { ExportColumn } from "@/lib/reports/export";
import { toCsv } from "@/lib/reports/export";
import type { CustomerSummary } from "@/lib/customers/types";
import { requireAuth } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { query } from "@/server/db";
import { route } from "@/server/http";
import {
  buildCustomerRowsQuery,
  mapCustomerRow,
  parseCustomerQuery,
  type CustomerDbRow,
} from "@/server/customers/query";

export const dynamic = "force-dynamic";

/** Keeps a CSV download bounded on very large shops; the client reports the truncation. */
const EXPORT_LIMIT = 10_000;

const COLUMNS: ExportColumn<CustomerSummary>[] = [
  { header: "Phone", value: (row) => row.phone },
  { header: "Name", value: (row) => row.name },
  { header: "Total orders", value: (row) => row.totalOrders },
  { header: "Delivered", value: (row) => row.delivered },
  { header: "Refused/returned", value: (row) => row.refusedReturned },
  { header: "Lifetime delivered amount", value: (row) => row.lifetimeDelivered },
  { header: "Last order date", value: (row) => row.lastOrderDate },
];

function csvResponse(rows: CustomerSummary[], truncated: boolean) {
  // BOM so Excel opens UTF-8 names correctly.
  const body = `\uFEFF${toCsv(COLUMNS, rows)}`;
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customers-${new Date().toISOString().slice(0, 10)}.csv"`,
      "X-Truncated": truncated ? "1" : "0",
    },
  });
}

export const GET = route(async (req) => {
  const params = parseCustomerQuery(req.nextUrl.searchParams);
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.orders)) return csvResponse([], false);

  const exportQuery = buildCustomerRowsQuery(params, EXPORT_LIMIT + 1, 0);
  const { rows } = await query<CustomerDbRow>(exportQuery.sql, exportQuery.params);
  const truncated = rows.length > EXPORT_LIMIT;
  return csvResponse(rows.slice(0, EXPORT_LIMIT).map(mapCustomerRow), truncated);
});
