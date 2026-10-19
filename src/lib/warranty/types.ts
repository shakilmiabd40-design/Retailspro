export type WarrantyStatus = "active" | "expired" | "claimed" | "closed" | "void";

export type ClaimStatus = "submitted" | "approved" | "rejected" | "in_service" | "replaced" | "refunded" | "closed";

export interface WarrantyClaim {
  id: string;
  /** e.g. CLM-2001 (prefix from Settings → Invoice & Numbering). Older claims have none. */
  claimNumber?: string;
  issueType: string;
  description?: string;
  status: ClaimStatus;
  resolutionNotes?: string;
  submittedAt: string;
  closedAt?: string;
}

export interface Warranty {
  id: string;
  warrantyNumber: string;
  /** The order — or, when `source` is "pos", the POS invoice — this warranty was issued for. */
  orderId: string;
  /** Order number, or the POS invoice number. */
  orderNumber: string;
  /** Where it came from. Older records don't have it and are orders. */
  source?: "order" | "pos";
  customerName: string;
  customerPhone: string;
  productId: string;
  productName: string;
  variantId: string;
  color: string;
  size: string;
  sku: string;
  qty: number;
  startDate: string;
  endDate: string;
  status: WarrantyStatus;
  voidReason?: string;
  claims: WarrantyClaim[];
  createdAt: string;
}
