"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { useToast } from "@/components/toast";
import { usePos } from "@/lib/pos/store";
import type { PosSession } from "@/lib/pos/types";
import { roundMoney } from "@/lib/pos/utils";
import { GhostBtn, LabeledField, PosModal, PrimaryBtn, fieldInput, fieldStyle, money } from "./ui";

const num = (s: string) => (s.trim() === "" ? NaN : parseFloat(s));

export function OpenSessionModal({ onClose }: { onClose: () => void }) {
  const { openSession } = usePos();
  const toast = useToast();
  const [cash, setCash] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = () => {
    const res = openSession(num(cash));
    if (!res.ok) return setError(res.error);
    toast(`Session ${res.session.sessionNumber} opened`);
    onClose();
  };
  return (
    <PosModal
      open
      size="sm"
      title="Open session"
      onClose={onClose}
      footer={
        <>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit}>Open session</PrimaryBtn>
        </>
      }
    >
      <OpenSessionFields cash={cash} setCash={setCash} onEnter={submit} error={error} />
    </PosModal>
  );
}

export function OpenSessionFields({ cash, setCash, onEnter, error }: { cash: string; setCash: (v: string) => void; onEnter: () => void; error: string | null }) {
  return (
    <div className="space-y-3">
      <LabeledField label="Opening cash in the drawer" hint="Count the float before you start. Enter 0 if the drawer is empty." required>
        <input autoFocus value={cash} inputMode="decimal" onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setCash(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onEnter()} className={`${fieldInput} text-[16px] font-semibold tabular-nums`} style={fieldStyle} />
      </LabeledField>
      {error && (
        <p className="text-[12.5px]" style={{ color: "var(--red)" }} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function CloseSessionModal({ session, onClose }: { session: PosSession; onClose: () => void }) {
  const { closeSession, summaryFor } = usePos();
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ expected: number; counted: number; diff: number } | null>(null);
  const s = summaryFor(session);
  const c = num(counted);
  const diff = Number.isFinite(c) ? roundMoney(c - s.expectedCash) : null;

  const submit = () => {
    const res = closeSession(session.id, c, note);
    if (!res.ok) return setError(res.error);
    setResult({ expected: s.expectedCash, counted: c, diff: res.session.difference ?? 0 });
  };

  if (result) {
    return (
      <PosModal open size="sm" title="Session closed" onClose={onClose} footer={<PrimaryBtn onClick={onClose}>Done</PrimaryBtn>}>
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <CheckCircle2 size={30} style={{ color: "var(--green)" }} />
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Expected {money(result.expected)} · counted {money(result.counted)}
          </p>
          <p className="text-[15px] font-semibold" style={{ color: result.diff === 0 ? "var(--green)" : "var(--red)" }}>
            {result.diff === 0 ? "Drawer balanced" : result.diff < 0 ? `Short ${money(Math.abs(result.diff))}` : `Over ${money(result.diff)}`}
          </p>
        </div>
      </PosModal>
    );
  }

  return (
    <PosModal
      open
      title={`Close session ${session.sessionNumber}`}
      onClose={onClose}
      footer={
        <>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit} disabled={diff === null}>
            Close session
          </PrimaryBtn>
        </>
      }
    >
      <div className="space-y-1.5 rounded-xl p-3 text-[13px]" style={{ background: "var(--surface-2)" }}>
        <Line label="Opening cash" value={money(s.openingCash)} />
        <Line label="Cash sales (after change)" value={`+ ${money(s.cashSales)}`} />
        <Line label="Cash in" value={`+ ${money(s.cashIn)}`} />
        <Line label="Cash out & refunds" value={`− ${money(s.cashOut)}`} />
        <div className="flex justify-between border-t pt-1.5 font-semibold" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
          <span>Expected cash</span>
          <span className="tabular-nums">{money(s.expectedCash)}</span>
        </div>
        <p className="pt-1 text-[11.5px]" style={{ color: "var(--text-faint)" }}>
          {s.invoices} sale{s.invoices === 1 ? "" : "s"} · card {money(s.cardSales)} · mobile {money(s.mobileSales)} (not in the drawer)
        </p>
      </div>
      <LabeledField label="Counted cash" hint="Count what is physically in the drawer." required>
        <input autoFocus value={counted} inputMode="decimal" onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setCounted(e.target.value)} onKeyDown={(e) => e.key === "Enter" && diff !== null && submit()} className={`${fieldInput} text-[16px] font-semibold tabular-nums`} style={fieldStyle} />
      </LabeledField>
      {diff !== null && (
        <p className="text-[13px] font-semibold" style={{ color: diff === 0 ? "var(--green)" : "var(--red)" }}>
          {diff === 0 ? "Balanced" : diff < 0 ? `Short ${money(Math.abs(diff))}` : `Over ${money(diff)}`}
        </p>
      )}
      <LabeledField label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={fieldInput} style={fieldStyle} />
      </LabeledField>
      {error && (
        <p className="text-[12.5px]" style={{ color: "var(--red)" }} role="alert">
          {error}
        </p>
      )}
    </PosModal>
  );
}

export function CashMovementModal({ session, initial = "in", onClose }: { session: PosSession; initial?: "in" | "out"; onClose: () => void }) {
  const { addCashMovement } = usePos();
  const toast = useToast();
  const [type, setType] = useState<"in" | "out">(initial);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const res = addCashMovement(session.id, { type, amount: num(amount), reason, note, approvedBy });
    if (!res.ok) return setError(res.error);
    toast(type === "in" ? "Cash added to the drawer" : "Cash taken out");
    onClose();
  };
  return (
    <PosModal
      open
      size="sm"
      title="Cash in / out"
      onClose={onClose}
      footer={
        <>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn onClick={submit}>{type === "in" ? "Add cash" : "Take cash out"}</PrimaryBtn>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Direction">
        {(["in", "out"] as const).map((t) => (
          <button key={t} role="radio" aria-checked={type === t} onClick={() => setType(t)} className="focus-ring rounded-xl border px-3 py-2 text-[13px] font-medium" style={{ borderColor: type === t ? "var(--brand)" : "var(--border)", background: type === t ? "var(--brand-soft)" : "var(--surface)", color: type === t ? "var(--brand-strong)" : "var(--text-muted)" }}>
            {t === "in" ? "Cash in (petty cash added)" : "Cash out (expense)"}
          </button>
        ))}
      </div>
      <LabeledField label="Amount" required>
        <input autoFocus value={amount} inputMode="decimal" onChange={(e) => /^\d*\.?\d{0,2}$/.test(e.target.value) && setAmount(e.target.value)} className={`${fieldInput} tabular-nums`} style={fieldStyle} />
      </LabeledField>
      <LabeledField label="Reason" required>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === "in" ? "e.g. Float top-up" : "e.g. Tea & snacks, courier fee"} className={fieldInput} style={fieldStyle} />
      </LabeledField>
      <LabeledField label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={fieldInput} style={fieldStyle} />
      </LabeledField>
      {type === "out" && (
        <LabeledField label="Approved by (optional)">
          <input value={approvedBy} onChange={(e) => setApprovedBy(e.target.value)} className={fieldInput} style={fieldStyle} />
        </LabeledField>
      )}
      {error && (
        <p className="text-[12.5px]" style={{ color: "var(--red)" }} role="alert">
          {error}
        </p>
      )}
    </PosModal>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="tabular-nums" style={{ color: "var(--text)" }}>
        {value}
      </span>
    </div>
  );
}
