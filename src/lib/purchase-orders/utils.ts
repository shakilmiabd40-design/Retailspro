import type { POStatus, PurchaseOrder } from "./types";

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  draft: "Draft",
  approved: "Approved",
  sent: "Sent to Supplier",
  partially_received: "Partially Received",
  received: "Received",
  cancelled: "Cancelled",
};

export function poSubtotal(po: PurchaseOrder): number {
  return po.items.reduce((sum, i) => sum + i.qtyOrdered * i.unitCost, 0);
}

export function poGrandTotal(po: PurchaseOrder): number {
  return poSubtotal(po) + po.shippingCost - po.discount;
}

export function totalOrderedQty(po: PurchaseOrder): number {
  return po.items.reduce((sum, i) => sum + i.qtyOrdered, 0);
}

export function totalReceivedQty(po: PurchaseOrder): number {
  return po.items.reduce((sum, i) => sum + i.qtyReceived, 0);
}

export function isFullyReceived(po: PurchaseOrder): boolean {
  return po.items.length > 0 && po.items.every((i) => i.qtyReceived >= i.qtyOrdered);
}

export function hasAnyReceiving(po: PurchaseOrder): boolean {
  return po.receivings.length > 0;
}

/** Delete rule: a PO with any receiving history can only be cancelled, never deleted. */
export function canDeletePo(po: PurchaseOrder): boolean {
  return !hasAnyReceiving(po);
}

export function canEditPo(po: PurchaseOrder): boolean {
  return po.status === "draft" || po.status === "approved" || po.status === "sent";
}

export function canReceivePo(po: PurchaseOrder): boolean {
  return (po.status === "approved" || po.status === "sent" || po.status === "partially_received") && !isFullyReceived(po);
}

export function canCancelPo(po: PurchaseOrder): boolean {
  return po.status !== "received" && po.status !== "cancelled";
}
