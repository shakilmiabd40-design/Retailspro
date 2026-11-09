import "server-only";
import type { PoolClient } from "pg";
import type { AccountingConfig, ChartOfAccount, InventoryCostLayer, InventoryMovement, JournalEntry, JournalLine, GrniEntry, StockAdjustment } from "@/lib/accounting/gl-types";
import { DEFAULT_ACCOUNTING_CONFIG } from "@/lib/accounting/gl-types";
import type { Order, OrderExchange, OrderItem } from "@/lib/orders/types";
import type { Product } from "@/lib/products/types";
import type { PurchaseOrder } from "@/lib/purchase-orders/types";
import type { PosInvoice, PosReturn } from "@/lib/pos/types";
import { actualCourierCost, grossRevenue } from "@/lib/orders/utils";
import { allocateLandedCost, consumeFifo } from "@/lib/accounting/fifo";
import { bumpRev } from "@/server/seed";

type Change<T> = { before?: T; after?: T };
export type AccountingChanges = {
  orders?: Map<string, Change<Order>>;
  products?: Map<string, Change<Product>>;
  purchase_orders?: Map<string, Change<PurchaseOrder>>;
  pos_invoices?: Map<string, Change<PosInvoice>>;
  pos_returns?: Map<string, Change<PosReturn>>;
  stock_adjustments?: Map<string, Change<StockAdjustment>>;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const safeId = (value: string) => `auto-${value}`.slice(0, 120);
const dateOf = (value: string | undefined) => (value || new Date().toISOString()).slice(0, 10);

async function insertRecord<T extends { id: string }>(client: PoolClient, collection: string, item: T, actor: string) {
  const r = await client.query("insert into app_records (collection,id,data,updated_by) values ($1,$2,$3::jsonb,$4) on conflict (collection,id) do nothing returning id", [collection, item.id, JSON.stringify(item), actor]);
  return r.rows.length > 0;
}

/** Apply accounting side effects in the same DB transaction as the source inventory/sale change. */
export async function postAccountingChanges(client: PoolClient, changes: AccountingChanges, actor: string): Promise<void> {
  const { rows: marker } = await client.query<{ data: { convertedAt?: string } }>("select data from app_documents where key = 'accounting_history_conversion'");
  if (!marker[0]?.data?.convertedAt) return; // The explicit one-time history conversion is the cutover.

  const { rows: accountRows } = await client.query<{ data: ChartOfAccount }>("select data from app_records where collection='chart_of_accounts'");
  const accounts = accountRows.map((r) => r.data);
  const accountFor = (code: string) => {
    const account = accounts.find((a) => a.code === code && !a.archived);
    if (!account) throw new Error(`Accounting account ${code} is not configured.`);
    return account;
  };
  const { rows: configRows } = await client.query<{ data: Partial<AccountingConfig> }>("select data from app_documents where key='accounting_config'");
  const config = { ...DEFAULT_ACCOUNTING_CONFIG, ...(configRows[0]?.data ?? {}), categoryAccounts: { ...DEFAULT_ACCOUNTING_CONFIG.categoryAccounts, ...(configRows[0]?.data?.categoryAccounts ?? {}) } };
  const productAfter = new Map([...(changes.products ?? [])].flatMap(([id, change]) => change.after ? [[id, change.after] as const] : []));
  const getProduct = async (id: string) => {
    const changed = productAfter.get(id);
    if (changed) return changed;
    const { rows } = await client.query<{ data: Product }>("select data from app_records where collection='products' and id=$1", [id]);
    return rows[0]?.data;
  };
  const inventoryCode = (p: Product) => config.categoryAccounts[p.category]?.inventory || "1200";
  const cogsCode = (p: Product) => config.categoryAccounts[p.category]?.cogs || "5010";
  const revenueCode = (p: Product) => config.categoryAccounts[p.category]?.revenue || "4010";
  const periods = await client.query<{ data: { from: string; to: string; status: string } }>("select data from app_records where collection='accounting_periods'");
  const assertOpen = (date: string) => {
    const locked = periods.rows.map((r) => r.data).find((p) => p.status === "locked" && date >= p.from && date <= p.to);
    if (locked) throw new Error(`Accounting period ${locked.from} to ${locked.to} is locked; this transaction cannot be posted.`);
  };
  const insertJournal = async (args: { id: string; source: JournalEntry["source"]; sourceId: string; date: string; ref: string; narration: string; lines: { code: string; debit: number; credit: number; memo?: string }[] }) => {
    const { rows: already } = await client.query("select 1 from app_records where collection='journal_entries' and data->>'sourceId'=$1 limit 1", [args.sourceId]);
    if (already.length) return null;
    assertOpen(args.date);
    const lines: JournalLine[] = args.lines.filter((l) => l.debit > 0 || l.credit > 0).map((l, i) => {
      const account = accountFor(l.code);
      return { id: safeId(`${args.id}-line-${i}`), accountId: account.id, accountCode: account.code, accountName: account.name, debit: round2(l.debit), credit: round2(l.credit), memo: l.memo };
    });
    const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
    const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
    if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.01) throw new Error(`Automatic journal ${args.ref} is not balanced.`);
    const entry: JournalEntry = { id: safeId(args.id), entryNumber: args.id.slice(0, 50), date: args.date, ref: args.ref, narration: args.narration, source: args.source, sourceId: args.sourceId, status: "posted", lines, totalDebit, totalCredit, createdAt: new Date().toISOString(), createdBy: actor, postedAt: new Date().toISOString(), postedBy: actor };
    if (await insertRecord(client, "journal_entries", entry, actor)) await bumpRev(client, "journal_entries");
    return entry;
  };

  const receiptChanges: Map<string, Change<PurchaseOrder>> = changes.purchase_orders ?? new Map<string, Change<PurchaseOrder>>();
  for (const [poId, change] of receiptChanges) {
    if (!change.after) continue;
    const po = change.after;
    const oldReceiptIds = new Set((change.before?.receivings ?? []).map((r: PurchaseOrder["receivings"][number]) => r.id));
    const addedReceipts = (po.receivings ?? []).filter((r: PurchaseOrder["receivings"][number]) => !oldReceiptIds.has(r.id));
    for (const receipt of addedReceipts) {
      const date = dateOf(receipt.date || po.poDate);
      const receiptLines: { productId: string; variantId: string; qty: number; unitCost: number }[] = (receipt.items ?? []).flatMap((r: PurchaseOrder["receivings"][number]["items"][number]) => {
        const item = po.items.find((i: PurchaseOrder["items"][number]) => i.variantId === r.variantId);
        return item && r.qty > 0 ? [{ productId: item.productId, variantId: item.variantId, qty: r.qty, unitCost: r.unitCost || item.unitCost }] : [];
      });
      const landed = allocateLandedCost(receiptLines, po.receivings.length ? (po.shippingCost || 0) / po.receivings.length : 0);
      const sourceIds: string[] = [];
      for (const [index, item] of landed.entries()) {
        const sourceId = `${poId}:${receipt.id}:${index}`;
        const product = await getProduct(item.productId);
        if (!product) throw new Error(`Product ${item.productId} is missing for PO receipt ${po.poNumber}.`);
        const layer: InventoryCostLayer = { id: safeId(`receipt-${sourceId}`), productId: item.productId, variantId: item.variantId, qty: item.qty, remainingQty: item.qty, unitCost: item.landedUnitCost, totalCost: round2(item.landedTotal), landedCost: round2(item.landedTotal - item.qty * item.unitCost), receivedAt: date, source: "po_receipt", sourceId };
        const amount = layer.totalCost;
        const account = inventoryCode(product);
        const entry = await insertJournal({ id: `AUTO-PO-${po.poNumber}-${receipt.id}-${index}`, source: "po_receipt", sourceId, date, ref: po.poNumber, narration: `Goods received · ${po.poNumber}`, lines: [{ code: account, debit: amount, credit: 0 }, { code: "2030", debit: 0, credit: amount }] });
        if (!entry) continue;
        await insertRecord(client, "inventory_cost_layers", layer, actor);
        const movement: InventoryMovement = { id: safeId(`receipt-m-${sourceId}`), date, type: "purchase", productId: item.productId, variantId: item.variantId, qty: item.qty, unitCost: item.landedUnitCost, totalCost: amount, referenceType: "purchase_order", referenceId: po.poNumber, journalEntryId: entry.id, createdAt: new Date().toISOString(), createdBy: actor };
        await insertRecord(client, "inventory_movements", movement, actor);
        const grni: GrniEntry = { id: safeId(`grni-${sourceId}`), poId, poNumber: po.poNumber, supplierId: po.supplierId, receiptId: receipt.id, productId: item.productId, variantId: item.variantId, qtyReceived: item.qty, qtyInvoiced: 0, unitCost: item.landedUnitCost, amount, invoicedAmount: 0, status: "open", receivedAt: date };
        await insertRecord(client, "grni", grni, actor);
        sourceIds.push(sourceId);
      }
      if (sourceIds.length) {
        await bumpRev(client, "inventory_cost_layers");
        await bumpRev(client, "inventory_movements");
        await bumpRev(client, "grni");
      }
    }
  }

  const orderChanges: Map<string, Change<Order>> = changes.orders ?? new Map<string, Change<Order>>();
  for (const [orderId, change] of orderChanges) {
    const order = change.after;
    const prev = change.before;
    if (!order) continue;
    const previousExchangeIds = new Set((prev?.exchanges ?? []).map((x: OrderExchange) => x.id));
    for (const exchange of (order.exchanges ?? []).filter((x: OrderExchange) => !previousExchangeIds.has(x.id))) {
      const date = dateOf(exchange.at);
      const ref = `${order.orderNumber}-EX${(order.exchanges ?? []).findIndex((x: OrderExchange) => x.id === exchange.id) + 1}`;
      const lines: JournalEntryInputLine[] = [];
      const movements: InventoryMovement[] = [];
      for (const [index, item] of exchange.returned.entries()) {
        const source = order.items.find((x: OrderItem) => x.id === item.itemId);
        if (!source) throw new Error(`Returned order item is missing for exchange ${ref}.`);
        const product = await getProduct(source.productId);
        if (!product) throw new Error(`Product ${source.productId} is missing for exchange ${ref}.`);
        const { rows: saleCostRows } = await client.query<{ data: InventoryMovement }>("select data from app_records where collection='inventory_movements' and data->>'referenceType'='sale' and data->>'referenceId'=$1 and data->>'variantId'=$2 order by data->>'date',id", [order.orderNumber, source.variantId]);
        const originalQty = saleCostRows.reduce((sum, row) => sum + row.data.qty, 0);
        const originalCost = originalQty > 0 ? saleCostRows.reduce((sum, row) => sum + row.data.totalCost, 0) / originalQty : product.variants.find((v) => v.id === source.variantId)?.cost ?? product.costPrice;
        const amount = round2(originalCost * item.qty);
        lines.push({ code: inventoryCode(product), debit: amount, credit: 0 }, { code: cogsCode(product), debit: 0, credit: amount });
        await insertRecord(client, "inventory_cost_layers", { id: safeId(`order-exchange-layer-${exchange.id}-${index}`), productId: source.productId, variantId: source.variantId, qty: item.qty, remainingQty: item.qty, unitCost: originalCost, totalCost: amount, landedCost: 0, receivedAt: date, source: "adjustment_in", sourceId: exchange.id }, actor);
        movements.push({ id: safeId(`order-exchange-return-${exchange.id}-${index}`), date, type: "return_in", productId: source.productId, variantId: source.variantId, qty: item.qty, unitCost: originalCost, totalCost: amount, referenceType: "order_exchange", referenceId: ref, createdAt: new Date().toISOString(), createdBy: actor });
      }
      for (const [index, item] of exchange.given.entries()) {
        const product = await getProduct(item.productId);
        if (!product) throw new Error(`Product ${item.productId} is missing for exchange ${ref}.`);
        const { rows } = await client.query<{ id: string; data: InventoryCostLayer; version: number }>("select id,data,version from app_records where collection='inventory_cost_layers' and data->>'variantId'=$1 and (data->>'remainingQty')::numeric>0 order by data->>'receivedAt',id for update", [item.variantId]);
        const fifo = consumeFifo(rows.map((r) => r.data), item.qty, product.variants.find((v) => v.id === item.variantId)?.cost ?? product.costPrice);
        for (const row of rows) { const next = fifo.layers.find((l) => l.id === row.id); if (next && next.remainingQty !== row.data.remainingQty) await client.query("update app_records set data=$3::jsonb,version=version+1,updated_at=now(),updated_by=$4 where collection='inventory_cost_layers' and id=$1 and version=$2", [row.id, row.version, JSON.stringify(next), actor]); }
        lines.push({ code: cogsCode(product), debit: fifo.totalCost, credit: 0 }, { code: inventoryCode(product), debit: 0, credit: fifo.totalCost });
        movements.push({ id: safeId(`order-exchange-given-${exchange.id}-${index}`), date, type: "sale", productId: item.productId, variantId: item.variantId, qty: item.qty, unitCost: fifo.unitCost, totalCost: fifo.totalCost, estimatedCost: fifo.estimatedQty > 0, referenceType: "order_exchange", referenceId: ref, createdAt: new Date().toISOString(), createdBy: actor });
      }
      lines.push({ code: "4020", debit: exchange.returnedValue, credit: 0 }, { code: "4010", debit: 0, credit: exchange.givenValue });
      if (exchange.cashDifference > 0) lines.push({ code: "1010", debit: exchange.cashDifference, credit: 0 });
      if (exchange.cashDifference < 0) lines.push({ code: "1010", debit: 0, credit: Math.abs(exchange.cashDifference) });
      const entry = lines.some((line) => line.debit > 0 || line.credit > 0)
        ? await insertJournal({ id: `AUTO-ORDER-EXCHANGE-${order.orderNumber}-${exchange.id}`, source: "return", sourceId: `${orderId}:exchange:${exchange.id}`, date, ref, narration: `Delivered order exchange · ${ref}`, lines })
        : null;
      for (const movement of movements) { if (entry) movement.journalEntryId = entry.id; await insertRecord(client, "inventory_movements", movement, actor); }
      if (movements.length) { await bumpRev(client, "inventory_movements"); await bumpRev(client, "inventory_cost_layers"); }
    }
    if (order.status === "refuse_return") {
      const firstRefusal = prev?.status !== "refuse_return";
      const costChanged = prev?.status === "refuse_return" && actualCourierCost(prev) !== actualCourierCost(order);
      if (firstRefusal) {
        const cost = actualCourierCost(order);
        if (cost > 0) await insertJournal({ id: `AUTO-REFUSE-${order.orderNumber}`, source: "sale", sourceId: `${orderId}:refuse`, date: dateOf(order.delivery.deliveryDate || order.updatedAt || order.createdAt), ref: order.orderNumber, narration: `Refused parcel courier loss · ${order.orderNumber}`, lines: [{ code: "6040", debit: cost, credit: 0 }, { code: "2050", debit: 0, credit: cost }] });
      } else if (costChanged && prev) {
        const delta = round2(actualCourierCost(order) - actualCourierCost(prev));
        if (delta !== 0) {
          const amount = Math.abs(delta);
          const lines: JournalEntryInputLine[] = delta > 0
            ? [{ code: "6040", debit: amount, credit: 0 }, { code: "2050", debit: 0, credit: amount }]
            : [{ code: "2050", debit: amount, credit: 0 }, { code: "6040", debit: 0, credit: amount }];
          await insertJournal({ id: `AUTO-REFUSE-COST-${order.orderNumber}-${Math.round(actualCourierCost(order) * 100)}`, source: "sale", sourceId: `${orderId}:refuse-cost:${Math.round(actualCourierCost(order) * 100)}`, date: dateOf(order.updatedAt || order.createdAt), ref: order.orderNumber, narration: `Refused parcel courier cost correction · ${order.orderNumber}`, lines });
        }
      }
      continue;
    }
    if (order.status !== "delivered" && order.status !== "partial_delivered") continue;
    const isInitialOutcome = prev?.status !== order.status && !["delivered", "partial_delivered"].includes(prev?.status ?? "");
    const gainedPartialDetails = order.status === "partial_delivered" && !prev?.delivery?.itemsKept && !!order.delivery?.itemsKept?.length;
    const codChanged = !!prev && ["delivered", "partial_delivered"].includes(prev.status) && prev.delivery.customerPaid !== order.delivery.customerPaid;
    const courierChanged = !!prev && ["delivered", "partial_delivered"].includes(prev.status) && actualCourierCost(prev) !== actualCourierCost(order);
    if (!isInitialOutcome && !gainedPartialDetails && !codChanged && !courierChanged) continue;
    const date = dateOf(order.delivery.deliveryDate || order.updatedAt || order.createdAt);
    const itemIds = order.status === "partial_delivered"
      ? new Map<string, number>((order.delivery.itemsKept ?? []).map((i: NonNullable<Order["delivery"]["itemsKept"]>[number]): [string, number] => [i.itemId, i.qty]))
      : null;
    const saleLines: JournalEntryInputLine[] = [];
    const revenueByCode = new Map<string, number>();
    const stockMoves: { movement: InventoryMovement; layerUpdates: InventoryCostLayer[] }[] = [];
    const costedOrderItems: Order["items"] = order.status === "partial_delivered"
      ? order.items.filter((i: Order["items"][number]) => (itemIds?.get(i.id) ?? 0) > 0)
      : order.items;
    for (const item of costedOrderItems) {
      const qty = itemIds ? Math.min(item.qty, Math.max(0, itemIds.get(item.id) ?? 0)) : item.qty;
      if (!qty) continue;
      const product = await getProduct(item.productId);
      if (!product) throw new Error(`Product ${item.productId} is missing for order ${order.orderNumber}.`);
      const { rows: layerRows } = await client.query<{ id: string; data: InventoryCostLayer; version: number }>("select id,data,version from app_records where collection='inventory_cost_layers' and data->>'variantId'=$1 and (data->>'remainingQty')::numeric>0 order by data->>'receivedAt',id for update", [item.variantId]);
      const fifo = consumeFifo(layerRows.map((r) => r.data), qty, product.variants.find((v) => v.id === item.variantId)?.cost ?? product.costPrice);
      const cogsAccount = cogsCode(product);
      const inventoryAccount = inventoryCode(product);
      saleLines.push({ code: cogsAccount, debit: fifo.totalCost, credit: 0 }, { code: inventoryAccount, debit: 0, credit: fifo.totalCost });
      if (isInitialOutcome && order.status === "delivered") revenueByCode.set(revenueCode(product), (revenueByCode.get(revenueCode(product)) ?? 0) + Math.max(0, item.price * item.qty - item.discount));
      for (const row of layerRows) {
        const next = fifo.layers.find((l) => l.id === row.id);
        if (next && next.remainingQty !== row.data.remainingQty) await client.query("update app_records set data=$3::jsonb,version=version+1,updated_at=now(),updated_by=$4 where collection='inventory_cost_layers' and id=$1 and version=$2", [row.id, row.version, JSON.stringify(next), actor]);
      }
      const movement: InventoryMovement = { id: safeId(`sale-m-${orderId}-${gainedPartialDetails ? "partial-items" : item.id}`), date, type: "sale", productId: item.productId, variantId: item.variantId, qty, unitCost: fifo.unitCost, totalCost: fifo.totalCost, estimatedCost: fifo.estimatedQty > 0, referenceType: "sale", referenceId: order.orderNumber, createdAt: new Date().toISOString(), createdBy: actor };
      stockMoves.push({ movement, layerUpdates: fifo.layers });
    }
    if (isInitialOutcome) {
      const billed = order.status === "partial_delivered" ? order.delivery.customerPaid : grossRevenue(order);
      const collected = order.status === "partial_delivered" ? billed : (order.delivery.customerPaid || billed);
      const lines: JournalEntryInputLine[] = [{ code: "1100", debit: collected, credit: 0 }];
      if (order.status === "delivered") {
        const itemTotal = [...revenueByCode.values()].reduce((sum, amount) => sum + amount, 0);
        const deliveryBilled = Math.max(0, billed - itemTotal);
        const revenueTotal = itemTotal + deliveryBilled;
        const scale = revenueTotal > 0 ? collected / revenueTotal : 0;
        for (const [code, amount] of revenueByCode) lines.push({ code, debit: 0, credit: round2(amount * scale) });
        if (deliveryBilled) lines.push({ code: "4010", debit: 0, credit: round2(deliveryBilled * scale) });
        if (collected < revenueTotal) lines.push({ code: "4040", debit: round2(revenueTotal - collected), credit: 0 });
        else if (collected > revenueTotal) lines.push({ code: "4010", debit: 0, credit: round2(collected - revenueTotal) });
      } else lines.push({ code: "4010", debit: 0, credit: collected });
      lines.push(...saleLines);
      const courierCost = actualCourierCost(order);
      if (courierCost > 0) lines.push({ code: "6040", debit: courierCost, credit: 0 }, { code: "2050", debit: 0, credit: courierCost });
      const entry = await insertJournal({ id: `AUTO-SALE-${order.orderNumber}`, source: "sale", sourceId: orderId, date, ref: order.orderNumber, narration: `${order.status === "partial_delivered" ? "Partial sale" : "Delivered sale"} · ${order.orderNumber}`, lines });
      if (entry) for (const { movement } of stockMoves) { movement.journalEntryId = entry.id; await insertRecord(client, "inventory_movements", movement, actor); }
      if (entry && stockMoves.length) await bumpRev(client, "inventory_movements");
    } else if (gainedPartialDetails && saleLines.length) {
      const sourceId = `${orderId}:partial-items`;
      const entry = await insertJournal({ id: `AUTO-PARTIAL-ITEMS-${order.orderNumber}`, source: "sale", sourceId, date, ref: order.orderNumber, narration: `Partial delivery item cost · ${order.orderNumber}`, lines: saleLines });
      if (entry) for (const { movement } of stockMoves) { movement.journalEntryId = entry.id; await insertRecord(client, "inventory_movements", movement, actor); }
      if (entry && stockMoves.length) await bumpRev(client, "inventory_movements");
    }
    if (saleLines.length) await bumpRev(client, "inventory_cost_layers");
    if (codChanged) {
      const delta = round2(order.delivery.customerPaid - prev!.delivery.customerPaid);
      const amount = Math.abs(delta);
      const lines: JournalEntryInputLine[] = delta < 0
        ? [{ code: "4040", debit: amount, credit: 0 }, { code: "1100", debit: 0, credit: amount }]
        : [{ code: "1100", debit: amount, credit: 0 }, { code: "4010", debit: 0, credit: amount }];
      await insertJournal({ id: `AUTO-COD-${order.orderNumber}-${Math.round(order.delivery.customerPaid * 100)}`, source: "sale", sourceId: `${orderId}:cod:${Math.round(order.delivery.customerPaid * 100)}`, date, ref: order.orderNumber, narration: `COD amount adjustment · ${order.orderNumber}`, lines });
    }
    if (courierChanged) {
      const delta = round2(actualCourierCost(order) - actualCourierCost(prev!));
      const lines: JournalEntryInputLine[] = delta > 0
        ? [{ code: "6040", debit: delta, credit: 0 }, { code: "2050", debit: 0, credit: delta }]
        : [{ code: "2050", debit: Math.abs(delta), credit: 0 }, { code: "6040", debit: 0, credit: Math.abs(delta) }];
      await insertJournal({ id: `AUTO-COURIER-${order.orderNumber}-${Math.round(actualCourierCost(order) * 100)}`, source: "sale", sourceId: `${orderId}:courier:${Math.round(actualCourierCost(order) * 100)}`, date, ref: order.orderNumber, narration: `Courier cost adjustment · ${order.orderNumber}`, lines });
    }
  }

  // Walk-in POS invoices deduct stock and settle immediately. Delivery POS invoices
  // are posted from their linked order when the courier confirms delivery.
  for (const [invoiceId, change] of changes.pos_invoices ?? []) {
    const invoice = change.after;
    if (!invoice || invoice.status !== "completed" || invoice.saleType !== "walk_in" || change.before?.status === "completed") continue;
    const date = dateOf(invoice.createdAt);
    const lines: JournalEntryInputLine[] = [];
    const revenue = new Map<string, number>();
    const stockMoves: InventoryMovement[] = [];
    for (const item of invoice.items) {
      const qty = Math.max(0, item.qty - (item.returnedQty ?? 0));
      if (!qty) continue;
      const product = await getProduct(item.productId);
      if (!product) throw new Error(`Product ${item.productId} is missing for POS invoice ${invoice.invoiceNumber}.`);
      const { rows } = await client.query<{ id: string; data: InventoryCostLayer; version: number }>("select id,data,version from app_records where collection='inventory_cost_layers' and data->>'variantId'=$1 and (data->>'remainingQty')::numeric>0 order by data->>'receivedAt',id for update", [item.variantId]);
      const fifo = consumeFifo(rows.map((r) => r.data), qty, item.cost || product.variants.find((v) => v.id === item.variantId)?.cost || product.costPrice);
      for (const row of rows) {
        const next = fifo.layers.find((l) => l.id === row.id);
        if (next && next.remainingQty !== row.data.remainingQty) await client.query("update app_records set data=$3::jsonb,version=version+1,updated_at=now(),updated_by=$4 where collection='inventory_cost_layers' and id=$1 and version=$2", [row.id, row.version, JSON.stringify(next), actor]);
      }
      const cost = fifo.totalCost;
      lines.push({ code: cogsCode(product), debit: cost, credit: 0 }, { code: inventoryCode(product), debit: 0, credit: cost });
      const net = Math.max(0, item.net * qty / Math.max(1, item.qty));
      revenue.set(revenueCode(product), (revenue.get(revenueCode(product)) ?? 0) + net);
      stockMoves.push({ id: safeId(`pos-sale-m-${invoiceId}-${item.id}`), date, type: "sale", productId: item.productId, variantId: item.variantId, qty, unitCost: fifo.unitCost, totalCost: cost, estimatedCost: fifo.estimatedQty > 0, referenceType: "pos_invoice", referenceId: invoice.invoiceNumber, createdAt: new Date().toISOString(), createdBy: actor });
    }
    const netRevenue = [...revenue.values()].reduce((s, n) => s + n, 0);
    const tendered = Math.max(0, invoice.total - (invoice.change ?? 0));
    let changeToDeduct = invoice.change ?? 0;
    const paymentDebits = new Map<string, number>();
    for (const payment of invoice.payments) {
      const code = payment.method === "cash" ? "1010" : payment.method === "card" ? "1020" : payment.method === "mobile_banking" ? "1030" : "1100";
      const deduction = Math.min(changeToDeduct, payment.method === "cash" ? payment.amount : 0);
      changeToDeduct -= deduction;
      const paid = Math.max(0, payment.amount - deduction);
      paymentDebits.set(code, (paymentDebits.get(code) ?? 0) + paid);
    }
    if (!invoice.payments.length) paymentDebits.set("1010", tendered);
    for (const [code, amount] of paymentDebits) if (amount > 0) lines.unshift({ code, debit: round2(amount), credit: 0 });
    for (const [code, amount] of revenue) lines.push({ code, debit: 0, credit: amount });
    if (invoice.vat > 0) lines.push({ code: "2040", debit: 0, credit: invoice.vat });
    if (invoice.deliveryCharge > 0) lines.push({ code: "4010", debit: 0, credit: invoice.deliveryCharge });
    // Cash/card tender may include VAT; the journal balances against the full invoice total.
    const creditTotal = netRevenue + invoice.vat + invoice.deliveryCharge;
    if (tendered > creditTotal) lines.push({ code: "4010", debit: 0, credit: round2(tendered - creditTotal) });
    if (creditTotal > tendered) lines.push({ code: "4040", debit: round2(creditTotal - tendered), credit: 0 });
    const entry = await insertJournal({ id: `AUTO-POS-${invoice.invoiceNumber}`, source: "pos_sale", sourceId: invoiceId, date, ref: invoice.invoiceNumber, narration: `POS sale · ${invoice.invoiceNumber}`, lines });
    if (entry) for (const movement of stockMoves) { movement.journalEntryId = entry.id; await insertRecord(client, "inventory_movements", movement, actor); }
    if (entry && stockMoves.length) await bumpRev(client, "inventory_movements");
    if (stockMoves.length) await bumpRev(client, "inventory_cost_layers");
  }

  // Only goods physically returned in resellable condition re-enter inventory.
  for (const [returnId, change] of changes.pos_returns ?? []) {
    const ret = change.after;
    if (!ret || change.before) continue;
    const invoiceChanges: Map<string, Change<PosInvoice>> = changes.pos_invoices ?? new Map<string, Change<PosInvoice>>();
    const invoiceChange = [...invoiceChanges].find(([, c]) => c.after?.id === ret.invoiceId)?.[1];
    const invoice = invoiceChange?.after;
    const lines: JournalEntryInputLine[] = [{ code: "4020", debit: ret.creditValue, credit: 0 }, { code: "1010", debit: 0, credit: ret.creditValue }];
    const movements: InventoryMovement[] = [];
    for (const item of ret.items.filter((i: PosReturn["items"][number]) => i.condition === "resellable")) {
      const sourceItem = invoice?.items.find((i: PosInvoice["items"][number]) => i.id === item.invoiceItemId);
      const unitCost = sourceItem?.cost ?? 0;
      const amount = round2(unitCost * item.qty);
      const returnedProduct = await getProduct(item.productId);
      if (!returnedProduct) throw new Error(`Product ${item.productId} is missing for return ${ret.returnNumber}.`);
      lines.push({ code: inventoryCode(returnedProduct), debit: amount, credit: 0 }, { code: cogsCode(returnedProduct), debit: 0, credit: amount });
      const layer: InventoryCostLayer = { id: safeId(`return-layer-${returnId}-${item.id}`), productId: item.productId, variantId: item.variantId, qty: item.qty, remainingQty: item.qty, unitCost, totalCost: amount, landedCost: 0, receivedAt: dateOf(new Date().toISOString()), source: "adjustment_in", sourceId: returnId };
      await insertRecord(client, "inventory_cost_layers", layer, actor);
      movements.push({ id: safeId(`return-m-${returnId}-${item.id}`), date: dateOf(new Date().toISOString()), type: "return_in", productId: item.productId, variantId: item.variantId, qty: item.qty, unitCost, totalCost: amount, referenceType: "pos_return", referenceId: ret.returnNumber, createdAt: new Date().toISOString(), createdBy: actor });
    }
    const entry = await insertJournal({ id: `AUTO-RETURN-${ret.returnNumber}`, source: "return", sourceId: returnId, date: dateOf(new Date().toISOString()), ref: ret.returnNumber, narration: `POS return · ${ret.returnNumber}`, lines });
    if (entry) for (const movement of movements) { movement.journalEntryId = entry.id; await insertRecord(client, "inventory_movements", movement, actor); }
    if (entry) { await bumpRev(client, "inventory_movements"); await bumpRev(client, "inventory_cost_layers"); }
  }

  for (const [adjustmentId, change] of changes.stock_adjustments ?? []) {
    const adjustment = change.after;
    if (!adjustment || adjustment.status !== "posted" || change.before?.status === "posted") continue;
    const date = dateOf(adjustment.date);
    const lines: JournalEntryInputLine[] = [];
    const movements: InventoryMovement[] = [];
    for (const [index, item] of adjustment.lines.entries()) {
      if (!item.diffQty) continue;
      const product = await getProduct(item.productId);
      if (!product) throw new Error(`Product ${item.productId} is missing for adjustment ${adjustment.adjustmentNumber}.`);
      const amount = round2(Math.abs(item.amount || item.diffQty * item.unitCost));
      if (item.diffQty > 0) {
        lines.push({ code: inventoryCode(product), debit: amount, credit: 0 }, { code: config.adjustmentAccountCode, debit: 0, credit: amount });
        const layer: InventoryCostLayer = { id: safeId(`adjustment-layer-${adjustmentId}-${index}`), productId: item.productId, variantId: item.variantId, warehouseId: adjustment.warehouseId, qty: item.diffQty, remainingQty: item.diffQty, unitCost: item.unitCost, totalCost: amount, landedCost: 0, receivedAt: date, source: "adjustment_in", sourceId: adjustmentId };
        await insertRecord(client, "inventory_cost_layers", layer, actor);
        movements.push({ id: safeId(`adjustment-m-${adjustmentId}-${index}`), date, type: "adjustment_in", productId: item.productId, variantId: item.variantId, warehouseId: adjustment.warehouseId, qty: item.diffQty, unitCost: item.unitCost, totalCost: amount, referenceType: "stock_adjustment", referenceId: adjustment.adjustmentNumber, createdAt: new Date().toISOString(), createdBy: actor });
      } else {
        const { rows } = await client.query<{ id: string; data: InventoryCostLayer; version: number }>("select id,data,version from app_records where collection='inventory_cost_layers' and data->>'variantId'=$1 and (data->>'remainingQty')::numeric>0 order by data->>'receivedAt',id for update", [item.variantId]);
        const fifo = consumeFifo(rows.map((r) => r.data), Math.abs(item.diffQty), item.unitCost);
        for (const row of rows) {
          const next = fifo.layers.find((l) => l.id === row.id);
          if (next && next.remainingQty !== row.data.remainingQty) await client.query("update app_records set data=$3::jsonb,version=version+1,updated_at=now(),updated_by=$4 where collection='inventory_cost_layers' and id=$1 and version=$2", [row.id, row.version, JSON.stringify(next), actor]);
        }
        lines.push({ code: config.adjustmentAccountCode, debit: fifo.totalCost, credit: 0 }, { code: inventoryCode(product), debit: 0, credit: fifo.totalCost });
        movements.push({ id: safeId(`adjustment-m-${adjustmentId}-${index}`), date, type: "adjustment_out", productId: item.productId, variantId: item.variantId, warehouseId: adjustment.warehouseId, qty: item.diffQty, unitCost: fifo.unitCost, totalCost: fifo.totalCost, estimatedCost: fifo.estimatedQty > 0, referenceType: "stock_adjustment", referenceId: adjustment.adjustmentNumber, createdAt: new Date().toISOString(), createdBy: actor });
      }
    }
    const entry = await insertJournal({ id: `AUTO-ADJ-${adjustment.adjustmentNumber}`, source: "stock_adjustment", sourceId: adjustmentId, date, ref: adjustment.adjustmentNumber, narration: adjustment.narration || `Stock adjustment · ${adjustment.adjustmentNumber}`, lines });
    if (entry) {
      adjustment.journalEntryId = entry.id;
      await client.query("update app_records set data=jsonb_set(data,'{journalEntryId}',to_jsonb($2::text),true),version=version+1,updated_at=now(),updated_by=$3 where collection='stock_adjustments' and id=$1", [adjustmentId, entry.id, actor]);
      for (const movement of movements) { movement.journalEntryId = entry.id; await insertRecord(client, "inventory_movements", movement, actor); }
      await bumpRev(client, "stock_adjustments");
      if (movements.length) { await bumpRev(client, "inventory_movements"); await bumpRev(client, "inventory_cost_layers"); }
    }
  }
}

interface JournalEntryInputLine { code: string; debit: number; credit: number; memo?: string }
