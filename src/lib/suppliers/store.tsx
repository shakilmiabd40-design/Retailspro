"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Supplier } from "./types";
import { useCollection } from "@/lib/persist/hooks";

interface SuppliersContextValue {
  suppliers: Supplier[];
  hydrated: boolean;
  getSupplier: (id: string) => Supplier | undefined;
  addSupplier: (s: Supplier) => void;
  updateSupplier: (id: string, updater: (s: Supplier) => Supplier) => void;
  archiveSupplier: (id: string) => void;
  deleteSupplier: (id: string) => void;
}

const SuppliersContext = createContext<SuppliersContextValue | null>(null);

export function SuppliersProvider({ children }: { children: ReactNode }) {
  const [suppliers, setSuppliers, hydrated] = useCollection<Supplier>("suppliers");

  const getSupplier = (id: string) => suppliers.find((s) => s.id === id);
  const addSupplier = (s: Supplier) => setSuppliers((prev) => [s, ...prev]);
  const updateSupplier = (id: string, updater: (s: Supplier) => Supplier) =>
    setSuppliers((prev) => prev.map((s) => (s.id === id ? updater(s) : s)));
  const archiveSupplier = (id: string) =>
    setSuppliers((prev) => prev.map((s) => (s.id === id ? { ...s, archived: true, status: "inactive" } : s)));
  const deleteSupplier = (id: string) => setSuppliers((prev) => prev.filter((s) => s.id !== id));

  const value = useMemo<SuppliersContextValue>(
    () => ({ suppliers, hydrated, getSupplier, addSupplier, updateSupplier, archiveSupplier, deleteSupplier }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suppliers, hydrated]
  );

  return <SuppliersContext.Provider value={value}>{children}</SuppliersContext.Provider>;
}

export function useSuppliers() {
  const ctx = useContext(SuppliersContext);
  if (!ctx) throw new Error("useSuppliers must be used within a SuppliersProvider");
  return ctx;
}
