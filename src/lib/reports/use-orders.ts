"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/persist/api";
import type { Order } from "@/lib/orders/types";
import type { DateTypeKey } from "./dates";

export function useReportOrders(from: string, to: string, dateType: DateTypeKey, includeCreated = false) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setLoading(true);
    const params = new URLSearchParams({ from, to, dateType });
    if (includeCreated) params.set("includeCreated", "1");
    api<{ orders: Order[] }>("GET", `/api/reports/orders?${params.toString()}`)
      .then((result) => { if (current) { setOrders(result.orders); setError(""); } })
      .catch((err) => { if (current) setError(err instanceof Error ? err.message : "Could not load the order report."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [from, to, dateType, includeCreated]);

  return { orders, loading, error };
}
