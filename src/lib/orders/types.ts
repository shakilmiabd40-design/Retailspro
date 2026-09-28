export type OrderStatus =
  | "pending"
  | "processing"
  | "in_transit"
  | "delivered"
  | "partial_delivered"
  | "refuse_return"
  | "cancelled";

export type KnownCancelReason =
  | "customer_changed_mind"
  | "wrong_order"
  | "duplicate_order"
  | "customer_requested_cancellation"
  | "unable_to_contact"
  | "other";

/** Older orders store a key from the list above; newer ones store the reason text chosen in Settings → Orders. */
export type CancelReason = KnownCancelReason | (string & {});

export type SettlementStatus = "settled" | "pending";

export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productEmoji?: string;
  variantId: string;
  color: string;
  size: string;
  sku: string;
  price: number;
  qty: number;
  /** Currency amount knocked off this line's total. */
  discount: number;
}

export interface CourierInfo {
  company: string;
  trackingId: string;
  dispatchDate?: string;
  forwardCost: number;
  returnCost: number;
  otherCost: number;
}

export interface DeliveryResult {
  customerPaid: number;
  deliveryDate?: string;
  settlementStatus?: SettlementStatus;
}

export interface ReturnInfo {
  returnRequired: boolean;
  returnReceived: boolean;
  returnDate?: string;
}

export interface CancellationInfo {
  cancelledAt?: string;
  cancelledBy?: string;
  reason?: CancelReason;
  notes?: string;
}

export interface ActivityEntry {
  id: string;
  at: string;
  label: string;
  detail?: string;
  /** Who performed the action (from the signed-in user at the time). Older entries don't have it. */
  by?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;

  // Section A — customer information
  customerName: string;
  phone: string;
  altPhone?: string;
  address: string;
  district?: string;
  area?: string;
  notes?: string;

  // Section B — products
  items: OrderItem[];

  // Section C — amounts
  deliveryCharge: number;

  /** Set when the order was created from the POS (delivery sale). */
  source?: "pos" | "api";
  posInvoiceId?: string;
  posInvoiceNumber?: string;
  /** Set when the order came in through the public API (e.g. from the online store). */
  channel?: string;
  /** The other system's own order id — unique per channel, used to make retries safe. */
  externalId?: string;

  courier: CourierInfo;
  delivery: DeliveryResult;
  returnInfo: ReturnInfo;
  cancellation: CancellationInfo;
  activity: ActivityEntry[];

  createdAt: string;
  updatedAt: string;
}
