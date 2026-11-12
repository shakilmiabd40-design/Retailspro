"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useCollection, useDocument } from "@/lib/persist/hooks";
import { useAccess } from "@/lib/settings/access";
import { useAudit } from "@/lib/settings/audit";
import { useAuth } from "@/lib/auth/context";
import type { AccountingConfig, ChartOfAccount, JournalEntry, JournalLine, InventoryMovement, InventoryCostLayer, StockAdjustment, GrniEntry, ApInvoice, AccountingPeriod, PeriodStatus } from "./gl-types";
import { DEFAULT_ACCOUNTING_CONFIG, DEFAULT_COA } from "./gl-types";

type Result = { ok: true; data?: any } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });
const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/**
 * The default chart of accounts, with parent links resolved.
 *
 * Built once per call — the ids are random, so the same account must never be
 * seeded twice (see the note on the seeding effect below).
 */
function buildDefaultCoa(): ChartOfAccount[] {
  const now = new Date().toISOString();
  const map = new Map<string, string>();
  const items: ChartOfAccount[] = DEFAULT_COA.map((d: any) => {
    const id = uid();
    map.set(d.code, id);
    return { ...d, id, createdAt: now } as ChartOfAccount;
  });
  return items.map((it) => {
    const pcode = (DEFAULT_COA.find((x: any) => x.code === it.code) as any)?.parentCode;
    if (pcode && map.get(pcode)) return { ...it, parentId: map.get(pcode) };
    return it;
  });
}

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
  config: AccountingConfig;
  hydrated: boolean;
  ensureDefaultCoa: () => void;
  addJournalEntry: (input: JournalEntryInput, post?: boolean) => Result;
  postJournalEntry: (id: string) => Result;
  reverseJournalEntry: (id: string, date: string, narration: string) => Result;
  updateConfig: (next: AccountingConfig) => Result;
  addChartAccount: (input: Omit<ChartOfAccount, "id" | "createdAt" | "updatedAt" | "isSystem">) => Result;
  addPeriod: (from: string, to: string) => Result;
  changePeriodStatus: (id: string, status: PeriodStatus) => Result;
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
  const pathname = usePathname() ?? "";
  const journalsPage = pathname === "/accounting/journals";
  const [coa, setCoa, coaReady] = useCollection<ChartOfAccount>("chart_of_accounts");
  const [journals, setJournals, journalsReady] = useCollection<JournalEntry>("journal_entries", undefined, journalsPage);
  const [movements, setMovements, movementsReady] = useCollection<InventoryMovement>("inventory_movements", undefined, false);
  const [layers, setLayers, layersReady] = useCollection<InventoryCostLayer>("inventory_cost_layers", undefined, false);
  const [adjustments, setAdjustments, adjustmentsReady] = useCollection<StockAdjustment>("stock_adjustments", undefined, false);
  const [grni, setGrni, grniReady] = useCollection<GrniEntry>("grni", undefined, false);
  const [apInvoices, setApInvoices, apReady] = useCollection<ApInvoice>("ap_invoices", undefined, false);
  const [periods, setPeriods, periodsReady] = useCollection<AccountingPeriod>("accounting_periods");
  const [config, setConfig, configReady] = useDocument<AccountingConfig>("accounting_config", DEFAULT_ACCOUNTING_CONFIG);
  const { can } = useAccess();
  const { log } = useAudit();
  const { user } = useAuth();

  useEffect(() => {
    if (!coaReady) return;
    // Seed through the updater form: the effect can run twice (React's StrictMode
    // does exactly that in development) and the state has not landed yet when the
    // second run happens. Checking `coa.length` outside the updater seeded the whole
    // chart of accounts twice, leaving a duplicate of every account behind.
    setCoa((prev) => (prev.length > 0 ? prev : buildDefaultCoa()));
  }, [coaReady, setCoa]);

  const value = useMemo<GLContextValue>(() => ({
    coa, journals, movements, layers, adjustments, grni, apInvoices, periods, config,
    hydrated: coaReady && journalsReady && movementsReady && layersReady && adjustmentsReady && grniReady && apReady && periodsReady && configReady,
    ensureDefaultCoa() {
      setCoa((prev) => (prev.length > 0 ? prev : buildDefaultCoa()));
    },
    addJournalEntry(input, post=false) {
      if (!can("accounting", "create")) return fail("Permission denied");
      if (post && !can("accounting", "approve")) return fail("Only an authorized approver can post journals.");
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
      if (!can("accounting", "approve")) return fail("Only an authorized approver can post a reversal.");
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
      // Posted journals are immutable; the new posted reversal points back to the original.
      setJournals(prev => [rev, ...prev]);
      log({ module: "Accounting", action: "create", entity: `Journal ${rev.entryNumber}`, summary: `Reversed ${orig.entryNumber} with ${rev.entryNumber}` });
      return { ok: true, data: rev };
    },
    updateConfig(next) {
      if (!can("accounting", "edit")) return fail("Permission denied");
      const validCodes = new Set(coa.filter((a) => !a.archived).map((a) => a.code));
      if (!validCodes.has(next.adjustmentAccountCode)) return fail("Choose a valid stock adjustment account.");
      for (const [category, mapping] of Object.entries(next.categoryAccounts)) {
        if (!category.trim()) return fail("Category names cannot be empty.");
        for (const code of [mapping.inventory, mapping.cogs, mapping.revenue]) if (code && !validCodes.has(code)) return fail(`Category “${category}” has an invalid account mapping.`);
      }
      setConfig({ ...next, baseCurrency: "BDT", valuationMethod: "fifo", taxEnabled: false });
      log({ module: "Accounting", action: "edit", entity: "Accounting configuration", summary: "Updated accounting posting account mappings" });
      return { ok: true };
    },
    addChartAccount(input) {
      if (!can("accounting", "create")) return fail("Permission denied");
      const code = input.code.trim();
      const name = input.name.trim();
      if (!/^\d{3,8}$/.test(code)) return fail("Account code must be 3 to 8 digits.");
      if (name.length < 2) return fail("Account name must have at least 2 characters.");
      if (coa.some((a) => a.code === code)) return fail("That account code already exists.");
      if (input.parentId && !coa.some((a) => a.id === input.parentId && !a.archived)) return fail("Choose an active parent account.");
      const account: ChartOfAccount = { ...input, code, name, id: uid(), isSystem: false, createdAt: new Date().toISOString() };
      setCoa((prev) => [...prev, account]);
      log({ module: "Accounting", action: "create", entity: `GL account ${account.code}`, summary: `Added chart account ${account.code} · ${account.name}` });
      return { ok: true };
    },
    addPeriod(from, to) {
      if (!can("accounting", "create")) return fail("Permission denied");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return fail("Enter a valid accounting period.");
      if (periods.some((p) => from <= p.to && to >= p.from)) return fail("Accounting periods cannot overlap.");
      setPeriods((prev) => [...prev, { id: uid(), from, to, status: "open" as const }].sort((a, b) => a.from.localeCompare(b.from)));
      log({ module: "Accounting", action: "create", entity: "Accounting period", summary: `Created open accounting period ${from} to ${to}` });
      return { ok: true };
    },
    changePeriodStatus(id, status) {
      if (!can("accounting", "approve")) return fail("Only an authorized approver can close, lock, or reopen a period.");
      const period = periods.find((p) => p.id === id);
      if (!period) return fail("Accounting period not found.");
      const allowed = (period.status === "open" && (status === "closed" || status === "locked")) || (period.status === "closed" && (status === "locked" || status === "open")) || (period.status === "locked" && status === "open");
      if (!allowed) return fail("That accounting period status change is not allowed.");
      const now = new Date().toISOString();
      setPeriods((prev) => prev.map((p) => p.id === id ? { ...p, status, ...(status === "closed" ? { closedAt: now, closedBy: user.name } : {}), ...(status === "locked" ? { lockedAt: now, lockedBy: user.name } : {}), ...(period.status === "locked" && status === "open" ? { reopenedAt: now, reopenedBy: user.name } : {}) } : p));
      log({ module: "Accounting", action: "status_change", entity: "Accounting period", summary: `${status === "open" && period.status === "locked" ? "Reopened" : status === "locked" ? "Locked" : "Closed"} period ${period.from} to ${period.to}` });
      return { ok: true };
    },
    getAccountByCode(code) { return coa.find(a=>a.code===code); },
    trialBalance(asOf) {
      const lines: any[] = [];
      let totalDebit=0,totalCredit=0;
      const totals = new Map<string, { debit: number; credit: number }>();
      for (const je of journals) {
        if (je.status !== "posted" || (asOf && je.date > asOf)) continue;
        for (const item of je.lines) {
          const total = totals.get(item.accountId) ?? { debit: 0, credit: 0 };
          total.debit += item.debit;
          total.credit += item.credit;
          totals.set(item.accountId, total);
        }
      }
      for (const acc of coa.filter(a=>!a.archived)) {
        const { debit = 0, credit = 0 } = totals.get(acc.id) ?? {};
        // apply normal balance view
        if (debit===0 && credit===0) continue;
        lines.push({ account: acc, debit: round2(debit), credit: round2(credit) });
        totalDebit += debit; totalCredit += credit;
      }
      return { lines, totalDebit: round2(totalDebit), totalCredit: round2(totalCredit) };
    }
  }), [coa, journals, movements, layers, adjustments, grni, apInvoices, periods, config, coaReady, journalsReady, movementsReady, layersReady, adjustmentsReady, grniReady, apReady, periodsReady, configReady, can, log, user, setCoa, setJournals, setConfig]);

  return <GLContext.Provider value={value}>{children}</GLContext.Provider>;
}

export function useGL() {
  const ctx = useContext(GLContext);
  if (!ctx) throw new Error("useGL must be used within a GLProvider");
  return ctx;
}
