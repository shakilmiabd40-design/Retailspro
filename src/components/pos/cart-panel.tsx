"use client";

import { AlertTriangle, Minus, Plus, ShoppingBasket, Trash2 } from "lucide-react";
import type { CartDiscount, CartLine } from "@/lib/pos/types";
import type { SaleTotals } from "@/lib/pos/utils";
import type { CommitResult } from "@/lib/pos/use-cart";
import { availableStock } from "@/lib/products/utils";
import type { Product } from "@/lib/products/types";
import { DiscountInput } from "./discount-input";
import { money } from "./ui";

export interface CartRow {
  line: CartLine;
  /** Current product data, or null when the item can no longer be sold. */
  live: CartLine | null;
  /** Units on the shelf (stock − reserved). */
  avail: number;
}

export function cartRows(lines: CartLine[], live: CartLine[], products: Product[]): CartRow[] {
  return lines.map((line) => {
    const l = live.find((x) => x.variantId === line.variantId) ?? null;
    const v = products.find((p) => p.id === line.productId)?.variants.find((x) => x.id === line.variantId);
    return { line, live: l, avail: v ? availableStock(v) : 0 };
  });
}

interface Props {
  rows: CartRow[];
  totals: SaleTotals;
  cartDiscount: CartDiscount;
  vatPercent: number;
  disabled: boolean;
  onQty: (variantId: string, qty: number) => void;
  onRemove: (variantId: string) => void;
  onLineDiscount: (variantId: string, type: CartDiscount["type"], value: number, base: number) => CommitResult;
  onCartDiscount: (type: CartDiscount["type"], value: number, base: number) => CommitResult;
  problems: string[];
}

export function CartPanel({ rows, totals, cartDiscount, vatPercent, disabled, onQty, onRemove, onLineDiscount, onCartDiscount, problems }: Props) {
  const afterLines = totals.subtotal - totals.itemDiscount;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex h-full min-h-40 flex-col items-center justify-center gap-2 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            <ShoppingBasket size={26} style={{ color: "var(--text-faint)" }} />
            Cart is empty — scan a barcode or pick a product.
          </div>
        ) : (
          <div>
            {rows.map(({ line, live, avail }) => {
              const gross = (live ?? line).price * line.qty;
              const calc = totals.lines.find((c) => c.line.variantId === line.variantId);
              const over = live && line.qty > avail;
              const lineTotal = gross - (calc?.discount ?? 0);
              return (
                <div key={line.key} className="border-b px-3 py-3" style={{ borderColor: "var(--border-soft)", background: !live || over ? "var(--red-soft, rgba(220,38,38,0.06))" : undefined }}>
                  {/* Row 1: name + variant, remove button */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
                        {(live ?? line).productName}
                      </p>
                      <p className="truncate text-[11.5px]" style={{ color: !live || over ? "var(--red)" : "var(--text-muted)" }}>
                        {!live ? "No longer available" : over ? `Only ${avail} left` : `${line.color} / ${line.size}`}
                      </p>
                    </div>
                    <button aria-label={`Remove ${line.productName}`} disabled={disabled} onClick={() => onRemove(line.variantId)} className="focus-ring shrink-0 rounded-md p-1 disabled:opacity-40" style={{ color: "var(--text-faint)" }}>
                      <Trash2 size={15} />
                    </button>
                  </div>

                  {/* Row 2: qty stepper ↔ unit price / line total */}
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1">
                      <button aria-label="Decrease quantity" disabled={disabled || line.qty <= 1} onClick={() => onQty(line.variantId, line.qty - 1)} className="focus-ring rounded-md border p-1.5 disabled:opacity-40" style={{ borderColor: "var(--border)" }}>
                        <Minus size={13} />
                      </button>
                      <input
                        aria-label="Quantity"
                        value={line.qty}
                        disabled={disabled}
                        inputMode="numeric"
                        onChange={(e) => {
                          const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                          if (Number.isFinite(n)) onQty(line.variantId, Math.min(n, Math.max(1, avail)));
                        }}
                        className="focus-ring w-10 rounded-md border py-1 text-center text-[13px] font-semibold tabular-nums"
                        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
                      />
                      <button aria-label="Increase quantity" disabled={disabled || line.qty >= avail} onClick={() => onQty(line.variantId, line.qty + 1)} className="focus-ring rounded-md border p-1.5 disabled:opacity-40" style={{ borderColor: "var(--border)" }}>
                        <Plus size={13} />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] tabular-nums" style={{ color: "var(--text-faint)" }}>
                        {line.qty} × {money((live ?? line).price)}
                      </p>
                      <p className="text-[14.5px] font-semibold tabular-nums" style={{ color: "var(--text)" }}>
                        {money(lineTotal)}
                      </p>
                    </div>
                  </div>

                  {/* Row 3: discount */}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                      Discount
                    </span>
                    <DiscountInput
                      key={`${line.key}-${line.discountType}-${line.discountValue}`}
                      label={`Discount for ${line.productName}`}
                      type={line.discountType}
                      value={line.discountValue}
                      disabled={disabled || !live}
                      onCommit={(t, v) => onLineDiscount(line.variantId, t, v, gross)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {problems.length > 0 && (
        <div className="mx-3 mb-2 flex items-start gap-2 rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--red-soft, rgba(220,38,38,0.08))", color: "var(--red)" }}>
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{problems[0]}</span>
        </div>
      )}

      <div className="space-y-1.5 border-t px-4 py-3 text-[13px]" style={{ borderColor: "var(--border-soft)" }}>
        <SummaryRow label="Subtotal" value={money(totals.subtotal)} />
        {totals.itemDiscount > 0 && <SummaryRow label="Item discounts" value={`− ${money(totals.itemDiscount)}`} tone="green" />}
        <div className="flex items-center justify-between">
          <span style={{ color: "var(--text-muted)" }}>Cart discount</span>
          <div className="flex items-center gap-2">
            {totals.cartDiscount > 0 && (
              <span className="text-[12px] tabular-nums" style={{ color: "var(--green)" }}>
                − {money(totals.cartDiscount)}
              </span>
            )}
            <DiscountInput
              key={`cart-${cartDiscount.type}-${cartDiscount.value}`}
              label="Cart discount"
              type={cartDiscount.type}
              value={cartDiscount.value}
              disabled={disabled || rows.length === 0}
              width="w-20"
              onCommit={(t, v) => onCartDiscount(t, v, afterLines)}
            />
          </div>
        </div>
        {vatPercent > 0 && <SummaryRow label={`VAT (${vatPercent}%)`} value={money(totals.vat)} />}
        <div className="flex items-baseline justify-between border-t pt-2" style={{ borderColor: "var(--border-soft)" }}>
          <span className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            Total · {totals.itemCount} item{totals.itemCount === 1 ? "" : "s"}
          </span>
          <span className="text-[22px] font-bold tabular-nums" style={{ color: "var(--text)" }}>
            {money(totals.total)}
          </span>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: "green" }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="tabular-nums" style={{ color: tone === "green" ? "var(--green)" : "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}
