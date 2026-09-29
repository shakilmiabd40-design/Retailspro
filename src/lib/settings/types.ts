/**
 * Settings module contracts — shared by the settings store, the access
 * (users & roles) store, the audit log and every settings page.
 */

// ---- Permissions ----------------------------------------------------------

export type ModuleKey =
  | "products"
  | "inventory"
  | "pos"
  | "orders"
  | "courier"
  | "settlement"
  | "suppliers"
  | "purchase"
  | "returns"
  | "warranty"
  | "reports"
  | "accounting"
  | "settings"
  | "audit";

export type ActionKey =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "approve"
  | "export"
  | "update_status"
  | "financial"
  | "settlement"
  | "settings";

export type PermissionMap = Partial<Record<ModuleKey, ActionKey[]>>;

export interface Role {
  id: string;
  name: string;
  description: string;
  /** Presets shipped with the app. They can be edited but not deleted. */
  builtIn: boolean;
  /** Super Admin: always holds every permission and cannot be edited. */
  locked?: boolean;
  permissions: PermissionMap;
  createdAt: string;
}

export type UserStatus = "active" | "blocked";

export interface AppUser {
  id: string;
  name: string;
  /** Email or username — unique. */
  email: string;
  phone: string;
  roleId: string;
  status: UserStatus;
  lastLogin?: string;
  notes?: string;
  mustResetPassword: boolean;
  createdAt: string;
  /** True once the user has signed in or has audit-log activity — such users are deactivated, not deleted. */
  hasHistory?: boolean;
}

// ---- Settings sections ----------------------------------------------------

export type DateFormat = "DD-MM-YYYY" | "MM-DD-YYYY" | "YYYY-MM-DD";

export interface CompanySettings {
  shopName: string;
  /** Data-URL (uploaded) or an https URL. */
  logo: string;
  phone: string;
  email: string;
  address: string;
  tradeLicense: string;
  vatNumber: string;
  currency: "BDT";
  timezone: string;
  dateFormat: DateFormat;
  numberGrouping: "international" | "lakh";
  decimals: 0 | 1 | 2;
  defaultLanguage: "en" | "bn";
  maintenanceMode: boolean;
}

export interface CategoryMeta {
  parent?: string;
  status: "active" | "inactive";
}

export interface ProductSettings {
  genders: string[];
  shoeTypes: string[];
  materials: string[];
  categoryMeta: Record<string, CategoryMeta>;
  skuAutoGenerate: boolean;
  /** Tokens: {BRAND} {PRODUCT} {COLOR} {SIZE} */
  skuFormat: string;
  barcodeType: "code128" | "ean13";
  /** Master on/off — when off, barcode is typed in by hand exactly like before. */
  barcodeAutoGenerate: boolean;
  /** "sku" only makes sense with Code 128 (barcode = the variant's SKU). */
  barcodeMode: "sku" | "sequence" | "random";
  /** Digits only when barcodeType is ean13. Free text (kept short) for Code 128. */
  barcodePrefix: string;
  /** "sequence"/"random" digit count for Code 128 only — EAN-13 always fills to 12 body digits + 1 check digit. */
  barcodeDigits: number;
}

export interface InventorySettings {
  trackInventory: boolean;
  allowNegativeStock: boolean;
  reserveStockOn: "pending" | "processing";
  adjustmentReasons: string[];
  /** Units at or below which a variant shows a "Low stock" badge. */
  lowStockThreshold: number;
  lowStockReportEnabled: boolean;
  stockChangeRequiresReason: boolean;
  stockChangeRequiresApproval: boolean;
}

export type CancellableStatus = "pending" | "processing";

export interface OrderSettings {
  cancelAllowedStatuses: CancellableStatus[];
  cancelReasons: string[];
  requireCancelNote: boolean;
  insideCityCharge: number;
  subCityCharge: number;
  outsideCityCharge: number;
  freeDeliveryEnabled: boolean;
  freeDeliveryMinSubtotal: number;
  returnReceivedMandatory: boolean;
}

export interface Courier {
  id: string;
  name: string;
  phone: string;
  defaultForwardCost: number;
  defaultReturnCost: number;
  status: "active" | "inactive";
}

export type SettlementMode = "auto" | "manual" | "auto_override";

export interface CourierSettings {
  couriers: Courier[];
  settlementMode: SettlementMode;
  allowMultiOrderPayout: boolean;
  requirePayoutReference: boolean;
}

export type POStatusKey = "draft" | "approved" | "sent" | "partially_received" | "received" | "cancelled";

export interface PurchaseSettings {
  transitions: Record<POStatusKey, POStatusKey[]>;
  unitCostEditableAtReceiving: boolean;
  preventOverReceive: boolean;
  defaultSupplierId: string;
  defaultNotes: string;
}

export interface ReturnSettings {
  customerOnlyDelivered: boolean;
  customerReasons: string[];
  supplierRequirePoRef: boolean;
  supplierReasons: string[];
}

export interface WarrantySettings {
  durationDays: number;
  voidOnReturn: boolean;
  claimIssueTypes: string[];
}

export interface NumberingSettings {
  order: string;
  po: string;
  return: string;
  warranty: string;
  claim: string;
  posInvoice: string;
  posReturn: string;
  posSession: string;
}

export interface InvoiceTemplateSettings {
  showLogo: boolean;
  showAddress: boolean;
  showCustomerPhone: boolean;
  showCustomerAddress: boolean;
  showDeliveryCharge: boolean;
  showPaidAmount: boolean;
  terms: string;
}

export interface PrintSettings {
  paperSize: "a4" | "pos";
  labelWidthMm: number;
  labelHeightMm: number;
  labelShowName: boolean;
  labelShowPrice: boolean;
  labelShowSku: boolean;
}

export interface InvoiceSettings {
  numbering: NumberingSettings;
  template: InvoiceTemplateSettings;
  print: PrintSettings;
}

export type NotificationEventKey = "lowStock" | "newOrder" | "returnRequest" | "settlementReminder";

export type PosPaymentMethodKey = "cash" | "card" | "mobile_banking";

export interface PosSettings {
  /** Scanner input: an exact barcode / SKU match goes straight into the cart. */
  enableBarcodeScan: boolean;
  defaultPaymentMethod: PosPaymentMethodKey;
  allowSplitPayment: boolean;
  /** Highest total discount (% of the sale) a role may give. Roles not listed use defaultMaxDiscountPct. */
  maxDiscountByRole: Record<string, number>;
  defaultMaxDiscountPct: number;
  /** 0 = VAT is not used. Added on top of walk-in sales; delivery orders go through Orders, which has no tax. */
  vatPercent: number;
  receiptHeader: string;
  receiptFooter: string;
  returnPolicyText: string;
  showWarrantyOnReceipt: boolean;
  /** Days after the sale a return is accepted (0 = no limit). Roles with "Override limits" can go beyond it. */
  returnWindowDays: number;
  /** When on, a walk-in sale can't be completed without a customer phone (warranties are linked to it). */
  requirePhoneForWarranty: boolean;
}

export interface NotificationEventPref {
  enabled: boolean;
  inApp: boolean;
  email: boolean;
  sms: boolean;
  /** Role ids that receive it. */
  roleIds: string[];
}

export interface NotificationPrefs {
  events: Record<NotificationEventKey, NotificationEventPref>;
}

export interface SecuritySettings {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  forceResetOnFirstLogin: boolean;
  sessionTimeoutMinutes: number;
  twoFactorEnabled: boolean;
  maxLoginAttempts: number;
  lockoutMinutes: number;
}

export interface SettingsData {
  company: CompanySettings;
  products: ProductSettings;
  inventory: InventorySettings;
  orders: OrderSettings;
  courier: CourierSettings;
  purchase: PurchaseSettings;
  returns: ReturnSettings;
  warranty: WarrantySettings;
  invoice: InvoiceSettings;
  pos: PosSettings;
  notifications: NotificationPrefs;
  security: SecuritySettings;
}

export type SettingsSection = keyof SettingsData;

// ---- Audit log ------------------------------------------------------------

export type AuditAction = "create" | "edit" | "delete" | "status_change" | "import" | "export" | "security";

export const AUDIT_MODULES = [
  "Accounting",
  "Orders",
  "Products",
  "Stock",
  "Purchase Orders",
  "Suppliers",
  "Returns",
  "Warranty",
  "Settlement",
  "Settings",
  "Users & Roles",
  "Security",
  "Data",
  "POS",
] as const;
export type AuditModule = (typeof AUDIT_MODULES)[number];

export interface AuditEntry {
  id: string;
  at: string;
  userId: string;
  userName: string;
  module: AuditModule;
  action: AuditAction;
  /** What was touched, e.g. "Order ORD-10241" or "Company settings". */
  entity: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  device?: string;
  /** Recorded natively (settings, users, stock…) vs. rebuilt from a module's own history. */
  source: "native" | "derived";
}
