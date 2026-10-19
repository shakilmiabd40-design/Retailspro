export type POStatus = "draft" | "approved" | "sent" | "partially_received" | "received" | "cancelled";

export interface POItem {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  color: string;
  size: string;
  sku: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitCost: number;
}

export interface ReceivingLine {
  variantId: string;
  qty: number;
  unitCost: number;
}

export interface ReceivingEntry {
  id: string;
  date: string;
  items: ReceivingLine[];
  note?: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  supplierId: string;
  status: POStatus;
  poDate: string;
  expectedDate?: string;
  notes?: string;
  items: POItem[];
  shippingCost: number;
  discount: number;
  receivings: ReceivingEntry[];
  createdAt: string;
  updatedAt: string;
}
