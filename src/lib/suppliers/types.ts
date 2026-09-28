export type SupplierStatus = "active" | "inactive";

export interface Supplier {
  id: string;
  name: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  status: SupplierStatus;
  /** Soft-deleted (kept for history, hidden from normal lists). */
  archived: boolean;
  address?: string;
  city?: string;
  notes?: string;
  paymentTerms?: string;
  currency?: string;
  openingBalance?: number;
  createdAt: string;
}
