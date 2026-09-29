"use client";

import { useEffect, useState } from "react";
import { useSyncStatus } from "@/lib/persist/hooks";
import { usePos } from "./store";

export type SaveState = "idle" | "saving" | "saved" | "slow" | "failed";

/**
 * A sale is recorded in the browser first and saved to the server a moment later. Usually that just takes a
 * beat. The one real failure mode is a same-instant conflict: another sale changes the very same product at the
 * very same moment, the server refuses the whole compound write, and the POS store (see store.tsx) tears the
 * sale's local invoice/warranty/order back down again — it was never really recorded. `saleWasRolledBack` is the
 * store's own record of that happening, so this hook doesn't have to guess from watching things disappear.
 *
 *  saving → waiting for the server ·  saved → confirmed ·  slow → still waiting after 6 s (offline?) ·  failed → torn up
 */
export function useSaleConfirmation(pending: { id: string; at: number } | null): SaveState {
  const { getInvoice, saleWasRolledBack, stopWatchingSale } = usePos();
  const sync = useSyncStatus();
  const id = pending?.id ?? null;

  const present = !!(id && getInvoice(id));
  const saved = present && !sync.pending && sync.state === "idle" && sync.lastSavedAt !== null && !!pending && sync.lastSavedAt >= pending.at;

  // Once confirmed saved, nothing can tear it up any more — stop tracking it so the store doesn't watch forever.
  useEffect(() => {
    if (id && saved) stopWatchingSale(id);
  }, [id, saved, stopWatchingSale]);

  const [slowFor, setSlowFor] = useState<string | null>(null);
  useEffect(() => {
    if (!id) return;
    const t = setTimeout(() => setSlowFor(id), 6000);
    return () => clearTimeout(t);
  }, [id]);

  if (!pending) return "idle";
  if (saleWasRolledBack(pending.id)) return "failed";
  if (saved) return "saved";
  if (slowFor === pending.id) return "slow";
  return "saving";
}
