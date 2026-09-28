import type { ReturnStatus, ReturnType } from "./types";

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: "Requested",
  approved: "Approved",
  rejected: "Rejected",
  received: "Received",
  closed: "Closed",
};

export const RETURN_TYPE_LABELS: Record<ReturnType, string> = {
  customer: "Customer Return",
  supplier: "Supplier Return",
};

/** Delete rule: once received/closed, no hard delete — only void/reversal. */
export function canDeleteReturn(status: ReturnStatus): boolean {
  return status !== "received" && status !== "closed";
}
