"use client";

import { useEffect } from "react";
import { Check, CloudOff, Loader2 } from "lucide-react";
import { useSyncStatus } from "@/lib/persist/hooks";
import { syncManager } from "@/lib/persist/sync";
import { useToast } from "@/components/toast";

/** Shows whether changes have reached the database, and relays "someone else edited this first" notices. */
export function SyncStatus() {
  const status = useSyncStatus();
  const showToast = useToast();

  useEffect(() => {
    const off = syncManager.onNotice((n) => showToast(n.message, "error"));
    return () => {
      off();
    };
  }, [showToast]);

  let icon = <Check size={13} />;
  let label = "Saved";
  let color = "var(--text-faint)";
  if (status.state === "offline" || status.state === "error") {
    icon = <CloudOff size={13} />;
    label = status.state === "offline" ? "Offline — retrying" : "Can't save — retrying";
    color = "var(--red)";
  } else if (status.state === "saving" || status.pending) {
    icon = <Loader2 size={13} className="animate-spin" />;
    label = "Saving…";
    color = "var(--text-muted)";
  }

  return (
    <span role="status" aria-live="polite" className="hidden items-center gap-1.5 text-[12px] font-medium md:flex" style={{ color }}>
      {icon}
      {label}
    </span>
  );
}
