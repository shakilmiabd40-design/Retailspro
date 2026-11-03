"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useCollection } from "@/lib/persist/hooks";
import { useAccess } from "@/lib/settings/access";
import { useAudit } from "@/lib/settings/audit";
import { useAuth } from "@/lib/auth/context";
import type { ChartOfAccount, JournalEntry, JournalLine, JournalStatus, InventoryMovement, InventoryCostLayer, StockAdjustment, GrniEntry, ApInvoice, AccountingPeriod } from "./gl-types";
import { DEFAULT_COA } from "./gl-types";

type Result = { ok: true; data?: any } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export interface JournalEntryInput {
  date: string;
  ref?: string;
  narration: string;
  source?: JournalEntry["source"];
  sourceId?: string;
  lines: { accountId: string; debit: number; credit: number; memo?: string }[];
}

interface GLContextValue {
  coa: ChartOfAccount[];
  journals: JournalEntry[];
  movements: InventoryMovement[];
  layers: InventoryCostLayer[];
  adjustments: StockAdjustment[];
  grni: GrniEntry[];
  apInvoices: ApInvoice[];
  periods: AccountingPeriod[];
  hydrated: boolean;
  ensureDefaultCoa: () => void;
  addJournalEntry: (input: JournalEntryInput, post?: boolean) => Result;
  postJournalEntry: (id: string) => Result;
  reverseJournalEntry: (id: string, date: string, narration: string) => Result;
  getAccountByCode: (code: string) => ChartOfAccount | undefined;
  trialBalance: (asOf?: string) => { lines: { account: ChartOfAccount; debit: number; credit: number }[]; totalDebit: number; totalCredit: number };
}

const GLContext = createContext<GLContextValue | null>(null);

function round2(n: number) { return Math.round((Number(n) || 0) * 100) / 100; }

function nextNumber(prefix: string, existing: JournalEntry[]) {
  const nums = existing.map(j => parseInt(j.entryNumber.replace(prefix, ""))).filter(n => !isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}${String(next).padStart(6, "0")}`;
}

export function GLProvider({ children }: { children: ReactNode }) {
  const [coa, setCoa, coaReady] = useCollection<ChartOfAccount>("chart_of_accounts");
  const [journals, setJournals, journalsReady] = useCollection<JournalEntry>("journal_entries");
  const [movements, setMovements, movementsReady] = useCollection<InventoryMovement>("inventory_movements");
  const [layers, setLayers, layersReady] = useCollection<InventoryCostLayer>("inventory_cost_layers");
  const [adjustments, setAdjustments, adjustmentsReady] = useCollection<StockAdjustment>("stock_adjustments");
  const [grni, setGrni, grniReady] = useCollection<GrniEntry>("grni");
  const [apInvoices, setApInvoices, apReady] = useCollection<ApInvoice>("ap_invoices");
  const [periods, setPeriods, periodsReady] = useCollection<AccountingPeriod>("accounting_periods");
  const { can } = useAccess();
  const { log } = useAudit();
  const { user } = useAuth();

  useEffect(() => {
    if (coaReady && coa.length === 0) {
      const now = new Date().toISOString();
      const map = new Map<string, string>();
      const items: ChartOfAccount[] = DEFAULT_COA.map((d: any) => {
        const id = uid();
        map.set(d.code, id);
        return { ...d, id, createdAt: now } as ChartOfAccount;
      });
      // set parents
      const withParents = items.map(it => {
        const pcode = (DEFAULT_COA.find((x:any)=>x.code===it.code) as any)?.parentCode;
        if (pcode && map.get(pcode)) return { ...it, parentId: map.get(pcode) };
        return it;
      });
      setCoa(withParents);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coaReady, coa.length]);

  const value = useMemo<GLContextValue>(() => ({
    coa, journals, movements, layers, adjustments, grni, apInvoices, periods,
    hydrated: coaReady && journalsReady && movementsReady && layersReady && adjustmentsReady && grniReady && apReady && periodsReady,
    ensureDefaultCoa() {
      if (coa.length > 0) return;
      const now = new Date().toISOString();
      const map = new Map<string, string>();
      const items: ChartOfAccount[] = DEFAULT_COA.map((d: any) => {
        const id = uid();
        map.set(d.code, id);
        return { ...d, id, createdAt: now } as ChartOfAccount;
      });
      const withParents = items.map(it => {
        const pcode = (DEFAULT_COA.find((x:any)=>x.code===it.code) as any)?.parentCode;
        if (pcode && map.get(pcode)) return { ...it, parentId: map.get(pcode) };
        return it;
      });
      setCoa(withParents);
    },
    addJournalEntry(input, post=false) {
      if (!can("accounting", "create")) return fail("Permission denied");
      const lines: JournalLine[] = input.lines.map(l => {
        const acc = coa.find(a=>a.id===l.accountId);
        return { id: uid(), accountId: l.accountId, accountCode: acc?.code, accountName: acc?.name, debit: round2(l.debit||0), credit: round2(l.credit||0), memo: l.memo };
      });
      const totalDebit = round2(lines.reduce((s,l)=>s+l.debit,0));
      const totalCredit = round2(lines.reduce((s,l)=>s+l.credit,0));
      if (totalDebit < 0 || totalCredit < 0) return fail("Invalid amounts");
      if (Math.abs(totalDebit - totalCredit) > 0.01) return fail(`Journal not balanced. Dr ${totalDebit} vs Cr ${totalCredit}`);
      if (totalDebit === 0) return fail("Journal must have at least one line");
      const now = new Date().toISOString();
      const je: JournalEntry = {
        id: uid(),
        entryNumber: nextNumber("JE-", journals),
        date: input.date,
        ref: input.ref,
        narration: input.narration,
        source: input.source || "manual",
        sourceId: input.sourceId,
        status: post ? "posted" : "draft",
        lines,
        totalDebit,
        totalCredit,
        createdAt: now,
        createdBy: user?.name,
        postedAt: post ? now : undefined,
        postedBy: post ? user?.name : undefined,
      };
      setJournals(prev => [je, ...prev]);
      // "approve" is not in AuditAction; use "status_change" for posting (draft→posted) and "create" for drafting.
      log({ module: "Accounting", action: post ? "status_change" : "create", entity: `Journal ${je.entryNumber}`, summary: `${post?"Posted":"Drafted"} journal entry ${je.entryNumber}` });
      return { ok: true, data: je };
    },
    postJournalEntry(id) {
      if (!can("accounting", "approve")) return fail("Only authorized users can post journals");
      const je = journals.find(j=>j.id===id);
      if (!je) return fail("Journal not found");
      if (je.status !== "draft") return fail("Only draft journals can be posted");
      const now = new Date().toISOString();
      setJournals(prev => prev.map(j => j.id===id ? { ...j, status: "posted", postedAt: now, postedBy: user?.name } : j));
      log({ module: "Accounting", action: "status_change", entity: `Journal ${je.entryNumber}`, summary: `Posted journal entry ${je.entryNumber}` });
      return { ok: true };
    },
    reverseJournalEntry(id, date, narration) {
      if (!can("accounting", "create")) return fail("Permission denied");
      const orig = journals.find(j=>j.id===id);
      if (!orig) return fail("Journal not found");
      if (orig.status !== "posted") return fail("Only posted journals can be reversed");
      const now = new Date().toISOString();
      const revLines: JournalLine[] = orig.lines.map(l => ({ id: uid(), accountId: l.accountId, accountCode: l.accountCode, accountName: l.accountName, debit: l.credit, credit: l.debit, memo: l.memo ? `Reversal: ${l.memo}` : "Reversal" }));
      const rev: JournalEntry = {
        id: uid(),
        entryNumber: nextNumber("JE-", journals),
        date,
        ref: orig.entryNumber,
        narration: narration || `Reversal of ${orig.entryNumber}`,
        source: "reversal",
        sourceId: orig.id,
        status: "posted",
        lines: revLines,
        totalDebit: orig.totalCredit,
        totalCredit: orig.totalDebit,
        createdAt: now,
        createdBy: user?.name,
        postedAt: now,
        postedBy: user?.name,
      };
      setJournals(prev => [{ ...orig, reversedByEntryId: rev.id }, rev, ...prev.filter(j=>j.id!==id)]);
      log({ module: "Accounting", action: "create", entity: `Journal ${rev.entryNumber}`, summary: `Reversed ${orig.entryNumber} with ${rev.entryNumber}` });
      return { ok: true, data: rev };
    },
    getAccountByCode(code) { return coa.find(a=>a.code===code); },
    trialBalance(asOf) {
      const lines: any[] = [];
      let totalDebit=0,totalCredit=0;
      for (const acc of coa.filter(a=>!a.archived)) {
        let debit=0, credit=0;
        for (const je of journals) {
          if (je.status!=="posted") continue;
          if (asOf && je.date>asOf) continue;
          for (const l of je.lines) {
            if (l.accountId!==acc.id) continue;
            debit += l.debit; credit += l.credit;
          }
        }
        // apply normal balance view
        if (debit===0 && credit===0) continue;
        lines.push({ account: acc, debit: round2(debit), credit: round2(credit) });
        totalDebit += debit; totalCredit += credit;
      }
      return { lines, totalDebit: round2(totalDebit), totalCredit: round2(totalCredit) };
    }
  }), [coa, journals, movements, layers, adjustments, grni, apInvoices, periods, coaReady, journalsReady, movementsReady, layersReady, adjustmentsReady, grniReady, apReady, periodsReady, can, log, user, setCoa, setJournals]);

  return <GLContext.Provider value={value}>{children}</GLContext.Provider>;
}

export function useGL() {
  const ctx = useContext(GLContext);
  if (!ctx) throw new Error("useGL must be used within a GLProvider");
  return ctx;
}
