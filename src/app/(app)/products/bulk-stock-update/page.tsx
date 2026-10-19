"use client";

import { Suspense, useEffect, useMemo, useState, Fragment } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, X, Package } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { useToast } from "@/components/toast";
import { useSettings } from "@/lib/settings/store";
import { useAudit } from "@/lib/settings/audit";
import { applyStockMode } from "@/lib/products/utils";
import type { StockUpdateMode } from "@/lib/products/types";

const MODES: { key: StockUpdateMode; label: string }[] = [
  { key: "set", label: "Set" },
  { key: "add", label: "Add" },
  { key: "remove", label: "Remove" },
];

function BulkStockUpdateInner() {
  const { products, bulkUpdateStock } = useProducts();
  const showToast = useToast();
  const { settings } = useSettings();
  const { log } = useAudit();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [query, setQuery] = useState("");
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [mode, setMode] = useState<StockUpdateMode>("set");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const reasonRequired = settings.inventory.stockChangeRequiresReason;

  useEffect(() => {
    const idsParam = searchParams.get("ids");
    if (idsParam) {
      const ids = idsParam.split(",").filter(Boolean);
      setAddedIds(ids);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addedProducts = useMemo(
    () => addedIds.map((id) => products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p),
    [addedIds, products]
  );

  // Keep checked/values in sync with the currently added variants + mode.
  useEffect(() => {
    setChecked((prev) => {
      const next = new Set(prev);
      addedProducts.forEach((p) => p.variants.forEach((v) => next.add(v.id)));
      return next;
    });
    setValues((prev) => {
      const next = { ...prev };
      addedProducts.forEach((p) =>
        p.variants.forEach((v) => {
          if (!(v.id in next)) next[v.id] = mode === "set" ? String(v.stock) : "0";
        })
      );
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addedIds]);

  function handleModeChange(next: StockUpdateMode) {
    setMode(next);
    const reset: Record<string, string> = {};
    addedProducts.forEach((p) =>
      p.variants.forEach((v) => {
        reset[v.id] = next === "set" ? String(v.stock) : "0";
      })
    );
    setValues(reset);
  }

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => !addedIds.includes(p.id))
      .filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, products, addedIds]);

  function addProductToWorkingSet(id: string) {
    setAddedIds((prev) => [...prev, id]);
    setQuery("");
  }

  function removeProductFromWorkingSet(id: string) {
    setAddedIds((prev) => prev.filter((x) => x !== id));
  }

  function toggleVariant(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleUpdate() {
    const updates = addedProducts.flatMap((p) =>
      p.variants
        .filter((v) => checked.has(v.id))
        .map((v) => ({
          productId: p.id,
          variantId: v.id,
          value: Number(values[v.id] ?? 0) || 0,
          mode,
        }))
    );
    if (!updates.length) {
      showToast("Select at least one variant to update", "error");
      return;
    }
    if (reasonRequired && !reason) {
      showToast("Choose a reason for this stock change", "error");
      return;
    }
    // Audit trail: what each variant held before and after (critical field per the audit spec).
    const before: Record<string, number> = {};
    const after: Record<string, number> = {};
    for (const u of updates) {
      const p = products.find((x) => x.id === u.productId);
      const v = p?.variants.find((x) => x.id === u.variantId);
      if (!v) continue;
      before[v.sku] = v.stock;
      after[v.sku] = applyStockMode(v.stock, u.value, u.mode);
    }
    const changed = Object.keys(after).filter((k) => after[k] !== before[k]);
    if (changed.length) {
      log({
        module: "Stock",
        action: "edit",
        entity: `${changed.length} variant${changed.length > 1 ? "s" : ""}`,
        summary: `Bulk stock update (${mode})${reason ? ` — ${reason}` : ""}`,
        before: Object.fromEntries(changed.map((k) => [k, before[k]])),
        after: Object.fromEntries(changed.map((k) => [k, after[k]])),
      });
    }
    bulkUpdateStock(updates);
    showToast(`Updated stock for ${updates.length} variant${updates.length > 1 ? "s" : ""}`);
    router.push("/products");
  }

  return (
    <>
      <Link href="/products" className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back to Products
      </Link>

      <div>
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
          Bulk Stock Update
        </h1>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Search for products, then update stock across all their variants at once.
        </p>
      </div>

      {/* Search */}
      <div className="card p-4">
        <label className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)" }}>
          <Search size={15} style={{ color: "var(--text-faint)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search product by name or SKU..."
            className="w-full bg-transparent text-[13px] outline-none"
            style={{ color: "var(--text)" }}
          />
        </label>
        {searchResults.length > 0 && (
          <div className="mt-2 divide-y rounded-xl border" style={{ borderColor: "var(--border)" }}>
            {searchResults.map((p) => (
              <button
                key={p.id}
                onClick={() => addProductToWorkingSet(p.id)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[var(--surface-2)]"
              >
                <span>
                  <span className="block text-[13px] font-medium" style={{ color: "var(--text)" }}>
                    {p.name}
                  </span>
                  <span className="block text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                    {p.sku} · {p.variants.length} variants
                  </span>
                </span>
                <span className="text-[12px] font-medium" style={{ color: "var(--brand)" }}>
                  Add
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {addedProducts.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-14 text-center">
          <Package size={26} style={{ color: "var(--text-faint)" }} />
          <p className="text-[13.5px] font-medium" style={{ color: "var(--text)" }}>
            No products selected yet
          </p>
          <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Search above and add one or more products to bulk-update their stock.
          </p>
        </div>
      ) : (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
              Update mode
            </p>
            <div className="flex gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
              {MODES.map((m) => (
                <button
                  key={m.key}
                  onClick={() => handleModeChange(m.key)}
                  className="focus-ring rounded-md px-4 py-1.5 text-[12.5px] font-medium transition-colors"
                  style={{
                    background: mode === m.key ? "var(--brand)" : "transparent",
                    color: mode === m.key ? "#ffffff" : "var(--text-muted)",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Color</th>
                    <th className="px-3 py-2 font-medium">Size</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Current Stock</th>
                    <th className="px-3 py-2 font-medium">New Value</th>
                  </tr>
                </thead>
                <tbody>
                  {addedProducts.map((p) => (
                    <Fragment key={p.id}>
                      {p.variants.map((v, i) => (
                        <tr key={v.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={checked.has(v.id)}
                              onChange={() => toggleVariant(v.id)}
                              className="h-4 w-4"
                            />
                          </td>
                          <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>
                            {i === 0 ? (
                              <span className="flex items-center gap-2">
                                {p.name}
                                <button
                                  onClick={() => removeProductFromWorkingSet(p.id)}
                                  className="focus-ring rounded p-0.5"
                                  style={{ color: "var(--text-faint)" }}
                                  title="Remove product from this update"
                                >
                                  <X size={12} />
                                </button>
                              </span>
                            ) : (
                              ""
                            )}
                          </td>
                          <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                            {v.color}
                          </td>
                          <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                            {v.size}
                          </td>
                          <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                            {v.sku}
                          </td>
                          <td className="px-3 py-2" style={{ color: "var(--text)" }}>
                            {v.stock}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              value={values[v.id] ?? ""}
                              onChange={(e) => setValues((prev) => ({ ...prev, [v.id]: e.target.value }))}
                              className="focus-ring w-24 rounded-lg border px-2 py-1"
                              style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
                            />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t p-4" style={{ borderColor: "var(--border)" }}>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-label="Reason for stock change"
                className="focus-ring mr-auto rounded-xl border px-3 py-2 text-[13px]"
                style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
              >
                <option value="">{reasonRequired ? "Reason (required)…" : "Reason (optional)…"}</option>
                {settings.inventory.adjustmentReasons.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                onClick={() => router.push("/products")}
                className="focus-ring rounded-xl border px-4 py-2 text-[13px] font-medium"
                style={{ borderColor: "var(--border)", color: "var(--text)" }}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white"
                style={{ background: "var(--brand)" }}
              >
                Update Stock
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

export default function BulkStockUpdatePage() {
  return (
    <Suspense fallback={<p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>}>
      <BulkStockUpdateInner />
    </Suspense>
  );
}
