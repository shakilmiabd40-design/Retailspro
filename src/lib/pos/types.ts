import type { PosPaymentMethodKey } from "@/lib/settings/types";

export type { PosPaymentMethodKey };

/** What a customer hands over. "exchange_credit" is the value of goods returned in the same exchange — not real money. */
export type PaymentMethod = PosPaymentMethodKey | "exchange_credit";

/** How money goes back to the customer on a return / void. */
export type RefundMethod = "cash" | "card" | "mobile_banking" | "adjustment";

export type SaleType = "walk_in" | "delivery";
export type PosInvoiceStatus = "completed" | "void";
export type DiscountType = "fixed" | "percent";

export interface PosPayment {
  id: string;
  method: PaymentMethod;
  /** Amount handed over. For cash this may exceed what was owed — the difference is `change` on the invoice. */
  amount: number;
  /** Card last-4 / mobile banking transaction id. */
  reference?: string;
}

export interface DiscountLogEntry {
  id: string;
  at: string;
  byId: string;
  by: string;
  scope: "line" | "cart";
  /** "Air Runner (Black/42)" or "Whole cart". */
  target: string;
  from: { type: DiscountType; value: number };
  to: { type: DiscountType; value: number };
  /** Currency value of the discount after the change. */
  amount: number;
  /** True when the person went above their role's limit (they hold "Override limits"). */
  override: boolean;
}

export interface PosInvoiceItem {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  color: string;
  size: string;
  sku: string;
  price: number;
  /** Unit cost at the time of sale (for profit). */
  cost: number;
  qty: number;
  /** Line-level discount (currency). */
  discount: number;
  /** This line's share of the cart-level discount (currency). */
  cartDiscount: number;
  /** price × qty − discount − cartDiscount */
  net: number;
  vat: number;
  /** Units taken back by POS returns / exchanges. */
  returnedQty: number;
  /** Money already credited back for this line (net + VAT of the returned units). */
  returnedValue: number;
}

export interface PosCustomer {
  walkIn: boolean;
  name: string;
  phone?: string;
  address?: string;
  district?: string;
  area?: string;
  note?: string;
}

export interface PosInvoice {
  id: string;
  invoiceNumber: string;
  status: PosInvoiceStatus;
  saleType: SaleType;
  sessionId: string;
  cashierId: string;
  cashierName: string;
  customer: PosCustomer;
  items: PosInvoiceItem[];

  subtotal: number;
  /** Sum of line-level discounts. */
  itemDiscount: number;
  /** Cart-level discount. */
  cartDiscount: number;
  vatPercent: number;
  vat: number;
  deliveryCharge: number;
  /** Grand total. For a delivery sale this is the expected COD. */
  total: number;

  payments: PosPayment[];
  /** Everything handed over (sum of payments). */
  tendered: number;
  /** Cash handed back. */
  change: number;

  /** Delivery sales: the Orders-module order created for it. */
  orderId?: string;
  orderNumber?: string;
  /** Exchange sales: the return that funded part of this sale. */
  exchangeOfReturnId?: string;
  exchangeOfReturnNumber?: string;

  warrantyEndsAt?: string;
  discountLog: DiscountLogEntry[];
  notes?: string;
  createdAt: string;

  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
}

// ---- sessions --------------------------------------------------------------

export interface CashMovement {
  id: string;
  type: "in" | "out";
  amount: number;
  /** "manual" = petty cash in / expense; the others are written by the POS itself. */
  kind: "manual" | "refund";
  reason: string;
  note?: string;
  /** Who OK'd a cash-out (optional). */
  approvedBy?: string;
  at: string;
  by: string;
  /** Return number / invoice number that caused a refund movement. */
  ref?: string;
}

export interface PosSession {
  id: string;
  sessionNumber: string;
  status: "open" | "closed";
  cashierId: string;
  cashierName: string;
  openedAt: string;
  openingCash: number;
  movements: CashMovement[];
  closedAt?: string;
  /** Snapshots taken when the session was closed. */
  expectedCash?: number;
  countedCash?: number;
  difference?: number;
  closingNote?: string;
}

// ---- held sales -----------------------------------------------------------

export interface CartLine {
  /** variantId — one line per variant. */
  key: string;
  productId: string;
  productName: string;
  imageUrl?: string;
  variantId: string;
  color: string;
  size: string;
  sku: string;
  barcode?: string;
  price: number;
  cost: number;
  qty: number;
  discountType: DiscountType;
  discountValue: number;
}

export interface CartDiscount {
  type: DiscountType;
  value: number;
}

export interface CartCustomer {
  walkIn: boolean;
  name: string;
  phone: string;
  address: string;
  note: string;
}

/** Everything about a sale-in-progress. Held sales store exactly this. */
export interface SaleDraft {
  lines: CartLine[];
  cartDiscount: CartDiscount;
  customer: CartCustomer;
  discountLog: DiscountLogEntry[];
}

export interface HeldSale extends SaleDraft {
  id: string;
  name: string;
  cashierId: string;
  cashierName: string;
  createdAt: string;
}

// ---- returns --------------------------------------------------------------

export type ReturnCondition = "resellable" | "damaged";

export interface PosReturnItem {
  id: string;
  invoiceItemId: string;
  productId: string;
  productName: string;
  variantId: string;
  color: string;
  size: string;
  sku: string;
  qty: number;
  /** Money credited for these units (net + VAT). */
  value: number;
  reason: string;
  condition: ReturnCondition;
}

export interface PosReturn {
  id: string;
  returnNumber: string;
  type: "return" | "exchange";
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone?: string;
  items: PosReturnItem[];
  /** Value of everything returned. */
  creditValue: number;
  /** Exchange: the new sale that took the credit. */
  exchangeInvoiceId?: string;
  exchangeInvoiceNumber?: string;
  exchangeTotal?: number;
  /** Extra money the customer paid on an exchange (0 when nothing was owed). */
  customerPaid?: number;
  /** Money handed back to the customer (0 when the credit was used up). */
  refundAmount: number;
  refundMethod: RefundMethod;
  notes?: string;
  sessionId: string;
  processedById: string;
  processedBy: string;
  createdAt: string;
}
