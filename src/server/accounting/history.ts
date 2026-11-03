import type { Account, LedgerEntry } from "@/lib/accounting/types";
import type { AccountingConfig, ApInvoice, ChartOfAccount, GrniEntry, InventoryCostLayer, InventoryMovement, JournalEntry, JournalLine } from "@/lib/accounting/gl-types";
import type { Order } from "@/lib/orders/types";
import type { Product } from "@/lib/products/types";
import type { PurchaseOrder } from "@/lib/purchase-orders/types";
import type { PosInvoice } from "@/lib/pos/types";
import { allocateLandedCost, consumeFifo } from "@/lib/accounting/fifo";
import { DEFAULT_ACCOUNTING_CONFIG, DEFAULT_COA } from "@/lib/accounting/gl-types";
import { actualCourierCost, grossRevenue } from "@/lib/orders/utils";

type Row<T> = { id: string; data: T };
export interface HistoricalRows {
  accounts: Row<Account>[];
  ledger: Row<LedgerEntry>[];
  products: Row<Product>[];
  purchaseOrders: Row<PurchaseOrder>[];
  orders: Row<Order>[];
  invoices: Row<PosInvoice>[];
  apInvoices: Row<ApInvoice>[];
}
export interface HistoricalLedger {
  accounts: ChartOfAccount[];
  journals: JournalEntry[];
  layers: InventoryCostLayer[];
  movements: InventoryMovement[];
  grni: GrniEntry[];
  estimates: string[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dateOf = (s: string | undefined) => (s || "1970-01-01").slice(0, 10);
const idFor = (s: string) => `hist-${s}`.slice(0, 120);

function seededAccounts(existing: ChartOfAccount[], legacy: Row<Account>[], now: string): { accounts: ChartOfAccount[]; legacyCodes: Map<string, string> } {
  const byCode = new Map(existing.map((a) => [a.code, a]));
  const ids = new Map<string, string>();
  for (const d of DEFAULT_COA as (typeof DEFAULT_COA[number] & { parentCode?: string })[]) {
    ids.set(d.code, byCode.get(d.code)?.id ?? idFor(`coa-${d.code}`));
  }
  const accounts = [
    ...existing,
    ...(DEFAULT_COA as (typeof DEFAULT_COA[number] & { parentCode?: string })[])
      .filter((d) => !byCode.has(d.code))
      .map((d) => ({ ...d, id: ids.get(d.code)!, parentId: d.parentCode ? ids.get(d.parentCode) : undefined, createdAt: now } as ChartOfAccount)),
  ];
  const used = new Set(accounts.map((a) => a.code));
  const legacyCodes = new Map<string, string>();
  let code = 1040;
  for (const { id, data } of legacy) {
    while (used.has(String(code))) code += 1;
    const assigned = String(code++);
    used.add(assigned);
    legacyCodes.set(id, assigned);
    accounts.push({ id: idFor(`legacy-account-${id}`), code: assigned, name: data.name, type: "asset", normalBalance: "debit", parentId: ids.get("1000"), controlAccount: false, allowManual: true, isSystem: false, createdAt: now });
  }
  return { accounts, legacyCodes };
}

function line(id: string, accounts: ChartOfAccount[], code: string, debit: number, credit: number, memo?: string): JournalLine {
  const account = accounts.find((a) => a.code === code);
  if (!account) throw new Error(`Required chart of account ${code} is missing.`);
  return { id, accountId: account.id, accountCode: code, accountName: account.name, debit: round2(debit), credit: round2(credit), memo };
}

function journal(input: Pick<JournalEntry, "id" | "entryNumber" | "date" | "ref" | "narration" | "source" | "sourceId" | "lines">): JournalEntry {
  const totalDebit = round2(input.lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(input.lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) throw new Error(`Historical journal ${input.ref} is unbalanced.`);
  return { ...input, entryNumber: input.entryNumber || input.ref || input.id, status: "posted", totalDebit, totalCredit, createdAt: new Date().toISOString(), createdBy: "Historical conversion", postedAt: new Date().toISOString(), postedBy: "Historical conversion" };
}

/**
 * Converts the records currently retained by RetailsPro into an append-only FIFO subledger and
 * balanced journals. It uses stable IDs so conversion can be retried safely by the API.
 */
export function convertHistory(rows: HistoricalRows, existingCoa: ChartOfAccount[], config: AccountingConfig = DEFAULT_ACCOUNTING_CONFIG): HistoricalLedger {
  const now = new Date().toISOString();
  const seeded = seededAccounts(existingCoa, rows.accounts, now);
  const accounts = seeded.accounts;
  const journals: JournalEntry[] = [];
  const layers: InventoryCostLayer[] = [];
  const movements: InventoryMovement[] = [];
  const grni: GrniEntry[] = [];
  const grniById = new Map<string, GrniEntry>();
  const estimates: string[] = [];
  const layerByVariant = new Map<string, InventoryCostLayer[]>();
  const accountById = new Map(rows.accounts.map((r) => [r.id, r.data]));

  const receipts: { date: string; id: string; productId: string; variantId: string; qty: number; unitCost: number; ref: string }[] = [];
  for (const { id: poId, data: po } of rows.purchaseOrders) {
    for (const receipt of po.receivings ?? []) {
      const date = dateOf(receipt.date || po.poDate);
      const lines = (receipt.items ?? []).flatMap((r) => {
        const item = po.items.find((x) => x.variantId === r.variantId);
        return item && r.qty > 0 ? [{ qty: r.qty, unitCost: r.unitCost, productId: item.productId, variantId: item.variantId }] : [];
      });
      const freight = po.receivings.length ? (po.shippingCost || 0) / po.receivings.length : 0;
      const landed = allocateLandedCost(lines, freight);
      for (const [i, r] of landed.entries()) {
        const id = `${poId}:${receipt.id}:${i}`;
        receipts.push({ date, id, productId: r.productId, variantId: r.variantId, qty: r.qty, unitCost: r.landedUnitCost, ref: po.poNumber });
        const entry: GrniEntry = { id: idFor(`grni-${id}`), poId, poNumber: po.poNumber, supplierId: po.supplierId, receiptId: receipt.id, productId: r.productId, variantId: r.variantId, qtyReceived: r.qty, qtyInvoiced: 0, unitCost: r.landedUnitCost, amount: round2(r.qty * r.landedUnitCost), invoicedAmount: 0, status: "open", receivedAt: date };
        grni.push(entry);
        grniById.set(entry.id, entry);
      }
    }
  }

  const productMap = new Map(rows.products.map((p) => [p.id, p.data]));
  const inventoryCode = (productId: string) => config.categoryAccounts[productMap.get(productId)?.category ?? ""]?.inventory || "1200";
  const cogsCode = (productId: string) => config.categoryAccounts[productMap.get(productId)?.category ?? ""]?.cogs || "5010";
  const revenueCode = (category: string) => config.categoryAccounts[category]?.revenue || "4010";
  const outbound: { date: string; id: string; type: "sale" | "pos_sale"; ref: string; narration?: string; lines: { productId: string; variantId: string; qty: number; fallback: number; revenue: number }[]; revenue: number; tax?: number; receipts?: { code: string; amount: number }[]; deliveryRevenue?: number; courierCost?: number }[] = [];
  for (const { id, data: o } of rows.orders) {
    if (o.status === "refuse_return") {
      const courierCost = actualCourierCost(o);
      if (courierCost > 0) outbound.push({ date: dateOf(o.updatedAt || o.createdAt), id, type: "sale", ref: o.orderNumber, narration: `Refused parcel courier loss · ${o.orderNumber}`, revenue: 0, courierCost, lines: [] });
      continue;
    }
    if (o.status === "partial_delivered") {
      estimates.push(`${o.orderNumber}: partial delivery has no per-item kept quantities; collected amount is recognized as revenue and COGS requires review.`);
      outbound.push({ date: dateOf(o.delivery.deliveryDate || o.updatedAt || o.createdAt), id, type: "sale", ref: o.orderNumber, revenue: o.delivery.customerPaid, courierCost: actualCourierCost(o), lines: [] });
      continue;
    }
    if (o.status !== "delivered") continue;
    const items = (o.items ?? []).map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty, fallback: productMap.get(i.productId)?.variants.find((v) => v.id === i.variantId)?.cost ?? productMap.get(i.productId)?.costPrice ?? 0, revenue: round2(i.price * i.qty - i.discount) }));
    const itemRevenue = items.reduce((s, i) => s + i.revenue, 0);
    outbound.push({ date: dateOf(o.delivery.deliveryDate || o.createdAt), id, type: "sale", ref: o.orderNumber, revenue: grossRevenue(o), deliveryRevenue: Math.max(0, grossRevenue(o) - itemRevenue), courierCost: actualCourierCost(o), lines: items });
  }
  for (const { id, data: inv } of rows.invoices) {
    if (inv.status !== "completed" || inv.saleType === "delivery") continue;
    const returnedValue = inv.items.reduce((s, i) => s + (i.returnedValue || 0), 0);
    const netValue = Math.max(0, inv.total - returnedValue);
    const paymentSum = inv.payments.reduce((s, p) => s + p.amount, 0);
    const receipts = inv.payments.map((p) => ({
      code: p.method === "cash" ? "1010" : p.method === "card" ? "1020" : p.method === "mobile_banking" ? "1030" : "1100",
      amount: paymentSum > 0 ? round2(netValue * p.amount / paymentSum) : 0,
    }));
    const netByItem = inv.items.map((i) => Math.max(0, i.net - (i.returnedQty ? i.net * i.returnedQty / Math.max(i.qty, 1) : 0)));
    outbound.push({ date: dateOf(inv.createdAt), id, type: "pos_sale", ref: inv.invoiceNumber, revenue: Math.max(0, inv.total - returnedValue - (inv.vat || 0)), tax: Math.max(0, (inv.vat || 0) - inv.items.reduce((s, i) => s + ((i.vat || 0) * (i.returnedQty || 0) / Math.max(i.qty, 1)), 0)), receipts, lines: inv.items.map((i, index) => ({ productId: i.productId, variantId: i.variantId, qty: Math.max(0, i.qty - (i.returnedQty || 0)), fallback: i.cost, revenue: netByItem[index] })).filter((i) => i.qty > 0) });
  }
  outbound.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  const receiptsByVariant = new Map<string, typeof receipts>();
  const boughtByVariant = new Map<string, number>();
  const soldByVariant = new Map<string, number>();
  for (const r of receipts) {
    const group = receiptsByVariant.get(r.variantId) ?? [];
    group.push(r);
    receiptsByVariant.set(r.variantId, group);
    boughtByVariant.set(r.variantId, (boughtByVariant.get(r.variantId) ?? 0) + r.qty);
  }
  // Aggregate sales once instead of rescanning every order for every variant.
  for (const sale of outbound) for (const item of sale.lines) {
    soldByVariant.set(item.variantId, (soldByVariant.get(item.variantId) ?? 0) + item.qty);
  }
  for (const { id, data: p } of rows.products) for (const v of p.variants) {
    const bought = boughtByVariant.get(v.id) ?? 0;
    const sold = soldByVariant.get(v.id) ?? 0;
    const openingQty = Math.max(0, v.stock + sold - bought);
    const list: InventoryCostLayer[] = [];
    if (openingQty > 0) {
      const open: InventoryCostLayer = { id: idFor(`open-${v.id}`), productId: id, variantId: v.id, qty: openingQty, remainingQty: openingQty, unitCost: v.cost, totalCost: round2(openingQty * v.cost), landedCost: 0, receivedAt: "1970-01-01", source: "opening" };
      list.push(open);
      estimates.push(`${p.name} · ${v.color}/${v.size}: opening ${openingQty} units valued at current cost.`);
    }
    for (const r of receiptsByVariant.get(v.id) ?? []) list.push({ id: idFor(`receipt-${r.id}`), productId: r.productId, variantId: r.variantId, qty: r.qty, remainingQty: r.qty, unitCost: r.unitCost, totalCost: round2(r.qty * r.unitCost), landedCost: 0, receivedAt: r.date, source: "po_receipt", sourceId: r.ref });
    layerByVariant.set(v.id, list);
    layers.push(...list);
  }

  const coa = (code: string) => accounts.find((a) => a.code === code)!;
  for (const opening of layers.filter((layer) => layer.source === "opening" && layer.totalCost > 0)) {
    journals.push(journal({ id: idFor(`opening-inventory-j-${opening.variantId}`), entryNumber: `HIST-IO-${opening.variantId.slice(0, 40)}`, date: dateOf(opening.receivedAt), ref: opening.variantId, narration: "Opening inventory balance", source: "system", sourceId: opening.id, lines: [line(`l-${opening.id}-dr`, accounts, inventoryCode(opening.productId), opening.totalCost, 0), line(`l-${opening.id}-cr`, accounts, "3010", 0, opening.totalCost)] }));
  }
  for (const r of receipts) {
    const cost = round2(r.qty * r.unitCost);
    if (!cost) continue;
    const j = journal({ id: idFor(`receipt-j-${r.id}`), entryNumber: `HIST-${r.id.slice(0, 45)}`, date: r.date, ref: r.ref, narration: `Inventory receipt ${r.ref}`, source: "po_receipt", sourceId: r.id, lines: [line(`l-${r.id}-i`, accounts, inventoryCode(r.productId), cost, 0), line(`l-${r.id}-g`, accounts, "2030", 0, cost)] });
    journals.push(j);
    movements.push({ id: idFor(`receipt-m-${r.id}`), date: r.date, type: "purchase", productId: r.productId, variantId: r.variantId, qty: r.qty, unitCost: r.unitCost, totalCost: cost, referenceType: "purchase_order", referenceId: r.ref, journalEntryId: j.id, createdAt: now });
  }

  for (const { id, data: invoice } of rows.apInvoices) {
    if (!["posted", "partial", "paid"].includes(invoice.status)) continue;
    const linkedAmount = round2(invoice.grniLink.reduce((sum, link) => sum + link.amount, 0));
    const lines: JournalLine[] = [];
    if (linkedAmount > 0) lines.push(line(`l-${id}-grni`, accounts, "2030", linkedAmount, 0));
    const variance = round2(invoice.total - linkedAmount);
    if (variance > 0) lines.push(line(`l-${id}-ppv`, accounts, "5020", variance, 0));
    else if (variance < 0) lines.push(line(`l-${id}-ppv-credit`, accounts, "5020", 0, Math.abs(variance)));
    lines.push(line(`l-${id}-ap`, accounts, "2010", 0, invoice.total));
    journals.push(journal({ id: idFor(`ap-j-${id}`), entryNumber: `HIST-AP-${id.slice(0, 40)}`, date: invoice.date, ref: invoice.invoiceNumber, narration: `Supplier invoice ${invoice.invoiceNumber}`, source: "supplier_invoice", sourceId: id, lines }));
    for (const link of invoice.grniLink) {
      const entry = grniById.get(link.grniId);
      if (!entry) continue;
      entry.qtyInvoiced = Math.min(entry.qtyReceived, entry.qtyInvoiced + link.qty);
      entry.invoicedAmount = round2(entry.invoicedAmount + link.amount);
      entry.status = entry.qtyInvoiced >= entry.qtyReceived ? "invoiced" : "partial";
    }
  }

  for (const sale of outbound) {
    const firstMovementIndex = movements.length;
    const cogsByCode = new Map<string, number>();
    const inventoryByCode = new Map<string, number>();
    const revenueByCode = new Map<string, number>();
    for (const item of sale.lines) {
      const fifo = consumeFifo(layerByVariant.get(item.variantId) ?? [], item.qty, item.fallback);
      layerByVariant.set(item.variantId, fifo.layers);
      const cogsAccountCode = cogsCode(item.productId);
      cogsByCode.set(cogsAccountCode, (cogsByCode.get(cogsAccountCode) ?? 0) + fifo.totalCost);
      const inventoryAccountCode = inventoryCode(item.productId);
      inventoryByCode.set(inventoryAccountCode, (inventoryByCode.get(inventoryAccountCode) ?? 0) + fifo.totalCost);
      const category = productMap.get(item.productId)?.category ?? "";
      const revenueAccountCode = revenueCode(category);
      revenueByCode.set(revenueAccountCode, (revenueByCode.get(revenueAccountCode) ?? 0) + item.revenue);
      if (fifo.estimatedQty) estimates.push(`${sale.ref} · ${item.productId}/${item.variantId}: ${fifo.estimatedQty} units use current cost because no FIFO layer exists.`);
      for (const alloc of fifo.allocations) movements.push({ id: idFor(`sale-m-${sale.id}-${item.variantId}-${alloc.layerId}`), date: sale.date, type: "sale", productId: item.productId, variantId: item.variantId, qty: alloc.qty, unitCost: alloc.unitCost, totalCost: alloc.totalCost, referenceType: sale.type, referenceId: sale.ref, createdAt: now });
    }
    const collected = sale.type === "pos_sale" ? (sale.receipts ?? []).reduce((sum, r) => sum + r.amount, 0) : 0;
    const itemRevenue = [...revenueByCode.values()].reduce((sum, amount) => sum + amount, 0);
    const journalLines = sale.type === "sale"
      ? [line(`l-${sale.id}-dr`, accounts, "1100", sale.revenue, 0), ...[...revenueByCode].map(([code, amount], i) => line(`l-${sale.id}-rev-${i}`, accounts, code, 0, amount)), ...(sale.deliveryRevenue ? [line(`l-${sale.id}-delivery-rev`, accounts, "4010", 0, sale.deliveryRevenue)] : []), ...(sale.revenue > itemRevenue + (sale.deliveryRevenue || 0) ? [line(`l-${sale.id}-other-rev`, accounts, "4010", 0, sale.revenue - itemRevenue - (sale.deliveryRevenue || 0))] : [])]
      : [
          ...(sale.receipts ?? []).filter((r) => r.amount > 0).map((r, i) => line(`l-${sale.id}-pay-${i}`, accounts, r.code, r.amount, 0)),
          ...(sale.revenue + (sale.tax || 0) > collected ? [line(`l-${sale.id}-ar`, accounts, "1100", sale.revenue + (sale.tax || 0) - collected, 0)] : []),
          ...[...revenueByCode].map(([code, amount], i) => line(`l-${sale.id}-rev-${i}`, accounts, code, 0, amount)),
          ...(sale.revenue > itemRevenue ? [line(`l-${sale.id}-other-rev`, accounts, "4010", 0, sale.revenue - itemRevenue)] : []),
          ...((sale.tax || 0) > 0 ? [line(`l-${sale.id}-vat`, accounts, "2040", 0, sale.tax || 0)] : []),
        ];
    for (const [code, amount] of cogsByCode) if (amount > 0) journalLines.push(line(`l-${sale.id}-cogs-${code}`, accounts, code, amount, 0));
    for (const [code, amount] of inventoryByCode) if (amount > 0) journalLines.push(line(`l-${sale.id}-inv-${code}`, accounts, code, 0, amount));
    if ((sale.courierCost || 0) > 0) journalLines.push(line(`l-${sale.id}-courier-expense`, accounts, "6040", sale.courierCost || 0, 0), line(`l-${sale.id}-courier-payable`, accounts, "2050", 0, sale.courierCost || 0));
    const saleJournal = journal({ id: idFor(`sale-j-${sale.id}`), entryNumber: `HIST-S-${sale.id.slice(0, 45)}`, date: sale.date, ref: sale.ref, narration: sale.narration ?? `Historical sale ${sale.ref}`, source: sale.type, sourceId: sale.id, lines: journalLines });
    journals.push(saleJournal);
    for (let i = firstMovementIndex; i < movements.length; i += 1) movements[i].journalEntryId = saleJournal.id;
  }

  for (const { id, data: e } of rows.ledger) {
    const savedAccount = accountById.get(e.accountId ?? "");
    const cashCode = seeded.legacyCodes.get(e.accountId ?? "") ?? (savedAccount ? (savedAccount.type === "bank" ? "1020" : savedAccount.type === "mobile" ? "1030" : "1010") : "1010");
    const expenseCode = e.kind === "expense" ? "6000" : e.kind === "income" ? "4030" : "3010";
    let lines: JournalLine[];
    if (e.kind === "expense" || e.kind === "owner_out") lines = [line(`l-${id}-dr`, accounts, expenseCode, e.amount, 0), line(`l-${id}-cr`, accounts, cashCode, 0, e.amount)];
    else if (e.kind === "transfer") {
      const dest = accountById.get(e.toAccountId ?? "");
      const destCode = seeded.legacyCodes.get(e.toAccountId ?? "") ?? (dest?.type === "bank" ? "1020" : dest?.type === "mobile" ? "1030" : "1010");
      lines = [line(`l-${id}-to`, accounts, destCode, e.amount, 0), line(`l-${id}-from`, accounts, cashCode, 0, e.amount)];
    } else if (e.kind === "receipt") lines = [line(`l-${id}-dr`, accounts, cashCode, e.amount, 0), line(`l-${id}-cr`, accounts, "1100", 0, e.amount)];
    else lines = [line(`l-${id}-dr`, accounts, cashCode, e.amount, 0), line(`l-${id}-cr`, accounts, expenseCode, 0, e.amount)];
    journals.push(journal({ id: idFor(`legacy-${id}`), entryNumber: `HIST-L-${id.slice(0, 45)}`, date: e.date, ref: e.reference || id, narration: `${e.category || e.kind}${e.party ? ` · ${e.party}` : ""}`, source: "system", sourceId: id, lines }));
  }

  for (const { id, data: a } of rows.accounts) {
    if (!a.openingBalance) continue;
    const code = seeded.legacyCodes.get(id) ?? (a.type === "bank" ? "1020" : a.type === "mobile" ? "1030" : "1010");
    const amount = Math.abs(a.openingBalance);
    const lines = a.openingBalance >= 0
      ? [line(`l-${id}-dr`, accounts, code, amount, 0), line(`l-${id}-cr`, accounts, "3010", 0, amount)]
      : [line(`l-${id}-dr`, accounts, "3010", amount, 0), line(`l-${id}-cr`, accounts, code, 0, amount)];
    journals.push(journal({ id: idFor(`opening-j-${id}`), entryNumber: `HIST-O-${id.slice(0, 45)}`, date: "1970-01-01", ref: a.name, narration: `Opening balance: ${a.name}`, source: "system", sourceId: id, lines }));
  }

  // Replace pre-sale layer snapshots with the final FIFO balances.
  const finalById = new Map([...layerByVariant.values()].flatMap((group) => group.map((layer) => [layer.id, layer] as const)));
  const finalLayers = layers.map((layer) => finalById.get(layer.id) ?? layer);
  return { accounts, journals, layers: finalLayers, movements, grni, estimates: [...new Set(estimates)] };
}
