export type ReturnType = "customer" | "supplier";
export type ReturnStatus = "requested" | "approved" | "rejected" | "received" | "closed";
export type ItemCondition = "new" | "used" | "damaged";
export type CustomerReturnAction = "refund" | "exchange" | "warranty_claim";

export interface ReturnItem {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  color: string;
  size: string;
  sku: string;
  qty: number;
  reason: string;
  condition: ItemCondition;
}

export interface ReturnRecord {
  id: string;
  returnNumber: string;
  type: ReturnType;
  referenceId: string;
  referenceLabel: string;
  partyName: string;
  status: ReturnStatus;
  items: ReturnItem[];
  action?: CustomerReturnAction;
  refundAmount?: number;
  refundMethod?: string;
  transportCost?: number;
  notes?: string;
  returnReceived: boolean;
  returnReceivedAt?: string;
  createdAt: string;
  updatedAt: string;
}
