"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/persist/api";
import type { ReturnRecord } from "@/lib/returns/types";

export function useReportReturns(from: string, to: string, type: "customer" | "supplier") {
  const [returns, setReturns] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    setLoading(true);
    const params = new URLSearchParams({ from, to, type });
    api<{ returns: ReturnRecord[] }>("GET", `/api/reports/returns?${params.toString()}`)
      .then((result) => { if (current) { setReturns(result.returns); setError(""); } })
      .catch((err) => { if (current) setError(err instanceof Error ? err.message : "Could not load the returns report."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [from, to, type]);

  return { returns, loading, error };
}
