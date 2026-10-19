"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuditAction, AuditEntry, AuditModule } from "./types";
import { runtime, shortDevice } from "./runtime";
import { api } from "@/lib/persist/api";
import { useAuth } from "@/lib/auth/context";

export interface AuditLogInput {
  module: AuditModule;
  action: AuditAction;
  entity: string;
  summary: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

interface AuditContextValue {
  /** Entries recorded in the database (settings, users, stock, data, security…). Empty if you can't view the audit log. */
  entries: AuditEntry[];
  hydrated: boolean;
  /** Records an event. The server stamps who did it and when — this only supplies what happened. */
  log: (input: AuditLogInput) => void;
  reload: () => Promise<void>;
}

const AuditContext = createContext<AuditContextValue | null>(null);

export function AuditProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const canView = user.role.locked === true || !!user.role.permissions.audit?.includes("view");
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const reload = useCallback(async () => {
    if (!canView) {
      setHydrated(true);
      return;
    }
    try {
      const res = await api<{ entries: AuditEntry[] }>("GET", "/api/audit");
      setEntries(res.entries);
    } catch {
      /* keep what we have */
    } finally {
      setHydrated(true);
    }
  }, [canView]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void reload();
  }, [reload]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const log = useCallback(
    (input: AuditLogInput) => {
      void api("POST", "/api/audit", input).catch(() => undefined);
      if (canView) {
        // Show it straight away; the next reload replaces this with the server's copy.
        const local: AuditEntry = { id: `local:${crypto.randomUUID()}`, at: new Date().toISOString(), userId: runtime.actor.id, userName: runtime.actor.name, device: shortDevice(), source: "native", ...input };
        setEntries((prev) => [local, ...prev]);
      }
    },
    [canView]
  );

  const value = useMemo<AuditContextValue>(() => ({ entries, hydrated, log, reload }), [entries, hydrated, log, reload]);
  return <AuditContext.Provider value={value}>{children}</AuditContext.Provider>;
}

export function useAudit() {
  const ctx = useContext(AuditContext);
  if (!ctx) throw new Error("useAudit must be used within an AuditProvider");
  return ctx;
}
