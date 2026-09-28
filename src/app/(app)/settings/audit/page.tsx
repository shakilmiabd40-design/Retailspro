"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, ShieldAlert, Search, Trash2 } from "lucide-react";
import { useAccess } from "@/lib/settings/access";
import { useAudit } from "@/lib/settings/audit";
import { useAuditFeed } from "@/lib/settings/audit-feed";
import { formatDateTime } from "@/lib/settings/runtime";
import { AUDIT_MODULES, type AuditAction, type AuditEntry } from "@/lib/settings/types";
import { downloadCsv } from "@/lib/products/csv";
import { api, HttpError } from "@/lib/persist/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyRow, GhostButton, PageHeader, Section, SelectInput, SettingsGate, Tag, TextInput } from "@/components/settings/ui";

const PAGE_SIZE = 25;
const ACTION_LABELS: Record<AuditAction, string> = { create: "Create", edit: "Edit", delete: "Delete", status_change: "Status change", import: "Import", export: "Export", security: "Security" };
const ACTION_TONE: Record<AuditAction, "green" | "blue" | "red" | "brand" | "muted"> = { create: "green", edit: "blue", delete: "red", status_change: "brand", import: "muted", export: "muted", security: "red" };

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

function Diff({ entry }: { entry: AuditEntry }) {
  const keys = [...new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})])];
  if (!keys.length) {
    return (
      <p className="text-[12.5px]" style={{ color: "var(--text-faint)" }}>
        {entry.source === "derived" ? "Rebuilt from the module's own history — no before / after values were recorded." : "No before / after values for this entry."}
      </p>
    );
  }
  return (
    <table className="w-full max-w-3xl border-collapse text-[12.5px]">
      <thead>
        <tr style={{ color: "var(--text-faint)" }}>
          <th className="w-40 py-1 pr-3 text-left font-medium">Field</th>
          <th className="py-1 pr-3 text-left font-medium">Before</th>
          <th className="py-1 text-left font-medium">After</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => (
          <tr key={k} className="border-t align-top" style={{ borderColor: "var(--border-soft)" }}>
            <td className="py-1.5 pr-3 font-medium" style={{ color: "var(--text)" }}>{k}</td>
            <td className="break-all py-1.5 pr-3" style={{ color: "var(--red)" }}>{entry.before && k in entry.before ? show(entry.before[k]) : "—"}</td>
            <td className="break-all py-1.5" style={{ color: "var(--green)" }}>{entry.after && k in entry.after ? show(entry.after[k]) : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Super-Admin-only cleanup for storage-capped databases (free-tier Postgres etc.). Deletes everything
 * older than a chosen date — never the last 24h, never picked row-by-row — and always leaves a fresh
 * audit entry recording that the purge happened, so the log itself is never silently emptied.
 */
function PurgeSection() {
  const { isSuperAdmin } = useAccess();
  const { reload } = useAudit();
  const showToast = useToast();
  const [cutoff, setCutoff] = useState(monthsAgo(6));
  const [count, setCount] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect -- resets the "downloaded" flag and re-checks the count whenever the cutoff date changes */
  useEffect(() => {
    setDownloaded(false);
    if (!cutoff) {
      setCount(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const res = await api<{ count: number }>("GET", `/api/audit?before=${cutoff}&countOnly=1`);
        if (!cancelled) setCount(res.count);
      } catch {
        if (!cancelled) setCount(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cutoff]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!isSuperAdmin) {
    return (
      <Section title="Clean up old entries" description="Only a Super Admin can purge audit history.">
        <p className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          <ShieldAlert size={15} /> Ask a Super Admin.
        </p>
      </Section>
    );
  }

  async function downloadOlderThan() {
    setBusy(true);
    try {
      const res = await api<{ entries: AuditEntry[]; truncated: boolean }>("GET", `/api/audit?before=${cutoff}`);
      if (!res.entries.length) {
        showToast("Nothing older than that date", "error");
        return;
      }
      const header = ["Time", "User", "Module", "Action", "Entity", "Summary", "Before", "After", "Device"];
      const lines = res.entries.map((e) =>
        [formatDateTime(e.at), e.userName, e.module, e.action, e.entity, e.summary, e.before ? JSON.stringify(e.before) : "", e.after ? JSON.stringify(e.after) : "", e.device ?? ""]
          .map(csvCell)
          .join(",")
      );
      downloadCsv(`audit-log-before-${cutoff}.csv`, [header.join(","), ...lines].join("\n"));
      setDownloaded(true);
      if (res.truncated) showToast(`Downloaded the oldest 20,000 — more remain. Purge, then download again for the rest.`);
      else showToast(`Downloaded ${res.entries.length} entries`);
    } catch (err) {
      showToast(err instanceof HttpError ? err.message : "Couldn't build the download", "error");
    } finally {
      setBusy(false);
    }
  }

  async function purge() {
    setBusy(true);
    try {
      const res = await api<{ count: number; cutoff: string }>("DELETE", "/api/audit", { before: cutoff });
      showToast(res.count > 0 ? `Purged ${res.count} entr${res.count === 1 ? "y" : "ies"}` : "Nothing to purge");
      setConfirming(false);
      setCount(0);
      setDownloaded(false);
      await reload();
    } catch (err) {
      showToast(err instanceof HttpError ? err.message : "Couldn't purge", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Clean up old entries"
      description="Storage on a free-tier database is limited. This permanently deletes audit entries older than the date below — always in one summarised, never-deleted line: “Purged N entries before <date>”. Download a copy first."
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-48">
          <p className="mb-1 text-[11.5px]" style={{ color: "var(--text-faint)" }}>Delete everything before</p>
          <TextInput type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} max={monthsAgo(0)} />
        </div>
        <p className="pb-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          {checking ? "Checking…" : count === null ? "Pick a date" : count === 0 ? "Nothing that old — nothing to do." : `${count.toLocaleString()} ${count === 1 ? "entry matches" : "entries match"} and will be deleted.`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <GhostButton onClick={downloadOlderThan} disabled={busy || !cutoff || !count}>
          <Download size={15} />
          Download these entries first
        </GhostButton>
        <GhostButton onClick={() => setConfirming(true)} disabled={busy || !cutoff || !count}>
          <Trash2 size={15} />
          Purge entries before this date
        </GhostButton>
      </div>
      {!!count && !downloaded && <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>Tip: download a copy before you purge — once deleted, the details are gone for good.</p>}

      <ConfirmDialog
        open={confirming}
        title="Purge old audit entries?"
        message={`This permanently deletes ${count?.toLocaleString() ?? 0} ${count === 1 ? "entry" : "entries"} recorded before ${cutoff}. ${downloaded ? "You already downloaded a copy." : "You haven't downloaded a copy yet — consider that first."} This can't be undone. A single entry recording this purge (who, when, how many) will remain in the log.`}
        confirmLabel="Purge permanently"
        onCancel={() => setConfirming(false)}
        onConfirm={purge}
      />
    </Section>
  );
}

function AuditLog() {
  const { entries, hydrated } = useAuditFeed();
  const { log, reload } = useAudit();
  const { can, users } = useAccess();

  useEffect(() => {
    void reload();
  }, [reload]);
  const showToast = useToast();
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [user, setUser] = useState("all");
  const [module, setModule] = useState("all");
  const [action, setAction] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);

  const userOptions = useMemo(() => [...new Set([...users.map((u) => u.name), ...entries.map((e) => e.userName)])].sort(), [users, entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    return entries.filter((e) => {
      const t = new Date(e.at).getTime();
      if (fromMs !== null && t < fromMs) return false;
      if (toMs !== null && t > toMs) return false;
      if (user !== "all" && e.userName !== user) return false;
      if (module !== "all" && e.module !== module) return false;
      if (action !== "all" && e.action !== action) return false;
      if (q && !`${e.entity} ${e.summary} ${e.userName}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, search, from, to, user, module, action]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const rows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const anyFilter = search || from || to || user !== "all" || module !== "all" || action !== "all";

  function reset() {
    setSearch("");
    setFrom("");
    setTo("");
    setUser("all");
    setModule("all");
    setAction("all");
    setPage(1);
  }

  function exportCsv() {
    if (!filtered.length) return showToast("Nothing to export", "error");
    const header = ["Time", "User", "Module", "Action", "Entity", "Summary", "Before", "After", "Device"];
    const lines = filtered.map((e) => [formatDateTime(e.at), e.userName, e.module, ACTION_LABELS[e.action], e.entity, e.summary, e.before ? JSON.stringify(e.before) : "", e.after ? JSON.stringify(e.after) : "", e.device ?? ""].map(csvCell).join(","));
    downloadCsv(`audit-log-${Date.now()}.csv`, [header.join(","), ...lines].join("\n"));
    log({ module: "Data", action: "export", entity: "Audit log", summary: `Exported ${filtered.length} audit entries` });
    showToast(`Exported ${filtered.length} entries`);
  }

  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="focus-ring flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border px-3 py-2" style={{ background: "var(--surface)", borderColor: "var(--border)" }}>
          <Search size={15} style={{ color: "var(--text-faint)" }} />
          <input value={search} onChange={(e) => set(setSearch)(e.target.value)} placeholder="Search entity or summary…" className="w-full bg-transparent text-[13px] outline-none" style={{ color: "var(--text)" }} />
        </label>
        <div className="w-40">
          <p className="mb-1 text-[11.5px]" style={{ color: "var(--text-faint)" }}>From</p>
          <TextInput type="date" value={from} onChange={(e) => set(setFrom)(e.target.value)} />
        </div>
        <div className="w-40">
          <p className="mb-1 text-[11.5px]" style={{ color: "var(--text-faint)" }}>To</p>
          <TextInput type="date" value={to} onChange={(e) => set(setTo)(e.target.value)} />
        </div>
        <div className="w-40">
          <p className="mb-1 text-[11.5px]" style={{ color: "var(--text-faint)" }}>User</p>
          <SelectInput value={user} onChange={set(setUser)} options={[{ value: "all", label: "All users" }, ...userOptions.map((u) => ({ value: u, label: u }))]} />
        </div>
        <div className="w-40">
          <p className="mb-1 text-[11.5px]" style={{ color: "var(--text-faint)" }}>Module</p>
          <SelectInput value={module} onChange={set(setModule)} options={[{ value: "all", label: "All modules" }, ...AUDIT_MODULES.map((m) => ({ value: m, label: m }))]} />
        </div>
        <div className="w-40">
          <p className="mb-1 text-[11.5px]" style={{ color: "var(--text-faint)" }}>Action</p>
          <SelectInput value={action} onChange={set(setAction)} options={[{ value: "all", label: "All actions" }, ...(Object.keys(ACTION_LABELS) as AuditAction[]).map((a) => ({ value: a, label: ACTION_LABELS[a] }))]} />
        </div>
        {anyFilter && <GhostButton onClick={reset}>Clear</GhostButton>}
        {can("audit", "export") && (
          <GhostButton onClick={exportCsv}>
            <Download size={15} />
            Export CSV
          </GhostButton>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left text-[13px]">
            <thead>
              <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
                <th className="w-8 px-3 py-2.5" />
                {["Time", "User", "Module", "Action", "What happened", "Device"].map((h) => (
                  <th key={h} className="px-3 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!hydrated && <EmptyRow cols={7}>Loading…</EmptyRow>}
              {hydrated && rows.length === 0 && <EmptyRow cols={7}>No activity matches those filters.</EmptyRow>}
              {rows.map((e) => {
                const isOpen = open === e.id;
                return (
                  <Fragment key={e.id}>
                    <tr className="cursor-pointer border-t hover:bg-[var(--surface-2)]" style={{ borderColor: "var(--border-soft)" }} onClick={() => setOpen(isOpen ? null : e.id)}>
                      <td className="px-3 py-2.5" style={{ color: "var(--text-faint)" }}>{isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                      <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{formatDateTime(e.at)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5" style={{ color: e.userName === "Not recorded" ? "var(--text-faint)" : "var(--text)" }}>{e.userName}</td>
                      <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--text-muted)" }}>{e.module}</td>
                      <td className="px-3 py-2.5"><Tag tone={ACTION_TONE[e.action]}>{ACTION_LABELS[e.action]}</Tag></td>
                      <td className="px-3 py-2.5">
                        <span className="font-medium" style={{ color: "var(--text)" }}>{e.entity}</span>
                        <span style={{ color: "var(--text-muted)" }}> — {e.summary}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5" style={{ color: "var(--text-faint)" }}>{e.device || "—"}</td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: "var(--surface-2)" }}>
                        <td />
                        <td colSpan={6} className="px-3 py-3">
                          <Diff entry={e} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-2.5 text-[12.5px]" style={{ borderColor: "var(--border-soft)", color: "var(--text-muted)" }}>
          <span>{filtered.length} {filtered.length === 1 ? "entry" : "entries"}</span>
          <div className="flex items-center gap-2">
            <GhostButton disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</GhostButton>
            <span>Page {current} of {pages}</span>
            <GhostButton disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</GhostButton>
          </div>
        </div>
      </div>

      <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
        Settings, users, roles, stock adjustments and data changes are recorded with before / after values. Order timelines, PO receivings, returns, warranty claims and settlement payouts are rebuilt from those modules&apos; own history — older entries don&apos;t record who did them.
      </p>
    </div>
  );
}

export default function Page() {
  return (
    <SettingsGate>
      <PageHeader title="Audit Log & Activity" description="Who did what, and when. Audit entries can't be edited or deleted from the list below." back={{ href: "/settings", label: "Settings" }} />
      <div className="mt-5 space-y-5">
        <AuditLog />
        <PurgeSection />
      </div>
    </SettingsGate>
  );
}
