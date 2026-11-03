export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
export type NormalBalance = "debit" | "credit";
export type JournalStatus = "draft" | "posted" | "reversed";
export type PeriodStatus = "open" | "closed" | "locked";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense",
};

export interface ChartOfAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
  parentId?: string | null;
  controlAccount: boolean;
  allowManual: boolean;
  isSystem: boolean;
  archived?: boolean;
  description?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface JournalLine {
  id: string;
  accountId: string;
  accountCode?: string;
  accountName?: string;
  debit: number;
  credit: number;
  memo?: string;
  costCenter?: string;
}

export interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  ref?: string;
  narration: string;
  source: "manual" | "po_receipt" | "supplier_invoice" | "sale" | "pos_sale" | "return" | "stock_adjustment" | "transfer" | "reversal" | "system";
  sourceId?: string;
  status: JournalStatus;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  createdAt: string;
  createdBy?: string;
  postedAt?: string;
  postedBy?: string;
  reversedByEntryId?: string;
  notes?: string;
}

export interface InventoryMovement {
  id: string;
  date: string;
  type: "purchase" | "sale" | "return_in" | "return_out" | "adjustment_in" | "adjustment_out" | "transfer_in" | "transfer_out";
  productId: string;
  variantId: string;
  warehouseId?: string;
  qty: number;
  unitCost: number;
  totalCost: number;
  referenceType?: string;
  referenceId?: string;
  journalEntryId?: string;
  createdAt: string;
  createdBy?: string;
}

export interface InventoryCostLayer {
  id: string;
  productId: string;
  variantId: string;
  warehouseId?: string;
  qty: number;
  remainingQty: number;
  unitCost: number;
  totalCost: number;
  landedCost: number;
  receivedAt: string;
  source: "po_receipt" | "adjustment_in" | "opening";
  sourceId?: string;
}

export interface StockAdjustment {
  id: string;
  adjustmentNumber: string;
  date: string;
  reason: string;
  status: "draft" | "pending_approval" | "approved" | "posted" | "rejected";
  warehouseId?: string;
  lines: { productId: string; variantId: string; systemQty: number; countedQty: number; diffQty: number; unitCost: number; amount: number; reason?: string }[];
  totalAmount: number;
  narration?: string;
  createdAt: string;
  createdBy?: string;
  approvedAt?: string;
  approvedBy?: string;
  journalEntryId?: string;
}

export interface GrniEntry {
  id: string;
  poId: string;
  poNumber: string;
  supplierId: string;
  receiptId?: string;
  productId: string;
  variantId: string;
  qtyReceived: number;
  qtyInvoiced: number;
  unitCost: number;
  amount: number;
  invoicedAmount: number;
  status: "open" | "partial" | "invoiced" | "closed";
  receivedAt: string;
}

export interface ApInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  poId?: string;
  date: string;
  dueDate?: string;
  currency: "BDT";
  subtotal: number;
  tax: number;
  freight: number;
  otherCharges: number;
  total: number;
  paidAmount: number;
  status: "draft" | "posted" | "partial" | "paid" | "void";
  grniLink: { grniId: string; qty: number; amount: number }[];
  journalEntryId?: string;
  createdAt: string;
}

export interface AccountingPeriod {
  id: string;
  from: string;
  to: string;
  status: PeriodStatus;
  closedAt?: string;
  closedBy?: string;
  lockedAt?: string;
  lockedBy?: string;
  reopenedAt?: string;
  reopenedBy?: string;
  notes?: string;
}

export const DEFAULT_COA: Omit<ChartOfAccount, "id" | "createdAt">[] = [
  { code: "1000", name: "Assets", type: "asset", normalBalance: "debit", controlAccount: true, allowManual: false, isSystem: true },
  { code: "1010", name: "Cash in Hand", type: "asset", normalBalance: "debit", parentCode: "1000", controlAccount: false, allowManual: true, isSystem: true },
  { code: "1020", name: "Bank Accounts", type: "asset", normalBalance: "debit", parentCode: "1000", controlAccount: true, allowManual: true, isSystem: true },
  { code: "1030", name: "Mobile Banking (bKash/Nagad)", type: "asset", normalBalance: "debit", parentCode: "1000", controlAccount: true, allowManual: true, isSystem: true },
  { code: "1100", name: "Accounts Receivable", type: "asset", normalBalance: "debit", parentCode: "1000", controlAccount: true, allowManual: false, isSystem: true },
  { code: "1200", name: "Inventory - Finished Goods", type: "asset", normalBalance: "debit", parentCode: "1000", controlAccount: true, allowManual: false, isSystem: true },
  { code: "1210", name: "Inventory - Raw Materials", type: "asset", normalBalance: "debit", parentCode: "1000", controlAccount: false, allowManual: false, isSystem: true },
  { code: "1300", name: "GRNI (Goods Received Not Invoiced)", type: "asset", normalBalance: "debit", parentCode: "1000", controlAccount: true, allowManual: false, isSystem: true },
  { code: "2000", name: "Liabilities", type: "liability", normalBalance: "credit", controlAccount: true, allowManual: false, isSystem: true },
  { code: "2010", name: "Accounts Payable", type: "liability", normalBalance: "credit", parentCode: "2000", controlAccount: true, allowManual: false, isSystem: true },
  { code: "2020", name: "Accrued Expenses", type: "liability", normalBalance: "credit", parentCode: "2000", controlAccount: false, allowManual: true, isSystem: true },
  { code: "3000", name: "Equity", type: "equity", normalBalance: "credit", controlAccount: true, allowManual: false, isSystem: true },
  { code: "3010", name: "Owner Capital", type: "equity", normalBalance: "credit", parentCode: "3000", controlAccount: false, allowManual: true, isSystem: true },
  { code: "3020", name: "Retained Earnings", type: "equity", normalBalance: "credit", parentCode: "3000", controlAccount: true, allowManual: false, isSystem: true },
  { code: "4000", name: "Revenue", type: "revenue", normalBalance: "credit", controlAccount: true, allowManual: false, isSystem: true },
  { code: "4010", name: "Sales Revenue", type: "revenue", normalBalance: "credit", parentCode: "4000", controlAccount: true, allowManual: false, isSystem: true },
  { code: "4020", name: "Sales Returns", type: "revenue", normalBalance: "debit", parentCode: "4000", controlAccount: false, allowManual: false, isSystem: true },
  { code: "4030", name: "Other Income", type: "revenue", normalBalance: "credit", parentCode: "4000", controlAccount: false, allowManual: true, isSystem: true },
  { code: "5000", name: "Cost of Goods Sold", type: "expense", normalBalance: "debit", controlAccount: true, allowManual: false, isSystem: true },
  { code: "5010", name: "COGS - Finished Goods", type: "expense", normalBalance: "debit", parentCode: "5000", controlAccount: true, allowManual: false, isSystem: true },
  { code: "5020", name: "Purchase Price Variance", type: "expense", normalBalance: "debit", parentCode: "5000", controlAccount: false, allowManual: false, isSystem: true },
  { code: "5100", name: "Inventory Adjustments / Shrinkage", type: "expense", normalBalance: "debit", controlAccount: false, allowManual: false, isSystem: true },
  { code: "6000", name: "Operating Expenses", type: "expense", normalBalance: "debit", controlAccount: true, allowManual: true, isSystem: true },
  { code: "6010", name: "Rent", type: "expense", normalBalance: "debit", parentCode: "6000", controlAccount: false, allowManual: true, isSystem: true },
  { code: "6020", name: "Salaries & Wages", type: "expense", normalBalance: "debit", parentCode: "6000", controlAccount: false, allowManual: true, isSystem: true },
  { code: "6030", name: "Marketing & Advertising", type: "expense", normalBalance: "debit", parentCode: "6000", controlAccount: false, allowManual: true, isSystem: true },
  { code: "6040", name: "Courier & Delivery Expense", type: "expense", normalBalance: "debit", parentCode: "6000", controlAccount: false, allowManual: true, isSystem: true },
  { code: "6050", name: "Utilities", type: "expense", normalBalance: "debit", parentCode: "6000", controlAccount: false, allowManual: true, isSystem: true },
  { code: "6060", name: "Packaging", type: "expense", normalBalance: "debit", parentCode: "6000", controlAccount: false, allowManual: true, isSystem: true },
] as any;
