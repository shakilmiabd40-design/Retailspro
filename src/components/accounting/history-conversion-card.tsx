"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth/context";
import { api } from "@/lib/persist/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface Preview {
  completed?: boolean;
  canConvert?: boolean;
  reason?: string;
  metadata?: { convertedAt?: string; journalCount?: number; estimateCount?: number };
  journalCount?: number;
  layerCount?: number;
  movementCount?: number;
  estimateCount?: number;
  estimates?: string[];
  pending?: number;
  count?: number;
  posted?: number;
}

export function HistoryConversionCard() {
  const { user } = useAuth();
  const toast = useToast();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [refuseLoss, setRefuseLoss] = useState<Preview | null>(null);
  const [confirmRefuseLoss, setConfirmRefuseLoss] = useState(false);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api<Preview>("GET", "/api/accounting/migrate-history");
      setPreview(next);
      if (next.completed) {
        try { setRefuseLoss(await api<Preview>("GET", "/api/accounting/backfill-refused-loss")); }
        catch { setRefuseLoss(null); }
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the history conversion preview.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  if (!user.role.locked) return null;
  if (loading) return <div className="card p-4 text-[12.5px]" style={{ color: "var(--text-muted)" }}>Checking accounting conversion status…</div>;
  if (error) return <div className="card flex items-center justify-between gap-3 p-4 text-[12.5px]" style={{ color: "var(--red)" }}>{error}<button onClick={() => void refresh()} aria-label="Retry" className="rounded-lg border p-2" style={{ borderColor: "var(--border)" }}><RefreshCw size={14} /></button></div>;
  if (preview?.completed) return (
    <>
      <div className="card flex flex-wrap items-start justify-between gap-3 border p-4" style={{ borderColor: "var(--green)", color: "var(--green)" }}>
        <div className="flex items-start gap-3"><CheckCircle2 size={17} className="mt-0.5 shrink-0" /><div><p className="text-[13px] font-semibold">Historical accounting converted</p><p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>{preview.metadata?.journalCount ?? 0} entries were created. Conversion is append-only.</p></div></div>
        {refuseLoss?.pending ? <button onClick={() => setConfirmRefuseLoss(true)} className="focus-ring rounded-xl border px-3 py-2 text-[12px] font-semibold" style={{ borderColor: "var(--amber, #b45309)", color: "var(--amber, #b45309)" }}>Import refused-order courier losses ({refuseLoss.pending})</button> : null}
      </div>
      <ConfirmDialog open={confirmRefuseLoss} title="Import past refused-order losses?" message={`${refuseLoss?.pending ?? 0} refused orders have courier charges that are not yet in the general ledger. This posts each as Dr Courier Expense / Cr Courier Payable and leaves inventory unchanged.`} confirmLabel="Import courier losses" onCancel={() => setConfirmRefuseLoss(false)} onConfirm={async () => {
        try {
          const result = await api<Preview>("POST", "/api/accounting/backfill-refused-loss");
          toast(`Imported courier losses for ${result.posted ?? 0} refused orders`, "success");
          setConfirmRefuseLoss(false);
          await refresh();
        } catch (e) {
          toast(e instanceof Error ? e.message : "Could not import refused-order courier losses.", "error");
          setConfirmRefuseLoss(false);
        }
      }} />
    </>
  );

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle size={17} className="mt-0.5 shrink-0" style={{ color: "var(--amber, #b45309)" }} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>Convert existing history to FIFO and double-entry accounting</h2>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>Creates balanced journals and stock cost layers from recorded purchase receipts, delivered orders, POS invoices, accounts, and cash ledger entries. This runs once and does not edit existing records.</p>
        </div>
      </div>
      {!preview?.canConvert ? (
        <p className="rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--surface-2)", color: "var(--red)" }}>{preview?.reason || "History conversion is unavailable."}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            <span><b style={{ color: "var(--text)" }}>{preview.journalCount}</b> journal entries</span>
            <span><b style={{ color: "var(--text)" }}>{preview.layerCount}</b> FIFO layers</span>
            <span><b style={{ color: "var(--text)" }}>{preview.movementCount}</b> stock movements</span>
            <span><b style={{ color: preview.estimateCount ? "var(--amber, #b45309)" : "var(--text)" }}>{preview.estimateCount}</b> cost estimates flagged</span>
          </div>
          {!!preview.estimateCount && <div className="rounded-lg px-3 py-2 text-[11.5px]" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}><b>Review needed:</b> missing historical receipt costs use current product cost. Partial deliveries and stock changes without saved movement details can’t be reconstructed exactly.{preview.estimates?.length ? <ul className="mt-1 list-inside list-disc">{preview.estimates.slice(0, 3).map((x, i) => <li key={i}>{x}</li>)}</ul> : null}</div>}
          <button onClick={() => setConfirm(true)} disabled={converting} className="focus-ring rounded-xl px-3.5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50" style={{ background: "var(--brand)" }}>{converting ? "Converting…" : "Convert history"}</button>
        </>
      )}
      <ConfirmDialog open={confirm} title="Convert all existing accounting history?" message="This creates FIFO layers and posted journal entries from the current records. It can run only once; source orders and ledger entries remain unchanged." confirmLabel="Convert history" danger={false} onCancel={() => setConfirm(false)} onConfirm={async () => {
        setConverting(true);
        try {
          const result = await api<Preview>("POST", "/api/accounting/migrate-history");
          setPreview({ completed: true, metadata: result });
          toast(`Created ${result.journalCount ?? 0} historical journal entries`);
          window.setTimeout(() => window.location.reload(), 700);
        } catch (e) {
          toast(e instanceof Error ? e.message : "History conversion failed.", "error");
          setConfirm(false);
          await refresh();
        } finally {
          setConverting(false);
        }
      }} />
    </section>
  );
}
