import "server-only";
import { tx } from "@/server/db";
import { ApiError, json, route } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { bumpRev } from "@/server/seed";
import { convertHistory } from "@/server/accounting/history";
import type { Account, LedgerEntry } from "@/lib/accounting/types";
import type { AccountingConfig, ApInvoice, ChartOfAccount } from "@/lib/accounting/gl-types";
import { DEFAULT_ACCOUNTING_CONFIG } from "@/lib/accounting/gl-types";
import type { Order } from "@/lib/orders/types";
import type { Product } from "@/lib/products/types";
import type { PurchaseOrder } from "@/lib/purchase-orders/types";
import type { PosInvoice } from "@/lib/pos/types";
import type { PoolClient } from "pg";

export const dynamic = "force-dynamic";

type Row<T> = { id: string; data: T };

async function collect(client: PoolClient) {
  async function load<T>(collection: string): Promise<Row<T>[]> {
    const { rows } = await client.query<Row<T>>("select id, data from app_records where collection = $1", [collection]);
    return rows;
  }
  const [accounts, ledger, products, purchaseOrders, orders, invoices, apInvoices, coa] = await Promise.all([
    load<Account>("accounts"), load<LedgerEntry>("ledger"), load<Product>("products"),
    load<PurchaseOrder>("purchase_orders"), load<Order>("orders"), load<PosInvoice>("pos_invoices"), load<ApInvoice>("ap_invoices"),
    load<ChartOfAccount>("chart_of_accounts"),
  ]);
  const { rows: configRows } = await client.query<{ data: Partial<AccountingConfig> }>("select data from app_documents where key = 'accounting_config'");
  const config = { ...DEFAULT_ACCOUNTING_CONFIG, ...(configRows[0]?.data ?? {}), categoryAccounts: { ...DEFAULT_ACCOUNTING_CONFIG.categoryAccounts, ...(configRows[0]?.data?.categoryAccounts ?? {}) } };
  return { converted: convertHistory({ accounts, ledger, products, purchaseOrders, orders, invoices, apInvoices }, coa, config), coa };
}

export const GET = route(async (req) => {
  await requireAuth(req, { superAdmin: true });
  return tx(async (client) => {
    const { rows: markers } = await client.query<{ data: Record<string, unknown> }>("select data from app_documents where key = 'accounting_history_conversion'");
    if (markers[0]?.data?.convertedAt) return json({ completed: true, metadata: markers[0].data });
    const { rows: existing } = await client.query<{ count: string }>("select count(*)::text as count from app_records where collection in ('journal_entries','inventory_cost_layers','inventory_movements')");
    if (Number(existing[0]?.count || 0) > 0) return json({ completed: false, canConvert: false, reason: "GL records already exist. Reconcile them before running history conversion." });
    const { converted } = await collect(client);
    return json({ completed: false, canConvert: true, journalCount: converted.journals.length, layerCount: converted.layers.length, movementCount: converted.movements.length, grniCount: converted.grni.length, estimateCount: converted.estimates.length, estimates: converted.estimates.slice(0, 50) });
  });
});

/** One-time conversion of currently retained operational and cash-ledger history into FIFO and GL records. */
export const POST = route(async (req) => {
  const auth = await requireAuth(req, { superAdmin: true });
  const result = await tx(async (client) => {
    const { rows: markers } = await client.query<{ data: { convertedAt?: string } }>(
      "select data from app_documents where key = 'accounting_history_conversion' for update"
    );
    if (markers[0]?.data?.convertedAt) throw new ApiError(409, "already_converted", "Historical accounting has already been converted.");

    const { rows: existing } = await client.query<{ count: string }>(
      "select count(*)::text as count from app_records where collection in ('journal_entries','inventory_cost_layers','inventory_movements')"
    );
    if (Number(existing[0]?.count || 0) > 0) throw new ApiError(409, "existing_gl_data", "GL records already exist. Reconcile them before running history conversion.");

    const { converted, coa } = await collect(client);
    const createdBy = auth.user.id;

    async function insert<T extends { id: string }>(collection: string, items: T[]) {
      const batchSize = 500;
      for (let offset = 0; offset < items.length; offset += batchSize) {
        const batch = items.slice(offset, offset + batchSize);
        await client.query(
          `insert into app_records (collection,id,data,updated_by)
           select $1, row_data.id, row_data.data, $3
           from jsonb_to_recordset($2::jsonb) as row_data(id text, data jsonb)`,
          [collection, JSON.stringify(batch), createdBy]
        );
      }
      if (items.length) await bumpRev(client, collection);
    }
    const existingCoaIds = new Set(coa.map((row) => row.id));
    await insert("chart_of_accounts", converted.accounts.filter((account) => !existingCoaIds.has(account.id)));
    await insert("journal_entries", converted.journals);
    await insert("inventory_cost_layers", converted.layers);
    await insert("inventory_movements", converted.movements);
    await insert("grni", converted.grni);
    const metadata = { convertedAt: new Date().toISOString(), convertedBy: auth.user.name, journalCount: converted.journals.length, layerCount: converted.layers.length, movementCount: converted.movements.length, estimateCount: converted.estimates.length };
    await client.query(
      `insert into app_documents (key,data,updated_by) values ('accounting_history_conversion',$1::jsonb,$2)
       on conflict (key) do update set data=excluded.data,version=app_documents.version+1,updated_at=now(),updated_by=excluded.updated_by`,
      [JSON.stringify(metadata), createdBy]
    );
    await bumpRev(client, "accounting_history_conversion");
    return { ...metadata, estimates: converted.estimates };
  });
  return json(result);
});
