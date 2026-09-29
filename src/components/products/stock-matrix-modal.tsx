"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import clsx from "clsx";
import { useProducts } from "@/lib/products/store";
import { useToast } from "@/components/toast";
import type { Product, StockUpdateMode } from "@/lib/products/types";

const MODES: { key: StockUpdateMode; label: string; hint: string }[] = [
  { key: "set", label: "Set", hint: "Stock becomes exactly this number" },
  { key: "add", label: "Add", hint: "Adds this number to current stock" },
  { key: "remove", label: "Remove", hint: "Subtracts this number from current stock" },
];

export function StockMatrixModal({
  product,
  open,
  onClose,
}: {
  product: Product | null;
  open: boolean;
  onClose: () => void;
}) {
  const { bulkUpdateStock } = useProducts();
  const showToast = useToast();
  const [mode, setMode] = useState<StockUpdateMode>("set");
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !product) return;
    const initial: Record<string, string> = {};
    product.variants.forEach((v) => {
      initial[v.id] = mode === "set" ? String(v.stock) : "0";
    });
    setValues(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product?.id, mode]);

  if (!open || !product) return null;

  function variantFor(color: string, size: string) {
    return product!.variants.find((v) => v.color === color && v.size === size);
  }

  function handleSave() {
    if (!product) return;
    const updates = product.variants.map((v) => ({
      productId: product.id,
      variantId: v.id,
      value: Number(values[v.id] ?? 0) || 0,
      mode,
    }));
    bulkUpdateStock(updates);
    showToast(`Stock updated for ${product.name}`);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="card flex max-h-[85vh] w-full max-w-2xl flex-col p-5">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              Shoe Stock Matrix
            </p>
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              {product.name} · {product.sku}
            </p>
          </div>
          <button onClick={onClose} className="focus-ring rounded-md p-1" style={{ color: "var(--text-faint)" }}>
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex gap-1 rounded-lg p-1" style={{ background: "var(--surface-2)" }}>
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              className="focus-ring flex-1 rounded-md py-1.5 text-[12px] font-medium transition-colors"
              style={{
                background: mode === m.key ? "var(--brand)" : "transparent",
                color: mode === m.key ? "#ffffff" : "var(--text-muted)",
              }}
              title={m.hint}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
          <table className="w-full min-w-[420px] border-collapse text-center text-[13px]">
            <thead>
              <tr style={{ background: "var(--surface-2)" }}>
                <th
                  className="border-b border-r px-3 py-2 text-left font-medium"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  Color / Size
                </th>
                {product.sizes.map((size) => (
                  <th
                    key={size}
                    className="border-b px-2 py-2 font-medium"
                    style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  >
                    {size}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {product.colors.map((color) => (
                <tr key={color}>
                  <td
                    className="border-r px-3 py-2 text-left font-medium"
                    style={{ borderColor: "var(--border)", color: "var(--text)" }}
                  >
                    {color}
                  </td>
                  {product.sizes.map((size) => {
                    const variant = variantFor(color, size);
                    if (!variant) {
                      return (
                        <td key={size} className="px-2 py-2" style={{ color: "var(--text-faint)" }}>
                          —
                        </td>
                      );
                    }
                    return (
                      <td key={size} className="px-1.5 py-1.5">
                        <input
                          type="number"
                          min={0}
                          value={values[variant.id] ?? ""}
                          onChange={(e) =>
                            setValues((prev) => ({ ...prev, [variant.id]: e.target.value }))
                          }
                          className={clsx(
                            "focus-ring w-14 rounded-md border px-1.5 py-1 text-center text-[12.5px]"
                          )}
                          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="focus-ring rounded-lg border px-4 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="focus-ring rounded-lg px-4 py-2 text-[13px] font-semibold text-white"
            style={{ background: "var(--brand)" }}
          >
            Save Stock Changes
          </button>
        </div>
      </div>
    </div>
  );
}
