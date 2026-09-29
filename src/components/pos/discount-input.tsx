"use client";

import { useState } from "react";
import type { DiscountType } from "@/lib/pos/types";
import type { CommitResult } from "@/lib/pos/use-cart";
import { useToast } from "@/components/toast";

/**
 * ৳ / % toggle plus a number. The value is applied when the field loses focus or Enter is pressed — not on every
 * keystroke — so the discount log records a decision, not "1", "12", "120". The parent's commit can cut the value back to a
 * person's limit; the field then shows what was actually applied. Remount it (key) when the value changes from outside.
 */
export function DiscountInput({
  type,
  value,
  onCommit,
  disabled,
  label,
  width = "w-16",
}: {
  type: DiscountType;
  value: number;
  onCommit: (type: DiscountType, value: number) => CommitResult;
  disabled?: boolean;
  label: string;
  width?: string;
}) {
  const toast = useToast();
  const [t, setT] = useState<DiscountType>(type);
  const [text, setText] = useState(value > 0 ? String(value) : "");

  const commit = (nextType: DiscountType, raw: string) => {
    const res = onCommit(nextType, parseFloat(raw) || 0);
    if (!res) return;
    setT(res.type);
    setText(res.value > 0 ? String(res.value) : "");
    if (res.clamped) toast(res.clamped, "error");
  };

  return (
    <div className="flex items-center gap-1">
      <select
        value={t}
        disabled={disabled}
        onChange={(e) => {
          const nt = e.target.value as DiscountType;
          setT(nt);
          commit(nt, text);
        }}
        aria-label={`${label} type`}
        className="focus-ring rounded-lg border px-1 py-1 text-[12px]"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
      >
        <option value="fixed">৳</option>
        <option value="percent">%</option>
      </select>
      <input
        value={text}
        disabled={disabled}
        inputMode="decimal"
        placeholder="0"
        aria-label={label}
        onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setText(e.target.value)}
        onBlur={() => commit(t, text)}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget.blur(), e.preventDefault())}
        className={`focus-ring ${width} rounded-lg border px-2 py-1 text-right text-[12.5px] tabular-nums`}
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
      />
    </div>
  );
}
