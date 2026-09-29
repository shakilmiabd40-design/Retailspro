"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { useWarranty } from "@/lib/warranty/store";
import { useSettings } from "@/lib/settings/store";
import { useToast } from "@/components/toast";
import { WarrantyStatusBadge } from "@/components/warranty/status-badge";
import { canClaim, daysLeft, effectiveStatus } from "@/lib/warranty/utils";
import type { ClaimStatus } from "@/lib/warranty/types";

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";

const CLAIM_STATUS_OPTIONS: ClaimStatus[] = ["submitted", "approved", "rejected", "in_service", "replaced", "refunded", "closed"];

export default function WarrantyDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getWarranty, hydrated, addClaim, updateClaimStatus } = useWarranty();
  const showToast = useToast();
  const { settings } = useSettings();
  const issueTypes = settings.warranty.claimIssueTypes;
  const warranty = getWarranty(params.id);

  const [showClaimForm, setShowClaimForm] = useState(false);
  const [issueType, setIssueType] = useState("");
  const [description, setDescription] = useState("");

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  if (!warranty) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Warranty not found</p>
        <Link href="/warranty" className="focus-ring mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white" style={{ background: "var(--brand)" }}>
          <ArrowLeft size={14} />
          Back to Warranty
        </Link>
      </div>
    );
  }

  const status = effectiveStatus(warranty);
  const eligible = canClaim(warranty);

  function submitClaim() {
    if (!warranty) return;
    addClaim(warranty.id, { issueType: issueTypes.includes(issueType) ? issueType : (issueTypes[0] ?? "Other"), description });
    showToast("Claim submitted");
    setShowClaimForm(false);
    setDescription("");
  }

  return (
    <>
      <button onClick={() => router.back()} className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back
      </button>

      <div className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[19px] font-semibold" style={{ color: "var(--text)" }}>#{warranty.warrantyNumber}</h1>
            <WarrantyStatusBadge status={status} />
          </div>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            {warranty.productName} ({warranty.color}/{warranty.size}) · Qty {warranty.qty}
          </p>
        </div>
        {eligible && (
          <button onClick={() => setShowClaimForm((v) => !v)} className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
            <Plus size={14} />
            Create Claim
          </button>
        )}
        {!eligible && warranty.status !== "void" && status === "expired" && (
          <p className="text-[12.5px]" style={{ color: "var(--text-faint)" }}>Warranty expired — claims are no longer accepted.</p>
        )}
        {warranty.status === "void" && (
          <p className="text-[12.5px]" style={{ color: "var(--red)" }}>Void — {warranty.voidReason}</p>
        )}
      </div>

      {showClaimForm && (
        <section className="card space-y-4 p-5">
          <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>New Claim</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>Issue Type</span>
              <select value={issueTypes.includes(issueType) ? issueType : (issueTypes[0] ?? "Other")} onChange={(e) => setIssueType(e.target.value)} className={inputClass} style={inputStyle}>
                {issueTypes.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>Description</span>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputClass} style={inputStyle} />
          </label>
          <button onClick={submitClaim} className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
            Submit Claim
          </button>
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="card p-5">
          <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>Customer &amp; Reference</p>
          <div className="space-y-2 text-[13px]">
            <Row label="Customer" value={`${warranty.customerName} (${warranty.customerPhone})`} />
            <Row label={warranty.source === "pos" ? "POS invoice" : "Order ID"} value={`#${warranty.orderNumber}`} />
            <Row label="Delivery Date" value={new Date(warranty.startDate).toLocaleDateString()} />
          </div>
        </div>
        <div className="card p-5">
          <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>Warranty Period</p>
          <div className="space-y-2 text-[13px]">
            <Row label="Start Date" value={new Date(warranty.startDate).toLocaleDateString()} />
            <Row label="End Date" value={new Date(warranty.endDate).toLocaleDateString()} />
            <Row label="Days Left" value={status === "active" ? `${daysLeft(warranty)} days` : "—"} />
          </div>
        </div>
      </div>

      <div className="card p-5">
        <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>Claims History</p>
        {warranty.claims.length === 0 ? (
          <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>No claims filed yet.</p>
        ) : (
          <div className="space-y-3">
            {warranty.claims.map((c) => (
              <div key={c.id} className="rounded-xl border p-3" style={{ borderColor: "var(--border)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{c.claimNumber && <span className="mr-2 text-[11.5px] font-normal" style={{ color: "var(--text-faint)" }}>{c.claimNumber}</span>}{c.issueType}</p>
                  <select
                    value={c.status}
                    onChange={(e) => updateClaimStatus(warranty.id, c.id, e.target.value as ClaimStatus, c.resolutionNotes)}
                    className="focus-ring rounded-lg border px-2 py-1 text-[12px]"
                    style={inputStyle}
                  >
                    {CLAIM_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s.replace("_", " ")}</option>
                    ))}
                  </select>
                </div>
                {c.description && <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>{c.description}</p>}
                <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-faint)" }}>Submitted {new Date(c.submittedAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: "var(--text)" }}>{value}</span>
    </div>
  );
}
