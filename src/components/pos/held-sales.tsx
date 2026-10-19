"use client";

import { useState } from "react";
import { PauseCircle, Play, Trash2 } from "lucide-react";
import { usePos } from "@/lib/pos/store";
import type { HeldSale } from "@/lib/pos/types";
import { computeTotals, nextHeldName } from "@/lib/pos/utils";
import { useSettings } from "@/lib/settings/store";
import { formatDateTime } from "@/lib/settings/runtime";
import { GhostBtn, LabeledField, PosModal, PrimaryBtn, fieldInput, fieldStyle, money } from "./ui";

export function HoldSaleModal({ onHold, onClose }: { onHold: (name: string) => string | null; onClose: () => void }) {
  const { held } = usePos();
  const [name, setName] = useState(() => nextHeldName(held.map((h) => h.name)));
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const err = onHold(name);
    if (err) setError(err);
  };
  return (
    <PosModal
      open
      size="sm"
      title="Hold this sale"
      onClose={onClose}
      footer={
        <>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit}>
            <PauseCircle size={15} /> Hold sale
          </PrimaryBtn>
        </>
      }
    >
      <LabeledField label="Name" hint="Nothing is taken from stock while a sale is on hold.">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="e.g. Customer A, Size check" className={fieldInput} style={fieldStyle} />
      </LabeledField>
      {error && (
        <p className="text-[12.5px]" style={{ color: "var(--red)" }} role="alert">
          {error}
        </p>
      )}
    </PosModal>
  );
}

export function HeldSalesModal({ onLoad, onClose, cartHasItems }: { onLoad: (h: HeldSale) => void; onClose: () => void; cartHasItems: boolean }) {
  const { held, removeHeld } = usePos();
  const { settings } = useSettings();
  const [confirm, setConfirm] = useState<HeldSale | null>(null);

  return (
    <PosModal open title={`Held sales (${held.length})`} onClose={onClose} footer={<GhostBtn onClick={onClose}>Close</GhostBtn>}>
      {held.length === 0 ? (
        <p className="py-6 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          No held sales. Use “Hold” to park the current cart.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border-soft)" }}>
          {held.map((h) => {
            const t = computeTotals(h.lines, h.cartDiscount, settings.pos.vatPercent, 0);
            return (
              <li key={h.id} className="flex items-center gap-3 py-3" style={{ borderColor: "var(--border-soft)" }}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
                    {h.name}
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {t.itemCount} item{t.itemCount === 1 ? "" : "s"} · ≈ {money(t.total)} · {h.cashierName} · {formatDateTime(h.createdAt)}
                  </p>
                </div>
                <PrimaryBtn
                  onClick={() => {
                    if (cartHasItems) setConfirm(h);
                    else onLoad(h);
                  }}
                >
                  <Play size={14} /> Resume
                </PrimaryBtn>
                <button aria-label={`Remove ${h.name}`} onClick={() => removeHeld(h.id)} className="focus-ring rounded-md p-1.5" style={{ color: "var(--text-faint)" }}>
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {confirm && (
        <div className="rounded-xl p-3 text-[13px]" style={{ background: "var(--amber-soft, rgba(217,119,6,0.1))", color: "var(--text)" }}>
          <p className="mb-2">Resuming “{confirm.name}” replaces what is in the cart now. Hold the current cart first if you want to keep it.</p>
          <div className="flex gap-2">
            <PrimaryBtn onClick={() => onLoad(confirm)}>Replace cart</PrimaryBtn>
            <GhostBtn onClick={() => setConfirm(null)}>Cancel</GhostBtn>
          </div>
        </div>
      )}
      <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
        Prices and stock are re-checked when you check out.
      </p>
    </PosModal>
  );
}
