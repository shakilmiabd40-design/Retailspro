import type { Courier, POStatusKey, SettingsData } from "./types";
import { PRESET_ROLES } from "./permissions";
import { FALLBACK_SHOP_NAME } from "./shop";

export const DEFAULT_CANCEL_REASONS = [
  "Customer Changed Mind",
  "Wrong Order",
  "Duplicate Order",
  "Customer Requested Cancellation",
  "Unable to Contact",
  "Other",
];

export const DEFAULT_TRANSITIONS: Record<POStatusKey, POStatusKey[]> = {
  draft: ["approved", "cancelled"],
  approved: ["sent", "partially_received", "received", "cancelled"],
  sent: ["partially_received", "received", "cancelled"],
  partially_received: ["received", "cancelled"],
  received: [],
  cancelled: [],
};

export const PO_STATUS_ORDER: POStatusKey[] = ["draft", "approved", "sent", "partially_received", "received", "cancelled"];

export const DEFAULT_COURIERS: Courier[] = [
  { id: "cr-steadfast", name: "Steadfast", phone: "", defaultForwardCost: 100, defaultReturnCost: 80, status: "active" },
  { id: "cr-pathao", name: "Pathao Courier", phone: "", defaultForwardCost: 90, defaultReturnCost: 70, status: "active" },
  { id: "cr-redx", name: "RedX", phone: "", defaultForwardCost: 110, defaultReturnCost: 90, status: "active" },
];

export const TIMEZONES = [
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "UTC",
];

const allRoleIds = PRESET_ROLES.map((r) => r.id);

export const DEFAULT_SETTINGS: SettingsData = {
  company: {
    shopName: FALLBACK_SHOP_NAME,
    logo: "",
    phone: "",
    email: "",
    address: "",
    tradeLicense: "",
    vatNumber: "",
    currency: "BDT",
    timezone: "Asia/Dhaka",
    dateFormat: "DD-MM-YYYY",
    numberGrouping: "international",
    decimals: 0,
    defaultLanguage: "en",
    maintenanceMode: false,
  },
  products: {
    genders: ["Men", "Women", "Unisex", "Kids"],
    shoeTypes: ["Sneakers", "Loafers", "Sandals", "Boots", "Formal", "Sports"],
    materials: ["Leather", "Synthetic", "Canvas", "Mesh", "Rubber"],
    categoryMeta: {},
    skuAutoGenerate: true,
    skuFormat: "{BRAND}-{PRODUCT}-{COLOR}-{SIZE}",
    barcodeType: "code128",
    barcodeAutoGenerate: false,
    barcodeMode: "sku",
    barcodePrefix: "",
    barcodeDigits: 6,
  },
  inventory: {
    trackInventory: true,
    allowNegativeStock: false,
    reserveStockOn: "pending",
    adjustmentReasons: ["Damaged", "Lost / Missing", "Found in recount", "Data entry correction", "Opening stock", "Sample / Gift"],
    lowStockThreshold: 10,
    lowStockReportEnabled: true,
    stockChangeRequiresReason: true,
    stockChangeRequiresApproval: false,
  },
  orders: {
    cancelAllowedStatuses: ["pending", "processing"],
    cancelReasons: DEFAULT_CANCEL_REASONS,
    requireCancelNote: false,
    insideCityCharge: 70,
    subCityCharge: 100,
    outsideCityCharge: 130,
    freeDeliveryEnabled: false,
    freeDeliveryMinSubtotal: 5000,
    returnReceivedMandatory: true,
  },
  courier: {
    couriers: DEFAULT_COURIERS,
    settlementMode: "auto_override",
    allowMultiOrderPayout: true,
    requirePayoutReference: false,
  },
  purchase: {
    transitions: DEFAULT_TRANSITIONS,
    unitCostEditableAtReceiving: true,
    preventOverReceive: true,
    defaultSupplierId: "",
    defaultNotes: "",
  },
  returns: {
    customerOnlyDelivered: true,
    customerReasons: ["Wrong size", "Defective / damaged", "Not as described", "Changed mind", "Wrong item sent"],
    supplierRequirePoRef: false,
    supplierReasons: ["Defective batch", "Wrong item received", "Damaged in transit", "Excess stock"],
  },
  warranty: {
    durationDays: 365,
    voidOnReturn: true,
    claimIssueTypes: ["Manufacturing defect", "Sole detachment", "Stitching failure", "Material defect", "Other"],
  },
  invoice: {
    numbering: { order: "ORD-", po: "PO-", return: "RET-", warranty: "WAR-", claim: "CLM-", posInvoice: "INV-", posReturn: "PRT-", posSession: "SES-" },
    template: {
      showLogo: true,
      showAddress: true,
      showCustomerPhone: true,
      showCustomerAddress: true,
      showDeliveryCharge: true,
      showPaidAmount: true,
      terms: "Goods once sold are exchangeable within 7 days with the invoice. Warranty applies as per policy.",
    },
    print: { paperSize: "a4", labelWidthMm: 50, labelHeightMm: 30, labelShowName: true, labelShowPrice: true, labelShowSku: true },
  },
  pos: {
    enableBarcodeScan: true,
    defaultPaymentMethod: "cash",
    allowSplitPayment: true,
    maxDiscountByRole: { "role-cashier": 5, "role-manager": 30 },
    defaultMaxDiscountPct: 10,
    vatPercent: 0,
    receiptHeader: "",
    receiptFooter: "Thank you for shopping with us!",
    returnPolicyText: "Exchange or return within 7 days with this receipt. Items must be unused and in the original box.",
    showWarrantyOnReceipt: true,
    returnWindowDays: 7,
    requirePhoneForWarranty: false,
  },
  notifications: {
    events: {
      lowStock: { enabled: true, inApp: true, email: false, sms: false, roleIds: ["role-super-admin", "role-manager", "role-inventory"] },
      newOrder: { enabled: true, inApp: true, email: false, sms: false, roleIds: ["role-super-admin", "role-manager", "role-sales"] },
      returnRequest: { enabled: true, inApp: true, email: false, sms: false, roleIds: ["role-super-admin", "role-manager"] },
      settlementReminder: { enabled: false, inApp: true, email: false, sms: false, roleIds: ["role-super-admin", "role-accounts"] },
    },
  },
  security: {
    minPasswordLength: 8,
    requireUppercase: true,
    requireNumber: true,
    requireSymbol: false,
    forceResetOnFirstLogin: true,
    sessionTimeoutMinutes: 60,
    twoFactorEnabled: false,
    maxLoginAttempts: 5,
    lockoutMinutes: 15,
  },
};

export { allRoleIds };
