"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/persist/api";
import { parseDate } from "./dates";

type LastSoldLine = { variantId: string; date: string };

export function useLastSoldDates() {
  const [sales, setSales] = useState<LastSoldLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    api<{ sales: LastSoldLine[] }>("GET", `/api/reports/inventory-valuation?timeZone=${encodeURIComponent(timeZone)}`)
      .then((result) => { if (current) { setSales(result.sales); setError(""); } })
      .catch((err) => { if (current) setError(err instanceof Error ? err.message : "Could not load inventory sales history."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);

  const lastSold = useMemo(() => {
    const map = new Map<string, Date>();
    for (const row of sales) {
      const date = parseDate(row.date);
      if (Number.isNaN(date.getTime())) continue;
      const previous = map.get(row.variantId);
      if (!previous || date > previous) map.set(row.variantId, date);
    }
    return map;
  }, [sales]);

  return { lastSold, loading, error };
}
