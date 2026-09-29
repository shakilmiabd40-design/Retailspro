/**
 * Inventory notification contract — shared by the engine, the store and the UI.
 * The wire format (snake_case) is produced by `toPayload()` in ./engine.ts.
 */

export type InventoryStatus =
  | "on_target"
  | "monitor"
  | "replenish"
  | "critical"
  | "out_of_stock"
  | "hold_blocked"
  | "in_progress"
  | "complete";

/** The stock-level ladder, worst to best. A subset of InventoryStatus. */
export type StockLevel = "out_of_stock" | "critical" | "replenish" | "monitor" | "on_target";

export type Severity = "info" | "warning" | "critical";
export type Channel = "in_app" | "email" | "push" | "sms";
export type OwnerRole = "purchasing" | "warehouse" | "quality" | "sales" | "management";
export type ThresholdType = "reorder_point" | "emergency_threshold" | "monitor_band" | "zero_stock";
export type NotificationState = "open" | "acknowledged" | "resolved";
export type Resolution = "stock_recovered" | "hold_released" | "superseded" | "no_longer_tracked" | "manual";
export type HoldReason = "inactive_product" | "inactive_variant";

export interface EscalationRule {
  ifUnacknowledgedMinutes: number;
  notify: string[];
}

export interface ActivityLogEntry {
  id: string;
  at: string;
  label: string;
  detail?: string;
}

export interface InventoryNotification {
  id: string;
  status: InventoryStatus;
  severity: Severity;

  // Item identity
  itemId: string; // product id
  variantId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  locationId: string;

  // Quantities at the moment the status changed
  quantityOnHand: number; // available to sell = physical stock − reserved
  physicalStock: number;
  reserved: number;

  thresholdType: ThresholdType | null;
  thresholdValue: number | null;

  timestamp: string; // ISO 8601
  source: string;

  // Actionable context
  suggestedAction: string;
  suggestedQty?: number;
  workflowId?: string;
  ownerRole: OwnerRole;
  assignee?: string;
  escalationRule?: EscalationRule;
  relatedDocuments: string[];
  make?: string;
  specification?: string;
  reasonCode?: HoldReason;
  channels: Channel[];

  // Lifecycle
  state: NotificationState;
  read: boolean;
  acknowledgedAt?: string;
  resolvedAt?: string;
  resolution?: Resolution;
  escalatedAt?: string;
  activity: ActivityLogEntry[];
}

export interface StatusTransition {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  from: InventoryStatus | null;
  to: InventoryStatus;
  quantityOnHand: number;
  timestamp: string;
  actor: string; // "system" or the person who acted
  note?: string;
}

/** Last known status per variant — what transitions are detected against. */
export interface TrackedState {
  status: InventoryStatus;
  level: StockLevel;
  since: string;
}

export interface NotificationsData {
  notifications: InventoryNotification[];
  states: Record<string, TrackedState>;
  history: StatusTransition[];
}

export interface NotificationSettings {
  /** Available units at or below this → Replenish. */
  reorderPoint: number;
  /** Monitor band = reorderPoint × this. */
  monitorMultiplier: number;
  /** Available units at or below this → Critical. */
  emergencyThreshold: number;
  /** Recovering out of a status needs this much headroom over its threshold (prevents flapping). */
  hysteresisPct: number;
  /** Suggested PO quantity tops stock up to reorderPoint × this. */
  orderUpToMultiplier: number;
  /** Minutes before an unacknowledged notification escalates, per status. 0 = never. */
  escalationMinutes: Partial<Record<InventoryStatus, number>>;
  /** Statuses in this list never generate a new notification (the live board/status still updates as normal). Empty = every category on. */
  disabledStatuses: InventoryStatus[];
  locationId: string;
}

export const EMPTY_DATA: NotificationsData = { notifications: [], states: {}, history: [] };
