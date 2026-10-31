"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/toast";
import { api } from "@/lib/persist/api";
import { useOrders } from "@/lib/orders/store";
import { useAccess } from "@/lib/settings/access";
import { useSettings } from "@/lib/settings/store";

/** Polls open Steadfast consignments while the signed-in app is in use, as a fallback for missed webhooks. */
export function SteadfastAutoSync() {
  const { orders } = useOrders();
  const { can } = useAccess();
  const { settings } = useSettings();
  const showToast = useToast();
  const inFlight = useRef(new Set<string>());
  const enabled = settings.courier.steadfast?.enabled ?? false;
  const canViewOrders = can("orders", "view");
  const couriers = settings.courier.couriers;

  useEffect(() => {
    if (!enabled || !canViewOrders) return;
    let active = true;
    const syncOpenParcels = async () => {
      if (document.visibilityState === "hidden") return;
      const candidates = orders.filter((o) => {
        if (o.status !== "processing" || !o.courier.trackingId.trim()) return false;
        const company = o.courier.company.trim().toLowerCase();
        return couriers.some((c) => c.status === "active" && (c.id === "cr-steadfast" || c.name.trim().toLowerCase() === "steadfast") && c.name.trim().toLowerCase() === company);
      });

      for (const order of candidates) {
        if (!active) return;
        if (inFlight.current.has(order.id)) continue;
        inFlight.current.add(order.id);
        try {
          const result = await api<{ status: string; changed: boolean; orderStatus: string }>("POST", "/api/courier/steadfast/sync", { orderId: order.id });
          if (active && result.orderStatus === "in_transit" && result.changed) {
            showToast(`Order #${order.orderNumber} moved to In Transit (Steadfast: ${result.status})`, "success");
          }
        } catch {
          // Transient failures are retried on the next poll; manual sync remains available on the order.
        } finally {
          inFlight.current.delete(order.id);
        }
      }
    };

    // Allow the app's optimistic order edit to reach the server before polling its current status.
    const firstCheck = window.setTimeout(() => void syncOpenParcels(), 2_000);
    const interval = window.setInterval(() => void syncOpenParcels(), 60_000);
    return () => {
      active = false;
      window.clearTimeout(firstCheck);
      window.clearInterval(interval);
    };
  }, [orders, enabled, canViewOrders, couriers, showToast]);

  return null;
}
