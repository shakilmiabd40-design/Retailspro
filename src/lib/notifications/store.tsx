"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useProducts } from "@/lib/products/store";
import { usePurchaseOrders } from "@/lib/purchase-orders/store";
import type { PurchaseOrder } from "@/lib/purchase-orders/types";
import {
  DEFAULT_SETTINGS,
  NOTIFIABLE_STATUSES,
  OWNER_ROLE_LABELS,
  deriveStatus,
  escalateOverdue,
  escalationTargetFor,
  newActivityId,
  snapshotSkus,
  syncNotifications,
  type SkuSnapshot,
} from "./engine";
import { EMPTY_DATA } from "./types";
import { useDocument } from "@/lib/persist/hooks";
import type {
  InventoryNotification,
  InventoryStatus,
  NotificationSettings,
  NotificationsData,
  OwnerRole,
  StatusTransition,
} from "./types";

const ACTOR = "You";

/** Which statuses count as a "low stock" event for Settings → Notifications → Low stock alerts. */
const EMAILABLE_STATUSES = new Set<InventoryStatus>(["replenish", "critical", "out_of_stock"]);

export interface BoardRow extends SkuSnapshot {
  status: InventoryStatus;
  since?: string;
}

interface NotificationsContextValue {
  notifications: InventoryNotification[];
  board: BoardRow[];
  settings: NotificationSettings;
  hydrated: boolean;
  /** Unread warning / critical notifications — drives the badge. Info-level items never raise it. */
  unreadCount: number;
  getNotification: (id: string) => InventoryNotification | undefined;
  historyFor: (variantId: string) => StatusTransition[];
  linkedPurchaseOrders: (variantId: string) => PurchaseOrder[];
  markRead: (id: string) => void;
  markAllRead: () => void;
  acknowledge: (id: string) => void;
  acknowledgeAll: () => void;
  assign: (id: string, input: { ownerRole: OwnerRole; assignee?: string }) => void;
  resolve: (id: string) => void;
  clearResolved: () => void;
  /** Deletes resolved notifications resolved before the given ISO timestamp. Returns how many were removed. */
  purgeResolvedBefore: (beforeIso: string) => number;
  updateSettings: (patch: Partial<NotificationSettings>) => void;
  resetSettings: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function clampSettings(s: NotificationSettings): NotificationSettings {
  const num = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
  const emergency = num(s.emergencyThreshold, 0, 1000);
  const reorder = Math.max(emergency, num(s.reorderPoint, 0, 1000));
  const escalationMinutes: NotificationSettings["escalationMinutes"] = {};
  for (const [k, v] of Object.entries(s.escalationMinutes)) escalationMinutes[k as InventoryStatus] = num(v ?? 0, 0, 10080);
  const disabledStatuses = [...new Set((s.disabledStatuses ?? []).filter((st) => NOTIFIABLE_STATUSES.includes(st)))];
  return {
    ...s,
    emergencyThreshold: emergency,
    reorderPoint: reorder,
    monitorMultiplier: num(s.monitorMultiplier, 1, 20),
    hysteresisPct: num(s.hysteresisPct, 0, 50),
    orderUpToMultiplier: num(s.orderUpToMultiplier, 1, 50),
    escalationMinutes,
    disabledStatuses,
  };
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { products, hydrated: productsReady } = useProducts();
  const { purchaseOrders, hydrated: posReady } = usePurchaseOrders();
  // Alerts are derived from stock levels, so last-write-wins is fine (no version conflicts to resolve).
  const [data, setData, dataLoaded] = useDocument<NotificationsData>("notifications_data", EMPTY_DATA, { force: true });
  const [settings, setSettings, settingsLoaded] = useDocument<NotificationSettings>("notifications_settings", DEFAULT_SETTINGS, {
    force: true,
    normalize: (raw) => clampSettings({ ...DEFAULT_SETTINGS, ...(raw as Partial<NotificationSettings>) }),
  });
  const loaded = dataLoaded && settingsLoaded;

  const ready = loaded && productsReady && posReady;
  const snapshots = useMemo(() => (ready ? snapshotSkus(products, purchaseOrders) : []), [ready, products, purchaseOrders]);

  // Newly-opened Replenish / Critical / Out of stock notifications queue up here, then get emailed by the
  // effect right below. A ref (not state) so queuing never itself triggers a re-render or another sync pass.
  const pendingEmailsRef = useRef<InventoryNotification[]>([]);

  // Detect status transitions whenever stock, purchase orders or thresholds change.
  useEffect(() => {
    if (!ready) return;
    setData((prev) => {
      const next = syncNotifications(prev, snapshots, settings, new Date());
      const prevIds = new Set(prev.notifications.map((n) => n.id));
      const fresh = next.notifications.filter((n) => !prevIds.has(n.id) && EMAILABLE_STATUSES.has(n.status));
      if (fresh.length) pendingEmailsRef.current.push(...fresh);
      return next;
    });
  }, [ready, snapshots, settings, setData]);

  // Ask the server to email whoever Settings → Notifications → "Low stock alerts" names. The server re-checks
  // that setting itself and only ever sends once per notification, so this is safe to call speculatively.
  useEffect(() => {
    if (!pendingEmailsRef.current.length) return;
    const batch = pendingEmailsRef.current;
    pendingEmailsRef.current = [];
    for (const n of batch) {
      fetch("/api/notifications/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notificationId: n.id,
          status: n.status,
          productName: n.productName,
          sku: n.sku,
          color: n.color,
          size: n.size,
          quantityOnHand: n.quantityOnHand,
          thresholdValue: n.thresholdValue,
          suggestedAction: n.suggestedAction,
          suggestedQty: n.suggestedQty,
        }),
      }).catch((err) => console.warn("[notifications] low-stock email request failed", err));
    }
  });

  // Escalations also need to fire while the tab sits open with no inventory changes.
  useEffect(() => {
    if (!ready) return;
    const timer = setInterval(() => setData((prev) => escalateOverdue(prev, new Date())), 60_000);
    return () => clearInterval(timer);
  }, [ready, setData]);

  const board = useMemo<BoardRow[]>(
    () =>
      snapshots.map((s) => ({
        ...s,
        status: data.states[s.variantId]?.status ?? deriveStatus(s, settings),
        since: data.states[s.variantId]?.since,
      })),
    [snapshots, data.states, settings]
  );

  const patchOne = useCallback((id: string, fn: (n: InventoryNotification, now: string) => InventoryNotification) => {
    setData((prev) => {
      const now = new Date().toISOString();
      return { ...prev, notifications: prev.notifications.map((n) => (n.id === id ? fn(n, now) : n)) };
    });
  }, [setData]);

  const log = (n: InventoryNotification, at: string, label: string, detail?: string) => [...n.activity, { id: newActivityId(), at, label, detail }];

  const value = useMemo<NotificationsContextValue>(
    () => ({
      notifications: data.notifications,
      board,
      settings,
      hydrated: ready,
      unreadCount: data.notifications.filter((n) => !n.read && n.severity !== "info").length,
      getNotification: (id) => data.notifications.find((n) => n.id === id),
      historyFor: (variantId) => data.history.filter((h) => h.variantId === variantId).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
      linkedPurchaseOrders: (variantId) =>
        purchaseOrders
          .filter((po) => po.status !== "cancelled" && po.items.some((i) => i.variantId === variantId))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      markRead: (id) => patchOne(id, (n) => (n.read ? n : { ...n, read: true })),
      markAllRead: () => setData((prev) => ({ ...prev, notifications: prev.notifications.map((n) => (n.read ? n : { ...n, read: true })) })),
      acknowledge: (id) =>
        patchOne(id, (n, now) =>
          n.state !== "open" ? n : { ...n, state: "acknowledged", read: true, acknowledgedAt: now, activity: log(n, now, "Acknowledged", `By ${ACTOR}`) }
        ),
      acknowledgeAll: () =>
        setData((prev) => {
          const now = new Date().toISOString();
          return {
            ...prev,
            notifications: prev.notifications.map((n) =>
              n.state !== "open" ? n : { ...n, state: "acknowledged", read: true, acknowledgedAt: now, activity: log(n, now, "Acknowledged", `By ${ACTOR}`) }
            ),
          };
        }),
      assign: (id, input) =>
        patchOne(id, (n, now) => {
          const assignee = input.assignee?.trim() || undefined;
          const rule = n.escalationRule ? { ...n.escalationRule, notify: [escalationTargetFor(input.ownerRole)] } : undefined;
          const detail = `${OWNER_ROLE_LABELS[input.ownerRole]}${assignee ? ` · ${assignee}` : ""}`;
          return { ...n, ownerRole: input.ownerRole, assignee, escalationRule: rule, activity: log(n, now, "Assigned", detail) };
        }),
      resolve: (id) =>
        patchOne(id, (n, now) =>
          n.state === "resolved" ? n : { ...n, state: "resolved", read: true, resolution: "manual", resolvedAt: now, activity: log(n, now, "Resolved", `Manually by ${ACTOR}`) }
        ),
      clearResolved: () => setData((prev) => ({ ...prev, notifications: prev.notifications.filter((n) => n.state !== "resolved") })),
      purgeResolvedBefore: (beforeIso) => {
        const removed = data.notifications.filter((n) => n.state === "resolved" && !!n.resolvedAt && n.resolvedAt < beforeIso).length;
        if (removed > 0) {
          setData((prev) => ({ ...prev, notifications: prev.notifications.filter((n) => !(n.state === "resolved" && !!n.resolvedAt && n.resolvedAt < beforeIso)) }));
        }
        return removed;
      },
      updateSettings: (patch) => setSettings((prev) => clampSettings({ ...prev, ...patch })),
      resetSettings: () => setSettings(DEFAULT_SETTINGS),
    }),
    [data, board, settings, ready, purchaseOrders, patchOne, setData, setSettings]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within a NotificationsProvider");
  return ctx;
}
