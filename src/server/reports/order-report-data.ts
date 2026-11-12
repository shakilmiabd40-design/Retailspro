import "server-only";
import type { Order } from "@/lib/orders/types";
import type { DateTypeKey } from "@/lib/reports/dates";
import { query } from "@/server/db";
import { RevisionCache, revisionKey } from "@/server/revision-cache";
import type { CodSettings } from "./cod";
import { loadOrderCandidates } from "./order-candidates";
import { buildReceivedByOrder, settlementSettingsFrom, type SettlementDocument, type SettlementSettingsDocument } from "./settlement-summary";

/**
 * Everything the order-level report builders need, loaded once per request.
 *
 * The candidate orders are cached by `order-candidates.ts`. Settings and the
 * settlement ledger are cached by their `app_revs` revision so a busy report
 * screen does not re-read the same documents on every filter change.
 */

interface OrderReportDocuments {
  settings: CodSettings;
  receivedByOrder: Map<string, number>;
  overrides: Record<string, { expected?: number }>;
}

export interface OrderReportData extends OrderReportDocuments {
  orders: Order[];
}

const documentCache = new RevisionCache<OrderReportDocuments>(8);

async function loadDocuments(): Promise<OrderReportDocuments> {
  const rev = await revisionKey(["settings", "settlements"]);
  return documentCache.get(rev, async () => {
    const { rows } = await query<{ key: string; data: unknown }>(
      "select key, data from app_documents where key in ('settings', 'settlements')",
    );
    const settingsDoc = rows.find((row) => row.key === "settings")?.data as SettlementSettingsDocument | undefined;
    const settlementDoc = rows.find((row) => row.key === "settlements")?.data as SettlementDocument | undefined;
    return {
      settings: settlementSettingsFrom(settingsDoc),
      receivedByOrder: buildReceivedByOrder(settlementDoc),
      overrides: settlementDoc?.overrides ?? {},
    };
  });
}

export async function loadOrderReportData(
  from: string,
  to: string,
  dateType: DateTypeKey,
  options: { includeSettlements?: boolean } = {},
): Promise<OrderReportData> {
  const orders = await loadOrderCandidates(from, to, dateType);
  const documents = await loadDocuments();
  if (options.includeSettlements === false) {
    return { orders, settings: documents.settings, receivedByOrder: new Map(), overrides: {} };
  }
  return { orders, ...documents };
}
