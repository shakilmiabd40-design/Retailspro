"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/persist/api";
import type { ReturnRecord } from "@/lib/returns/types";
import type { Warranty } from "@/lib/warranty/types";
import type { CourierReport, InventoryStockReport, InventoryValueReport, OrderStatusReport, ProductSalesReport, PurchaseReport, SalesCodReport, SupplierReport } from "./types";

interface ReportSnapshot<T> {
  query: string;
  data: T;
}

interface ReportFailure {
  query: string;
  message: string;
}

/**
 * Fetch a report endpoint. The query string is part of the stored state, so a
 * changed filter shows the loading state immediately without writing state
 * synchronously inside the effect.
 */
export function useReportApi<T>(path: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  const [snapshot, setSnapshot] = useState<ReportSnapshot<T> | null>(null);
  const [failure, setFailure] = useState<ReportFailure | null>(null);

  useEffect(() => {
    let current = true;
    api<T>("GET", `${path}?${query}`)
      .then((result) => {
        if (current) setSnapshot({ query, data: result });
      })
      .catch((err) => {
        if (current) setFailure({ query, message: err instanceof Error ? err.message : "Could not load the report." });
      });
    return () => {
      current = false;
    };
  }, [path, query]);

  const data = snapshot?.query === query ? snapshot.data : null;
  const error = failure?.query === query ? failure.message : "";
  return { data, loading: !data && !error, error };
}

export function useSalesCodReport(params: Record<string, string>) {
  return useReportApi<SalesCodReport>("/api/reports/sales-cod", params);
}

export function useCourierReport(params: Record<string, string>) {
  return useReportApi<CourierReport>("/api/reports/courier", params);
}

export function useOrderStatusReport(params: Record<string, string>) {
  return useReportApi<OrderStatusReport>("/api/reports/order-status", params);
}

export function useProductSalesReport(params: Record<string, string>) {
  return useReportApi<ProductSalesReport>("/api/reports/product-sales", params);
}

export function usePurchaseReport(params: Record<string, string>) {
  return useReportApi<PurchaseReport>("/api/reports/purchases", params);
}

export function useSupplierReport(params: Record<string, string>) {
  return useReportApi<SupplierReport>("/api/reports/suppliers", params);
}

export function useInventoryStockReport(params: Record<string, string>) {
  return useReportApi<InventoryStockReport>("/api/reports/inventory-stock", params);
}

export interface InventoryValueReportPayload extends InventoryValueReport {
  /** False for roles that may not see product cost prices. */
  canSeeCost: boolean;
}

export function useInventoryValueReport(params: Record<string, string>) {
  return useReportApi<InventoryValueReportPayload>("/api/reports/inventory-valuation", params);
}

export function useReturnsReport(params: Record<string, string>) {
  return useReportApi<{ returns: ReturnRecord[] }>("/api/reports/returns", params);
}

export function useWarrantyReport(params: Record<string, string>) {
  return useReportApi<{ warranties: Warranty[] }>("/api/reports/warranties", params);
}
