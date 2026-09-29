"use client";

import { CalendarClock } from "lucide-react";
import { useAccounting } from "@/lib/accounting/store";
import { useAccess } from "@/lib/settings/access";
import { useToast } from "@/components/toast";
import { taka } from "@/lib/reports/format";
import { GhostButton, PrimaryButton } from "@/components/settings/ui";

/** Monthly expenses (rent, salaries…) whose next month has arrived. One tap records it. */
export function DueBanner() {
  const { due, recordRecurring, stopRepeating } = useAccounting();
  const { can } = useAccess();
  const toast = useToast();
  if (!due.length) return null;
  const canCreate = can("accounting", "create");
  return (
    <div className="card space-y-2 p-4" style={{ borderColor: "var(--amber, #b45309)" }}>
      <p className="flex items-center gap-2 text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
        <CalendarClock size={16} /> {due.length} repeating expense{due.length === 1 ? " is" : "s are"} due
      </p>
      {due.map((d) => (
        <div key={d.entry.id} className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-[13px]" style={{ borderColor: "var(--border-soft)" }}>
          <span style={{ color: "var(--text)" }}>
            <b>{d.entry.category}</b> · {taka(d.entry.amount)} <span style={{ color: "var(--text-muted)" }}>· due {d.dueDate}{d.entry.party ? ` · ${d.entry.party}` : ""}</span>
          </span>
          {canCreate && (
            <span className="flex gap-2">
              <PrimaryButton
                onClick={() => {
                  const r = recordRecurring(d);
                  toast(r.ok ? "Recorded" : r.error, r.ok ? "success" : "error");
                }}
              >
                Record now
              </PrimaryButton>
              <GhostButton onClick={() => stopRepeating(d.entry.id)}>Stop repeating</GhostButton>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
