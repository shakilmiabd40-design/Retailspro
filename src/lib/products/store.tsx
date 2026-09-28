"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Product, StockUpdateMode } from "./types";
import { useCollection, useDocument } from "@/lib/persist/hooks";
import { applyStockMode } from "./utils";

export type StockUpdate = {
  productId: string;
  variantId: string;
  value: number;
  mode: StockUpdateMode;
};

export type StockLineItem = {
  productId: string;
  variantId: string;
  qty: number;
};

export type Catalog = {
  categories: string[];
  brands: string[];
  colors: string[];
  sizes: string[];
};

const DEFAULT_CATALOG: Catalog = {
  categories: ["Sneakers", "Casual", "Formal", "Sandals", "Boots"],
  brands: ["Nike", "Adidas", "Vans", "Puma", "Bata"],
  colors: ["Black", "White", "Red", "Blue", "Grey", "Yellow", "Brown"],
  sizes: ["36", "37", "38", "39", "40", "41", "42", "43", "44"],
};

interface ProductsContextValue {
  products: Product[];
  hydrated: boolean;
  catalog: Catalog;
  addProduct: (p: Product) => void;
  updateProduct: (id: string, updater: (p: Product) => Product) => void;
  deleteProduct: (id: string) => void;
  deleteProducts: (ids: string[]) => void;
  duplicateProduct: (id: string) => void;
  setProductsStatus: (ids: string[], status: Product["status"]) => void;
  setProductsCategory: (ids: string[], category: string) => void;
  updateVariantStock: (productId: string, variantId: string, value: number, mode: StockUpdateMode) => void;
  bulkUpdateStock: (updates: StockUpdate[]) => void;
  reserveStock: (items: StockLineItem[]) => void;
  releaseStock: (items: StockLineItem[]) => void;
  consumeStock: (items: StockLineItem[]) => void;
  /** Undo a consume: puts sold units back into on-hand stock (used when a delivered order is edited/deleted). */
  restoreStock: (items: StockLineItem[]) => void;
  /** Walk-in POS sale: takes units straight out of on-hand stock. Unlike consumeStock it leaves other orders' reservations alone. */
  sellStock: (items: StockLineItem[]) => void;
  getProduct: (id: string) => Product | undefined;
  addCatalogItem: (key: keyof Catalog, value: string) => void;
  removeCatalogItem: (key: keyof Catalog, value: string) => void;
}

const ProductsContext = createContext<ProductsContextValue | null>(null);

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts, productsReady] = useCollection<Product>("products", (p) => ({
    ...p,
    // Older records may predate the `reserved` field on variants.
    variants: p.variants.map((v) => ({ ...v, reserved: v.reserved ?? 0 })),
  }));
  const [catalog, setCatalog, catalogReady] = useDocument<Catalog>("catalog", DEFAULT_CATALOG);
  const hydrated = productsReady && catalogReady;

  const addProduct = (p: Product) => setProducts((prev) => [p, ...prev]);

  const updateProduct = (id: string, updater: (p: Product) => Product) =>
    setProducts((prev) => prev.map((p) => (p.id === id ? updater(p) : p)));

  const deleteProduct = (id: string) => setProducts((prev) => prev.filter((p) => p.id !== id));

  const deleteProducts = (ids: string[]) =>
    setProducts((prev) => prev.filter((p) => !ids.includes(p.id)));

  const duplicateProduct = (id: string) =>
    setProducts((prev) => {
      const original = prev.find((p) => p.id === id);
      if (!original) return prev;
      const copy: Product = {
        ...original,
        id: crypto.randomUUID(),
        name: `${original.name} (Copy)`,
        sku: `${original.sku}-COPY`,
        variants: original.variants.map((v) => ({ ...v, id: crypto.randomUUID() })),
        createdAt: new Date().toISOString(),
      };
      return [copy, ...prev];
    });

  const setProductsStatus = (ids: string[], status: Product["status"]) =>
    setProducts((prev) => prev.map((p) => (ids.includes(p.id) ? { ...p, status } : p)));

  const setProductsCategory = (ids: string[], category: string) =>
    setProducts((prev) => prev.map((p) => (ids.includes(p.id) ? { ...p, category } : p)));

  const updateVariantStock = (productId: string, variantId: string, value: number, mode: StockUpdateMode) =>
    setProducts((prev) =>
      prev.map((p) =>
        p.id !== productId
          ? p
          : {
              ...p,
              variants: p.variants.map((v) =>
                v.id === variantId ? { ...v, stock: applyStockMode(v.stock, value, mode) } : v
              ),
            }
      )
    );

  const reserveStock = (items: StockLineItem[]) =>
    setProducts((prev) =>
      prev.map((p) => {
        const relevant = items.filter((i) => i.productId === p.id);
        if (!relevant.length) return p;
        return {
          ...p,
          variants: p.variants.map((v) => {
            const i = relevant.find((r) => r.variantId === v.id);
            return i ? { ...v, reserved: Math.max(0, (v.reserved ?? 0) + i.qty) } : v;
          }),
        };
      })
    );

  const releaseStock = (items: StockLineItem[]) =>
    setProducts((prev) =>
      prev.map((p) => {
        const relevant = items.filter((i) => i.productId === p.id);
        if (!relevant.length) return p;
        return {
          ...p,
          variants: p.variants.map((v) => {
            const i = relevant.find((r) => r.variantId === v.id);
            return i ? { ...v, reserved: Math.max(0, (v.reserved ?? 0) - i.qty) } : v;
          }),
        };
      })
    );

  const consumeStock = (items: StockLineItem[]) =>
    setProducts((prev) =>
      prev.map((p) => {
        const relevant = items.filter((i) => i.productId === p.id);
        if (!relevant.length) return p;
        return {
          ...p,
          variants: p.variants.map((v) => {
            const i = relevant.find((r) => r.variantId === v.id);
            return i
              ? { ...v, stock: Math.max(0, v.stock - i.qty), reserved: Math.max(0, (v.reserved ?? 0) - i.qty) }
              : v;
          }),
        };
      })
    );

  const restoreStock = (items: StockLineItem[]) =>
    setProducts((prev) =>
      prev.map((p) => {
        const relevant = items.filter((i) => i.productId === p.id);
        if (!relevant.length) return p;
        return {
          ...p,
          variants: p.variants.map((v) => {
            const i = relevant.find((r) => r.variantId === v.id);
            return i ? { ...v, stock: v.stock + i.qty } : v;
          }),
        };
      })
    );

  const sellStock = (items: StockLineItem[]) =>
    setProducts((prev) =>
      prev.map((p) => {
        const relevant = items.filter((i) => i.productId === p.id);
        if (!relevant.length) return p;
        return {
          ...p,
          variants: p.variants.map((v) => {
            const qty = relevant.filter((r) => r.variantId === v.id).reduce((s, r) => s + r.qty, 0);
            return qty ? { ...v, stock: Math.max(0, v.stock - qty) } : v;
          }),
        };
      })
    );

  const bulkUpdateStock = (updates: StockUpdate[]) =>
    setProducts((prev) =>
      prev.map((p) => {
        const relevant = updates.filter((u) => u.productId === p.id);
        if (!relevant.length) return p;
        return {
          ...p,
          variants: p.variants.map((v) => {
            const u = relevant.find((r) => r.variantId === v.id);
            return u ? { ...v, stock: applyStockMode(v.stock, u.value, u.mode) } : v;
          }),
        };
      })
    );

  const getProduct = (id: string) => products.find((p) => p.id === id);

  const addCatalogItem = (key: keyof Catalog, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setCatalog((prev) =>
      prev[key].some((v) => v.toLowerCase() === trimmed.toLowerCase())
        ? prev
        : { ...prev, [key]: [...prev[key], trimmed] }
    );
  };

  const removeCatalogItem = (key: keyof Catalog, value: string) =>
    setCatalog((prev) => ({ ...prev, [key]: prev[key].filter((v) => v !== value) }));

  const value = useMemo<ProductsContextValue>(
    () => ({
      products,
      hydrated,
      catalog,
      addProduct,
      updateProduct,
      deleteProduct,
      deleteProducts,
      duplicateProduct,
      setProductsStatus,
      setProductsCategory,
      updateVariantStock,
      bulkUpdateStock,
      reserveStock,
      releaseStock,
      consumeStock,
      restoreStock,
      sellStock,
      getProduct,
      addCatalogItem,
      removeCatalogItem,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, hydrated, catalog]
  );

  return <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>;
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error("useProducts must be used within a ProductsProvider");
  return ctx;
}
