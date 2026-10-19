"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, UserRound, X } from "lucide-react";
import type { CartCustomer } from "@/lib/pos/types";
import { samePhone, type KnownCustomer } from "@/lib/pos/utils";
import { fieldInput, fieldStyle } from "./ui";

/**
 * Walk-in by default. Typing a phone or name suggests people we've already sold to — a phone number is one customer, so
 * picking a suggestion fills the name and address from their last sale.
 */
export function CustomerBlock({ customer, onChange, directory, requirePhone }: { customer: CartCustomer; onChange: (patch: Partial<CartCustomer>) => void; directory: KnownCustomer[]; requirePhone: boolean }) {
  const filled = !!(customer.name || customer.phone || customer.address || customer.note);
  const [open, setOpen] = useState(filled);
  const [focus, setFocus] = useState<"phone" | "name" | null>(null);

  const known = useMemo(() => (customer.phone ? directory.find((k) => samePhone(k.phone, customer.phone)) : undefined), [directory, customer.phone]);
  const suggestions = useMemo(() => {
    const term = (focus === "phone" ? customer.phone : customer.name).trim().toLowerCase();
    if (!focus || term.length < 2) return [];
    return directory.filter((k) => (focus === "phone" ? k.phone.replace(/\s/g, "").includes(term.replace(/\s/g, "")) : k.name.toLowerCase().includes(term))).filter((k) => !known || k.phone !== known.phone).slice(0, 5);
  }, [directory, focus, customer.phone, customer.name, known]);

  const pick = (k: KnownCustomer) => {
    onChange({ walkIn: false, name: k.name, phone: k.phone, address: customer.address || k.address });
    setFocus(null);
  };

  return (
    <div className="border-t" style={{ borderColor: "var(--border-soft)" }}>
      <button onClick={() => setOpen((o) => !o)} className="focus-ring flex w-full items-center justify-between px-4 py-2.5 text-left" aria-expanded={open}>
        <span className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
          <UserRound size={15} style={{ color: "var(--text-faint)" }} />
          {filled ? customer.name || customer.phone : "Walk-in customer"}
          {known && (
            <span className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: "var(--green-soft, rgba(22,163,74,0.12))", color: "var(--green)" }}>
              Returning · {known.purchases} sale{known.purchases === 1 ? "" : "s"}
            </span>
          )}
        </span>
        <span className="flex items-center gap-1 text-[12px]" style={{ color: "var(--brand-strong)" }}>
          {open ? "Hide" : "Add / select"} {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </button>

      {open && (
        <div className="space-y-2.5 px-4 pb-3">
          <div className="relative grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="relative">
              <input
                value={customer.phone}
                onChange={(e) => onChange({ phone: e.target.value, walkIn: false })}
                onFocus={() => setFocus("phone")}
                onBlur={() => setTimeout(() => setFocus((f) => (f === "phone" ? null : f)), 150)}
                placeholder={requirePhone ? "Phone (required)" : "Phone"}
                inputMode="tel"
                aria-label="Customer phone"
                className={fieldInput}
                style={fieldStyle}
              />
              {focus === "phone" && suggestions.length > 0 && <Suggestions items={suggestions} onPick={pick} />}
            </div>
            <div className="relative">
              <input
                value={customer.name}
                onChange={(e) => onChange({ name: e.target.value, walkIn: false })}
                onFocus={() => setFocus("name")}
                onBlur={() => setTimeout(() => setFocus((f) => (f === "name" ? null : f)), 150)}
                placeholder="Name"
                aria-label="Customer name"
                className={fieldInput}
                style={fieldStyle}
              />
              {focus === "name" && suggestions.length > 0 && <Suggestions items={suggestions} onPick={pick} />}
            </div>
          </div>
          {known && !customer.name.trim() && (
            <button onClick={() => pick(known)} className="text-[12px] underline" style={{ color: "var(--brand-strong)" }}>
              Use saved details: {known.name || known.phone}
            </button>
          )}
          {known && customer.name.trim() && known.name && customer.name.trim().toLowerCase() !== known.name.toLowerCase() && (
            <p className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              This phone is saved as <b>{known.name}</b>.{" "}
              <button onClick={() => onChange({ name: known.name })} className="underline" style={{ color: "var(--brand-strong)" }}>
                Use that name
              </button>
            </p>
          )}
          <input value={customer.address} onChange={(e) => onChange({ address: e.target.value, walkIn: false })} placeholder="Address (needed for delivery)" aria-label="Customer address" className={fieldInput} style={fieldStyle} />
          <input value={customer.note} onChange={(e) => onChange({ note: e.target.value })} placeholder="Customer note (optional)" aria-label="Customer note" className={fieldInput} style={fieldStyle} />
          <div className="flex items-center justify-between">
            <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              A phone number links the warranty to the customer.
            </p>
            {filled && (
              <button onClick={() => onChange({ walkIn: true, name: "", phone: "", address: "", note: "" })} className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                <X size={12} /> Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Suggestions({ items, onPick }: { items: KnownCustomer[]; onPick: (k: KnownCustomer) => void }) {
  return (
    <ul className="card absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-auto py-1 shadow-lg" role="listbox">
      {items.map((k) => (
        <li key={k.phone}>
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(k)} className="w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--surface-2)]" role="option" aria-selected={false}>
            <span className="font-medium" style={{ color: "var(--text)" }}>
              {k.name || "Customer"}
            </span>
            <span className="ml-2" style={{ color: "var(--text-muted)" }}>
              {k.phone}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
