import type { Product } from "@/lib/products/types";
import type { PurchaseOrder } from "@/lib/purchase-orders/types";
import type {
  Channel,
  EscalationRule,
  HoldReason,
  InventoryNotification,
  InventoryStatus,
  NotificationSettings,
  NotificationsData,
  OwnerRole,
  Resolution,
  Severity,
  StatusTransition,
  StockLevel,
  ThresholdType,
  TrackedState,
} from "./types";

// ---- labels & static routing -----------------------------------------------

export const STATUS_LABELS: Record<InventoryStatus, string> = {
  on_target: "On Target",
  monitor: "Monitor",
  replenish: "Replenish",
  critical: "Critical",
  out_of_stock: "Out of Stock",
  hold_blocked: "Hold / Blocked",
  in_progress: "In Progress",
  complete: "Complete",
};

export const SEVERITY_FOR_STATUS: Record<InventoryStatus, Severity> = {
  on_target: "info",
  monitor: "info",
  replenish: "warning",
  critical: "critical",
  out_of_stock: "critical",
  hold_blocked: "warning",
  in_progress: "info",
  complete: "info",
};

export const OWNER_ROLE_LABELS: Record<OwnerRole, string> = {
  purchasing: "Purchasing",
  warehouse: "Warehouse",
  quality: "Quality",
  sales: "Sales",
  management: "Management",
};

export const CHANNEL_LABELS: Record<Channel, string> = { in_app: "In-app", email: "Email", push: "Push", sms: "SMS" };

const OWNER_FOR_STATUS: Record<InventoryStatus, OwnerRole> = {
  on_target: "purchasing",
  monitor: "purchasing",
  replenish: "purchasing",
  critical: "purchasing",
  out_of_stock: "purchasing",
  hold_blocked: "warehouse",
  in_progress: "purchasing",
  complete: "warehouse",
};

const ESCALATION_TARGET: Record<OwnerRole, string> = {
  purchasing: "procurement_lead",
  warehouse: "warehouse_lead",
  quality: "quality_manager",
  sales: "sales_lead",
  management: "operations_director",
};

/** Match urgency to medium: digests for calm states, push/SMS only where minutes matter. */
const CHANNELS_FOR_STATUS: Record<InventoryStatus, Channel[]> = {
  on_target: ["in_app"],
  monitor: ["in_app", "email"],
  replenish: ["in_app", "email"],
  critical: ["in_app", "push", "sms"],
  out_of_stock: ["in_app", "push"],
  hold_blocked: ["in_app", "email"],
  in_progress: ["in_app"],
  complete: ["in_app"],
};

export const NOTIFIABLE_STATUSES: InventoryStatus[] = [
  "critical",
  "out_of_stock",
  "replenish",
  "hold_blocked",
  "in_progress",
  "monitor",
  "complete",
];

export const DEFAULT_SETTINGS: NotificationSettings = {
  reorderPoint: 5,
  monitorMultiplier: 2, // Monitor ≤ 10, matching the "low stock" badge on the products page
  emergencyThreshold: 2,
  hysteresisPct: 10,
  orderUpToMultiplier: 4,
  escalationMinutes: { critical: 30, out_of_stock: 60, replenish: 120, hold_blocked: 240 },
  disabledStatuses: [],
  locationId: "main",
};

/** Whether a category is turned on in Settings → Notifications → Categories. */
export function isStatusEnabled(status: InventoryStatus, cfg: NotificationSettings): boolean {
  return !cfg.disabledStatuses.includes(status);
}

export function routeChannels(status: InventoryStatus): Channel[] {
  return CHANNELS_FOR_STATUS[status];
}

export function ownerRoleFor(status: InventoryStatus): OwnerRole {
  return OWNER_FOR_STATUS[status];
}

export function escalationFor(status: InventoryStatus, role: OwnerRole, cfg: NotificationSettings): EscalationRule | undefined {
  const minutes = cfg.escalationMinutes[status] ?? 0;
  return minutes > 0 ? { ifUnacknowledgedMinutes: minutes, notify: [ESCALATION_TARGET[role]] } : undefined;
}

export function escalationTargetFor(role: OwnerRole): string {
  return ESCALATION_TARGET[role];
}

// ---- stock-level evaluation (with hysteresis) ---------------------------------

const LEVEL_RANK: Record<StockLevel, number> = { out_of_stock: 0, critical: 1, replenish: 2, monitor: 3, on_target: 4 };

/** Highest available quantity that still counts as being *in* the given level. */
export function levelUpperBound(level: StockLevel, cfg: NotificationSettings): number {
  switch (level) {
    case "out_of_stock":
      return 0;
    case "critical":
      return cfg.emergencyThreshold;
    case "replenish":
      return cfg.reorderPoint;
    case "monitor":
      return Math.ceil(cfg.reorderPoint * cfg.monitorMultiplier);
    case "on_target":
      return Infinity;
  }
}

function rawLevel(available: number, cfg: NotificationSettings): StockLevel {
  if (available <= 0) return "out_of_stock";
  if (available <= levelUpperBound("critical", cfg)) return "critical";
  if (available <= levelUpperBound("replenish", cfg)) return "replenish";
  if (available <= levelUpperBound("monitor", cfg)) return "monitor";
  return "on_target";
}

/**
 * Getting worse is immediate. Getting better needs headroom over the level being left, so a unit
 * sold or returned at the boundary can't flip the status back and forth.
 */
export function evaluateLevel(available: number, cfg: NotificationSettings, prev?: StockLevel): StockLevel {
  const raw = rawLevel(available, cfg);
  if (!prev || LEVEL_RANK[raw] <= LEVEL_RANK[prev]) return raw;
  const upper = levelUpperBound(prev, cfg);
  const margin = prev === "out_of_stock" ? 0 : Math.max(1, Math.ceil((upper * cfg.hysteresisPct) / 100));
  return available > upper + margin ? raw : prev;
}

export function thresholdFor(status: InventoryStatus, cfg: NotificationSettings): { type: ThresholdType | null; value: number | null } {
  switch (status) {
    case "monitor":
      return { type: "monitor_band", value: levelUpperBound("monitor", cfg) };
    case "replenish":
      return { type: "reorder_point", value: cfg.reorderPoint };
    case "critical":
      return { type: "emergency_threshold", value: cfg.emergencyThreshold };
    case "out_of_stock":
      return { type: "zero_stock", value: 0 };
    default:
      return { type: null, value: null };
  }
}

// ---- snapshots of live inventory -----------------------------------------------

export interface SkuSnapshot {
  variantId: string;
  productId: string;
  productName: string;
  sku: string;
  color: string;
  size: string;
  brand?: string;
  specification: string;
  physicalStock: number;
  reserved: number;
  available: number;
  blocked: HoldReason | null;
  /** Units still to arrive on approved / sent / partially received purchase orders. */
  incoming: { qty: number; poId: string; poNumber: string } | null;
  /** Non-cancelled purchase orders that include this variant, newest first. */
  poNumbers: string[];
}

const OPEN_PO_STATUSES = ["approved", "sent", "partially_received"];

export function snapshotSkus(products: Product[], purchaseOrders: PurchaseOrder[]): SkuSnapshot[] {
  const incoming = new Map<string, { qty: number; poId: string; poNumber: string }>();
  const poNumbers = new Map<string, string[]>();
  const sortedPos = [...purchaseOrders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const po of sortedPos) {
    if (po.status === "cancelled") continue;
    for (const item of po.items) {
      poNumbers.set(item.variantId, [...(poNumbers.get(item.variantId) ?? []), po.poNumber]);
      if (!OPEN_PO_STATUSES.includes(po.status)) continue;
      const remaining = Math.max(0, item.qtyOrdered - item.qtyReceived);
      if (remaining === 0) continue;
      const cur = incoming.get(item.variantId);
      incoming.set(item.variantId, { qty: (cur?.qty ?? 0) + remaining, poId: cur?.poId ?? po.id, poNumber: cur?.poNumber ?? po.poNumber });
    }
  }

  const out: SkuSnapshot[] = [];
  for (const p of products) {
    for (const v of p.variants) {
      const inactive = p.status === "inactive" || v.status === "inactive";
      // Inactive with nothing on the shelf = discontinued; nothing to alert about.
      if (inactive && v.stock <= 0) continue;
      const reserved = v.reserved ?? 0;
      out.push({
        variantId: v.id,
        productId: p.id,
        productName: p.name,
        sku: v.sku,
        color: v.color,
        size: v.size,
        brand: p.brand || undefined,
        specification: [`${v.color} / ${v.size}`, p.shoeType, p.material].filter(Boolean).join(", "),
        physicalStock: v.stock,
        reserved,
        available: Math.max(0, v.stock - reserved),
        blocked: inactive ? (p.status === "inactive" ? "inactive_product" : "inactive_variant") : null,
        incoming: incoming.get(v.id) ?? null,
        poNumbers: (poNumbers.get(v.id) ?? []).slice(0, 3),
      });
    }
  }
  return out;
}

const SHORTAGE: StockLevel[] = ["out_of_stock", "critical", "replenish"];

export function effectiveStatus(snap: SkuSnapshot, level: StockLevel): InventoryStatus {
  if (snap.blocked) return "hold_blocked";
  if (SHORTAGE.includes(level) && snap.incoming) return "in_progress";
  return level;
}

/** One-shot status for display when no tracked state exists yet (no hysteresis). */
export function deriveStatus(snap: SkuSnapshot, cfg: NotificationSettings): InventoryStatus {
  return effectiveStatus(snap, evaluateLevel(snap.available, cfg));
}

// ---- building notifications -----------------------------------------------------

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function suggestedQtyFor(snap: SkuSnapshot, cfg: NotificationSettings): number {
  return Math.max(1, Math.ceil(cfg.reorderPoint * cfg.orderUpToMultiplier) - snap.available);
}

function suggestion(status: InventoryStatus, snap: SkuSnapshot, cfg: NotificationSettings): { text: string; qty?: number } {
  const name = `${snap.productName} (${snap.color}/${snap.size})`;
  switch (status) {
    case "monitor":
      return { text: `Watch ${name}: ${snap.available} available, reorder at ${cfg.reorderPoint}.` };
    case "replenish": {
      const qty = suggestedQtyFor(snap, cfg);
      return { text: `Create purchase order for ${qty} units of ${name}.`, qty };
    }
    case "critical": {
      const qty = suggestedQtyFor(snap, cfg);
      return { text: `Urgent: only ${snap.available} left. Order ${qty} units of ${name} now.`, qty };
    }
    case "out_of_stock": {
      const qty = suggestedQtyFor(snap, cfg);
      return { text: `${name} is sold out. Create purchase order for ${qty} units.`, qty };
    }
    case "hold_blocked":
      return { text: `${snap.physicalStock} units of ${name} are on hand but the item is inactive. Reactivate it or move the stock.` };
    case "in_progress":
      return { text: `${snap.incoming?.poNumber ?? "A purchase order"} has ${snap.incoming?.qty ?? 0} units on the way. Receive stock when it arrives.` };
    case "complete":
      return { text: `Restocked to ${snap.available} units. No action needed.` };
    default:
      return { text: "No action needed." };
  }
}

function sourceFor(status: InventoryStatus): string {
  if (status === "hold_blocked") return "catalog";
  if (status === "in_progress") return "purchasing";
  if (status === "complete") return "receiving";
  return "inventory_engine";
}

function buildNotification(status: InventoryStatus, snap: SkuSnapshot, cfg: NotificationSettings, now: string): InventoryNotification {
  const owner = ownerRoleFor(status);
  const threshold = thresholdFor(status, cfg);
  const advice = suggestion(status, snap, cfg);
  return {
    id: newId("notif"),
    status,
    severity: SEVERITY_FOR_STATUS[status],
    itemId: snap.productId,
    variantId: snap.variantId,
    productName: snap.productName,
    sku: snap.sku,
    color: snap.color,
    size: snap.size,
    locationId: cfg.locationId,
    quantityOnHand: snap.available,
    physicalStock: snap.physicalStock,
    reserved: snap.reserved,
    thresholdType: threshold.type,
    thresholdValue: threshold.value,
    timestamp: now,
    source: sourceFor(status),
    suggestedAction: advice.text,
    suggestedQty: advice.qty,
    workflowId: status === "in_progress" ? snap.incoming?.poNumber : undefined,
    ownerRole: owner,
    escalationRule: escalationFor(status, owner, cfg),
    relatedDocuments: snap.poNumbers,
    make: snap.brand,
    specification: snap.specification,
    reasonCode: status === "hold_blocked" ? (snap.blocked ?? undefined) : undefined,
    channels: routeChannels(status),
    state: status === "complete" ? "resolved" : "open",
    read: false,
    resolvedAt: status === "complete" ? now : undefined,
    resolution: status === "complete" ? "stock_recovered" : undefined,
    activity: [{ id: newId("act"), at: now, label: "Created", detail: `Status changed to ${STATUS_LABELS[status]}` }],
  };
}

/** Wire format from the developer guideline (snake_case, ISO 8601 timestamps). */
export function toPayload(n: InventoryNotification) {
  return {
    notification_id: n.id,
    status: STATUS_LABELS[n.status],
    severity: n.severity,
    item_id: n.itemId,
    sku: n.sku,
    location_id: n.locationId,
    quantity_on_hand: n.quantityOnHand,
    threshold_type: n.thresholdType,
    threshold_value: n.thresholdValue,
    timestamp: n.timestamp,
    source: n.source,
    suggested_action: n.suggestedAction,
    workflow_id: n.workflowId ?? null,
    owner_role: n.ownerRole,
    assignee: n.assignee ?? null,
    escalation_rule: n.escalationRule
      ? { if_unacknowledged_minutes: n.escalationRule.ifUnacknowledgedMinutes, notify: n.escalationRule.notify }
      : null,
    related_documents: n.relatedDocuments,
    make: n.make ?? null,
    specification: n.specification ?? null,
    channels: n.channels,
    state: n.state,
  };
}

// ---- sync: detect transitions and open / close notifications --------------------

const NOTIFY_ON_FIRST_SIGHT: InventoryStatus[] = ["replenish", "critical", "out_of_stock", "hold_blocked"];
const RECOVERABLE_FROM: InventoryStatus[] = ["replenish", "critical", "out_of_stock", "in_progress", "hold_blocked"];

function closeOpen(list: InventoryNotification[], variantId: string, resolution: Resolution, now: string): boolean {
  let touched = false;
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n.variantId !== variantId || n.state === "resolved") continue;
    list[i] = {
      ...n,
      state: "resolved",
      resolution,
      resolvedAt: now,
      activity: [...n.activity, { id: newId("act"), at: now, label: "Resolved", detail: RESOLUTION_LABELS[resolution] }],
    };
    touched = true;
  }
  return touched;
}

export const RESOLUTION_LABELS: Record<Resolution, string> = {
  stock_recovered: "Stock recovered",
  hold_released: "Hold released",
  superseded: "Replaced by a newer status",
  no_longer_tracked: "Item is no longer tracked",
  manual: "Resolved manually",
};

const MAX_HISTORY = 500;
const MAX_RESOLVED = 200;

/**
 * Pure. Compares live inventory against the last known status per variant and returns the next
 * data set — or `prev` untouched when nothing changed, so React can bail out of the update.
 */
export function syncNotifications(prev: NotificationsData, snaps: SkuSnapshot[], cfg: NotificationSettings, nowDate: Date): NotificationsData {
  const now = nowDate.toISOString();
  const notifications = [...prev.notifications];
  const states: Record<string, TrackedState> = { ...prev.states };
  const history: StatusTransition[] = [...prev.history];
  let changed = false;
  const seen = new Set<string>();

  for (const snap of snaps) {
    seen.add(snap.variantId);
    const before = prev.states[snap.variantId];
    const level = evaluateLevel(snap.available, cfg, before?.level);
    const status = effectiveStatus(snap, level);

    if (before && before.status === status) {
      if (before.level !== level) {
        states[snap.variantId] = { ...before, level };
        changed = true;
      }
      continue;
    }

    changed = true;
    const firstSight = !before;
    history.push({
      id: newId("trn"),
      variantId: snap.variantId,
      sku: snap.sku,
      productName: snap.productName,
      from: before?.status ?? null,
      to: status,
      quantityOnHand: snap.available,
      timestamp: now,
      actor: "system",
      note: firstSight ? "First evaluation" : undefined,
    });
    states[snap.variantId] = { status, level, since: now };

    const resolution: Resolution = status === "on_target" ? (before?.status === "hold_blocked" ? "hold_released" : "stock_recovered") : "superseded";
    closeOpen(notifications, snap.variantId, resolution, now);

    if (status === "on_target") {
      if (before && RECOVERABLE_FROM.includes(before.status) && isStatusEnabled("complete", cfg)) notifications.push(buildNotification("complete", snap, cfg, now));
    } else if ((firstSight ? NOTIFY_ON_FIRST_SIGHT.includes(status) : true) && isStatusEnabled(status, cfg)) {
      notifications.push(buildNotification(status, snap, cfg, now));
    }
  }

  for (const variantId of Object.keys(prev.states)) {
    if (seen.has(variantId)) continue;
    delete states[variantId];
    closeOpen(notifications, variantId, "no_longer_tracked", now);
    changed = true;
  }

  if (!changed) return escalateOverdue(prev, nowDate);

  // Keep storage bounded: all live notifications, plus the most recent resolved ones.
  const live = notifications.filter((n) => n.state !== "resolved");
  const resolved = notifications
    .filter((n) => n.state === "resolved")
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, MAX_RESOLVED);
  const trimmed = [...live, ...resolved].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return escalateOverdue({ notifications: trimmed, states, history: history.slice(-MAX_HISTORY) }, nowDate);
}

/** Marks unacknowledged notifications past their escalation window. Returns the same object when nothing is overdue. */
export function escalateOverdue(data: NotificationsData, nowDate: Date): NotificationsData {
  const now = nowDate.toISOString();
  let changed = false;
  const notifications = data.notifications.map((n) => {
    if (n.state !== "open" || n.escalatedAt || !n.escalationRule) return n;
    const ageMinutes = (nowDate.getTime() - new Date(n.timestamp).getTime()) / 60000;
    if (ageMinutes < n.escalationRule.ifUnacknowledgedMinutes) return n;
    changed = true;
    return {
      ...n,
      escalatedAt: now,
      read: false,
      activity: [
        ...n.activity,
        { id: newId("act"), at: now, label: "Escalated", detail: `Not acknowledged in ${n.escalationRule.ifUnacknowledgedMinutes} min. Notified ${n.escalationRule.notify.join(", ")}` },
      ],
    };
  });
  return changed ? { ...data, notifications } : data;
}

export function newActivityId(): string {
  return newId("act");
}
