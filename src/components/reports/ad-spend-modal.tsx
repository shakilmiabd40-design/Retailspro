"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { api } from "@/lib/persist/api";
import { useToast } from "@/components/toast";
import type { AdSpendEntry, AdSpendInput } from "@/lib/marketing/types";

export function AdSpendModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: () => void }) {
  const showToast = useToast();
  const [entries, setEntries] = useState<AdSpendEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const today = new Date().toISOString().slice(0, 10);
  const [spendDate, setSpendDate] = useState(today);
  const [platform, setPlatform] = useState<"meta" | "facebook" | "instagram" | "google" | "tiktok" | "other">("meta");
  const [campaignName, setCampaignName] = useState("");
  const [adSetName, setAdSetName] = useState("");
  const [adName, setAdName] = useState("");
  const [spend, setSpend] = useState("");

  const loadEntries = async () => {
    setLoading(true);
    try {
      const res = await api<{ entries: AdSpendEntry[] }>("GET", "/api/marketing/ad-spend");
      setEntries(res.entries || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void loadEntries();
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!campaignName.trim()) {
      showToast("Campaign name is required", "error");
      return;
    }
    const numSpend = Number(spend);
    if (!(numSpend > 0)) {
      showToast("Spend must be greater than 0", "error");
      return;
    }

    setSubmitting(true);
    try {
      await api("POST", "/api/marketing/ad-spend", {
        entry: {
          spendDate,
          platform,
          campaignName: campaignName.trim(),
          adSetName: adSetName.trim() || undefined,
          adName: adName.trim() || undefined,
          spend: numSpend,
        },
      });
      showToast("Ad spend saved successfully");
      setSpend("");
      setAdSetName("");
      setAdName("");
      void loadEntries();
      onSaved?.();
    } catch (err: any) {
      showToast(err?.message || "Failed to save ad spend", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api("DELETE", `/api/marketing/ad-spend?id=${id}`);
      showToast("Entry deleted");
      setEntries((prev) => prev.filter((e) => e.id !== id));
      onSaved?.();
    } catch {
      showToast("Failed to delete entry", "error");
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = String(event.target?.result || "");
        const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          showToast("CSV must have a header row and at least one data row", "error");
          return;
        }

        const entriesToSave: AdSpendInput[] = [];
        // Expected format: date,platform,campaign,adset,ad,spend
        for (let i = 1; i < lines.length; i++) {
          const parts = lines[i].split(",").map((p) => p.trim());
          if (parts.length >= 4) {
            const rowDate = parts[0];
            const rowPlatform = (parts[1] || "meta").toLowerCase();
            const rowCampaign = parts[2];
            const rowAdSet = parts[3] || "";
            const rowAd = parts[4] || "";
            const rowSpend = Number(parts[5] || parts[3]);
            if (/^\d{4}-\d{2}-\d{2}$/.test(rowDate) && rowCampaign && rowSpend > 0) {
              entriesToSave.push({
                spendDate: rowDate,
                platform: (["meta", "facebook", "instagram", "google", "tiktok"].includes(rowPlatform) ? rowPlatform : "meta") as any,
                campaignName: rowCampaign,
                adSetName: rowAdSet || undefined,
                adName: rowAd || undefined,
                spend: rowSpend,
              });
            }
          }
        }

        if (!entriesToSave.length) {
          showToast("No valid rows found in CSV. Format: date,platform,campaign,adset,ad,spend", "error");
          return;
        }

        await api("POST", "/api/marketing/ad-spend", { entries: entriesToSave });
        showToast(`Imported ${entriesToSave.length} ad spend rows!`);
        void loadEntries();
        onSaved?.();
      } catch (err: any) {
        showToast(err?.message || "Failed to parse CSV", "error");
      }
    };
    reader.readAsText(file);
  };

  const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
  const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border bg-white p-6 shadow-xl dark:bg-[#18181b]" style={{ borderColor: "var(--border)" }}>
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5" style={{ color: "var(--text-faint)" }}>
          <X size={18} />
        </button>

        <h2 className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>
          Marketing Ad Spend
        </h2>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
          Record daily ad spend per platform and campaign to measure real ROAS and profit after ads.
        </p>

        {/* Entry form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4 rounded-xl border p-4" style={{ borderColor: "var(--border-soft)", background: "var(--surface-2)" }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
                Date
              </label>
              <input type="date" value={spendDate} onChange={(e) => setSpendDate(e.target.value)} required className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
                Platform
              </label>
              <select value={platform} onChange={(e) => setPlatform(e.target.value as any)} className={inputClass} style={inputStyle}>
                <option value="meta">Meta (FB + IG)</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
                <option value="google">Google</option>
                <option value="tiktok">TikTok</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
                Spend (BDT ৳)
              </label>
              <input type="number" min="1" step="any" placeholder="e.g. 2500" value={spend} onChange={(e) => setSpend(e.target.value)} required className={inputClass} style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
                Campaign Name
              </label>
              <input placeholder="e.g. Eid_Shoe_Sale" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} required className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
                Ad Set (optional)
              </label>
              <input placeholder="e.g. Dhaka_Sneaker_Lover" value={adSetName} onChange={(e) => setAdSetName(e.target.value)} className={inputClass} style={inputStyle} />
            </div>
            <div>
              <label className="mb-1 block text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
                Ad Name (optional)
              </label>
              <input placeholder="e.g. Video_Carousel_1" value={adName} onChange={(e) => setAdName(e.target.value)} className={inputClass} style={inputStyle} />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--brand)" }}>
              <Upload size={14} />
              <span>Import CSV</span>
              <input type="file" accept=".csv" onChange={handleCsvUpload} className="hidden" />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="focus-ring flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--brand)" }}
            >
              <Plus size={14} />
              <span>{submitting ? "Saving..." : "Add Spend Entry"}</span>
            </button>
          </div>
        </form>

        {/* Existing entries */}
        <div className="mt-6">
          <p className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
            Recent Ad Spend Entries ({entries.length})
          </p>
          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            {loading ? (
              <p className="py-6 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>Loading ad spend...</p>
            ) : entries.length === 0 ? (
              <p className="py-6 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>No ad spend recorded yet.</p>
            ) : (
              <table className="w-full border-collapse text-left text-[12.5px]">
                <thead>
                  <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Platform</th>
                    <th className="px-3 py-2 font-medium">Campaign</th>
                    <th className="px-3 py-2 font-medium text-right">Spend</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                      <td className="px-3 py-2 font-mono text-[12px]" style={{ color: "var(--text)" }}>{entry.spendDate}</td>
                      <td className="px-3 py-2 capitalize" style={{ color: "var(--text-muted)" }}>{entry.platform}</td>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>{entry.campaignName}</td>
                      <td className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text)" }}>৳{entry.spend.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">
                        <button type="button" onClick={() => handleDelete(entry.id)} className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-950">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
