"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, CheckCheck, Copy, ExternalLink, PackagePlus } from "lucide-react";
import { useNotifications } from "@/lib/notifications/store";
import { CHANNEL_LABELS, OWNER_ROLE_LABELS, RESOLUTION_LABELS, STATUS_LABELS, toPayload } from "@/lib/notifications/engine";
import type { OwnerRole } from "@/lib/notifications/types";
import { useToast } from "@/components/toast";
import { InventoryStatusBadge, SeverityBadge, StateChip } from "@/components/notifications/badges";

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";
const SHORTAGE = ["replenish", "critical", "out_of_stock"];

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t py-2.5 text-[13px] first:border-t-0" style={{ borderColor: "var(--border-soft)" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-right font-medium" style={{ color: "var(--text)" }}>
        {children}
      </span>
    </div>
  );
}

export default function NotificationDetailPage() {
  const params = useParams<{ id: string }>();
  const { getNotification, hydrated, historyFor, linkedPurchaseOrders, acknowledge, resolve, assign, markRead } = useNotifications();
  const showToast = useToast();
  const n = getNotification(params.id);

  const [role, setRole] = useState<OwnerRole | null>(null);
  const [assignee, setAssignee] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Opening the details counts as reading it.
  useEffect(() => {
    if (n && !n.read) markRead(n.id);
  }, [n, markRead]);

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  if (!n) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          Notification not found
        </p>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          It may have been cleared after it was resolved.
        </p>
        <Link href="/notifications" className="focus-ring flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white" style={{ background: "var(--brand)" }}>
          <ArrowLeft size={14} />
          Back to Notifications
        </Link>
      </div>
    );
  }

  const selectedRole = role ?? n.ownerRole;
  const assigneeValue = assignee ?? n.assignee ?? "";
  const dirty = selectedRole !== n.ownerRole || assigneeValue.trim() !== (n.assignee ?? "");
  const history = historyFor(n.variantId);
  const linkedPos = linkedPurchaseOrders(n.variantId);
  const payload = JSON.stringify(toPayload(n), null, 2);
  const canCreatePo = SHORTAGE.includes(n.status) && n.state !== "resolved";
  const poHref = `/purchase-orders/new?variantId=${encodeURIComponent(n.variantId)}&qty=${n.suggestedQty ?? 1}`;

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast("Couldn't copy. Select the text and copy it manually.", "error");
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <Link href="/notifications" className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back to Notifications
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <InventoryStatusBadge status={n.status} />
            <SeverityBadge severity={n.severity} />
            <StateChip n={n} />
          </div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            {n.productName}
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {n.color} / {n.size} · {n.sku}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreatePo && (
            <Link href={poHref} className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
              <PackagePlus size={14} />
              Create purchase order
            </Link>
          )}
          {n.state === "open" && (
            <button
              onClick={() => {
                acknowledge(n.id);
                showToast("Acknowledged");
              }}
              className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              <Check size={14} />
              Acknowledge
            </button>
          )}
          {n.state !== "resolved" && (
            <button
              onClick={() => {
                resolve(n.id);
                showToast("Marked as resolved");
              }}
              className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
              style={{ borderColor: "var(--border)", color: "var(--text)" }}
            >
              <CheckCheck size={14} />
              Resolve
            </button>
          )}
        </div>
      </div>

      <section className="card p-5">
        <p className="mb-1 text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
          Suggested action
        </p>
        <p className="text-[15px] font-medium" style={{ color: "var(--text)" }}>
          {n.suggestedAction}
        </p>
        {n.state === "resolved" && n.resolution && (
          <p className="mt-2 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Resolved: {RESOLUTION_LABELS[n.resolution]}
            {n.resolvedAt ? ` · ${fmt(n.resolvedAt)}` : ""}
          </p>
        )}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <p className="mb-2 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            Details
          </p>
          <Row label="Available to sell">{n.quantityOnHand}</Row>
          <Row label="On hand / reserved">
            {n.physicalStock} / {n.reserved}
          </Row>
          <Row label="Threshold">
            {n.thresholdType ? `${n.thresholdType.replace(/_/g, " ")} · ${n.thresholdValue}` : "—"}
          </Row>
          <Row label="Location">{n.locationId}</Row>
          <Row label="Source">{n.source}</Row>
          <Row label="Raised">{fmt(n.timestamp)}</Row>
          <Row label="Make">{n.make ?? "—"}</Row>
          <Row label="Specification">{n.specification ?? "—"}</Row>
          {n.reasonCode && <Row label="Reason code">{n.reasonCode.replace(/_/g, " ")}</Row>}
          <Row label="Channels">{n.channels.map((c) => CHANNEL_LABELS[c]).join(", ")}</Row>
          <Row label="Item">
            <Link href={`/products/${n.itemId}`} className="focus-ring inline-flex items-center gap-1 rounded-md" style={{ color: "var(--brand)" }}>
              Open product <ExternalLink size={12} />
            </Link>
          </Row>
        </section>

        <div className="space-y-5">
          <section className="card space-y-3 p-5">
            <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              Owner
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Role
                </span>
                <select value={selectedRole} onChange={(e) => setRole(e.target.value as OwnerRole)} className={inputClass} style={inputStyle}>
                  {(Object.keys(OWNER_ROLE_LABELS) as OwnerRole[]).map((r) => (
                    <option key={r} value={r}>
                      {OWNER_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
                  Assignee
                </span>
                <input value={assigneeValue} onChange={(e) => setAssignee(e.target.value)} placeholder="Name (optional)" className={inputClass} style={inputStyle} />
              </label>
            </div>
            <button
              disabled={!dirty}
              onClick={() => {
                assign(n.id, { ownerRole: selectedRole, assignee: assigneeValue });
                setRole(null);
                setAssignee(null);
                showToast("Owner updated");
              }}
              className="focus-ring rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--brand)" }}
            >
              Save owner
            </button>
            <div className="border-t pt-3 text-[12.5px]" style={{ borderColor: "var(--border-soft)", color: "var(--text-muted)" }}>
              {n.escalationRule ? (
                <>
                  Escalates to <b style={{ color: "var(--text)" }}>{n.escalationRule.notify.join(", ")}</b> if not acknowledged within{" "}
                  <b style={{ color: "var(--text)" }}>{n.escalationRule.ifUnacknowledgedMinutes} min</b>.
                  {n.escalatedAt && <span style={{ color: "var(--red)" }}> Escalated {fmt(n.escalatedAt)}.</span>}
                </>
              ) : (
                "No escalation rule for this status."
              )}
            </div>
          </section>

          <section className="card p-5">
            <p className="mb-2 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              Purchase orders
            </p>
            {linkedPos.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                No purchase orders include this item yet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {linkedPos.slice(0, 5).map((po) => {
                  const line = po.items.find((i) => i.variantId === n.variantId);
                  return (
                    <Link
                      key={po.id}
                      href={`/purchase-orders/${po.id}`}
                      className="focus-ring flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] hover:bg-[var(--surface-2)]"
                    >
                      <span className="font-medium" style={{ color: "var(--text)" }}>
                        {po.poNumber}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {po.status.replace(/_/g, " ")} · {line ? `${line.qtyReceived}/${line.qtyOrdered} received` : ""}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            Activity
          </p>
          <ol className="space-y-3">
            {[...n.activity].reverse().map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--brand)" }} />
                <div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                    {a.label}
                    {a.detail && <span className="font-normal" style={{ color: "var(--text-muted)" }}> · {a.detail}</span>}
                  </p>
                  <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                    {fmt(a.at)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="card p-5">
          <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            Status history
          </p>
          {history.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              No changes recorded yet.
            </p>
          ) : (
            <ol className="space-y-3">
              {history.slice(0, 10).map((h) => (
                <li key={h.id} className="text-[13px]">
                  <p style={{ color: "var(--text)" }}>
                    {h.from ? STATUS_LABELS[h.from] : "New"} → <b>{STATUS_LABELS[h.to]}</b>
                    <span style={{ color: "var(--text-muted)" }}> · {h.quantityOnHand} available</span>
                  </p>
                  <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                    {fmt(h.timestamp)} · {h.actor}
                    {h.note ? ` · ${h.note}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              API payload
            </p>
            <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
              The JSON a webhook or API consumer receives for this notification.
            </p>
          </div>
          <button
            onClick={copyPayload}
            className="focus-ring flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Copied" : "Copy JSON"}
          </button>
        </div>
        <pre className="max-h-96 overflow-auto rounded-xl p-4 text-[12px] leading-relaxed" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
          {payload}
        </pre>
      </section>
    </div>
  );
}
