"use client";

import { useRef } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { useAccess } from "@/lib/settings/access";
import { TIMEZONES } from "@/lib/settings/defaults";
import { formatDate } from "@/lib/settings/runtime";
import type { CompanySettings, DateFormat } from "@/lib/settings/types";
import { useToast } from "@/components/toast";
import { Divided, Field, FormShell, GhostButton, LockedTag, PageHeader, Section, SelectInput, SettingsGate, TextArea, TextInput, ToggleRow, useSectionForm } from "@/components/settings/ui";

const MAX_LOGO_BYTES = 300 * 1024;

function previewNumber(s: CompanySettings): string {
  const locale = s.numberGrouping === "lakh" ? "en-IN" : "en-US";
  return `\u09F3${(1234567.5).toLocaleString(locale, { minimumFractionDigits: s.decimals, maximumFractionDigits: s.decimals })}`;
}

function CompanyForm() {
  const form = useSectionForm("company");
  const { isSuperAdmin } = useAccess();
  const showToast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { draft, set } = form;

  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return showToast("Please choose an image file", "error");
    if (file.size > MAX_LOGO_BYTES) return showToast("Logo must be under 300 KB", "error");
    const reader = new FileReader();
    reader.onload = () => set("logo", String(reader.result));
    reader.readAsDataURL(file);
  }

  return (
    <FormShell
      form={form}
      allowReset={isSuperAdmin}
      resetLabel="Reset (Super Admin)"
      onSave={() => (!draft.shopName.trim() ? "Shop name is required." : draft.email && !/^\S+@\S+\.\S+$/.test(draft.email) ? "That email address doesn't look right." : null)}
    >
      <Section title="Shop profile" description="Shown in the sidebar and printed on invoices.">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}>
            {draft.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.logo} alt="Shop logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[26px] font-bold" style={{ color: "var(--brand)" }}>
                {draft.shopName.trim().charAt(0).toUpperCase() || "R"}
              </span>
            )}
          </div>
          <div className="space-y-2">
            <div className="flex gap-2">
              <GhostButton type="button" onClick={() => fileRef.current?.click()}>
                <ImagePlus size={15} />
                Upload logo
              </GhostButton>
              {draft.logo && (
                <GhostButton type="button" danger onClick={() => set("logo", "")}>
                  <Trash2 size={15} />
                  Remove
                </GhostButton>
              )}
            </div>
            <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
              PNG or JPG, under 300 KB. Square images look best.
            </p>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onLogo} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Shop name" required>
            <TextInput value={draft.shopName} onChange={(e) => set("shopName", e.target.value)} placeholder="e.g. Karim Footwear" />
          </Field>
          <Field label="Phone">
            <TextInput value={draft.phone} onChange={(e) => set("phone", e.target.value)} placeholder="01XXXXXXXXX" />
          </Field>
          <Field label="Email">
            <TextInput type="email" value={draft.email} onChange={(e) => set("email", e.target.value)} placeholder="shop@example.com" />
          </Field>
          <Field label="Trade license no. (optional)">
            <TextInput value={draft.tradeLicense} onChange={(e) => set("tradeLicense", e.target.value)} />
          </Field>
          <Field label="VAT / BIN number (optional)">
            <TextInput value={draft.vatNumber} onChange={(e) => set("vatNumber", e.target.value)} />
          </Field>
        </div>
        <Field label="Address">
          <TextArea rows={2} value={draft.address} onChange={(e) => set("address", e.target.value)} placeholder="Shop address as it should appear on invoices" />
        </Field>
      </Section>

      <Section title="Localization" description="Applies to every amount and date in the dashboard.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Currency" hint="This shop trades in Bangladeshi Taka.">
            <div className="flex items-center justify-between rounded-xl border px-3 py-2 text-[13px]" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text)" }}>
              BDT — Taka (&#2547;)
              <LockedTag>Fixed</LockedTag>
            </div>
          </Field>
          <Field label="Timezone">
            <SelectInput value={draft.timezone} onChange={(v) => set("timezone", v)} options={(TIMEZONES.includes(draft.timezone) ? TIMEZONES : [draft.timezone, ...TIMEZONES]).map((t) => ({ value: t, label: t }))} />
          </Field>
          <Field label="Date format">
            <SelectInput<DateFormat>
              value={draft.dateFormat}
              onChange={(v) => set("dateFormat", v)}
              options={[
                { value: "DD-MM-YYYY", label: "DD-MM-YYYY (20-09-2026)" },
                { value: "MM-DD-YYYY", label: "MM-DD-YYYY (09-20-2026)" },
                { value: "YYYY-MM-DD", label: "YYYY-MM-DD (2026-09-20)" },
              ]}
            />
          </Field>
          <Field label="Number grouping">
            <SelectInput
              value={draft.numberGrouping}
              onChange={(v) => set("numberGrouping", v)}
              options={[
                { value: "international", label: "1,234,567 (international)" },
                { value: "lakh", label: "12,34,567 (lakh / crore)" },
              ]}
            />
          </Field>
          <Field label="Decimal places">
            <SelectInput
              value={String(draft.decimals) as "0" | "1" | "2"}
              onChange={(v) => set("decimals", Number(v) as 0 | 1 | 2)}
              options={[
                { value: "0", label: "0 — whole taka" },
                { value: "1", label: "1" },
                { value: "2", label: "2 — poisha" },
              ]}
            />
          </Field>
        </div>
        <p className="rounded-xl px-3.5 py-2.5 text-[12.5px]" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
          Preview: <b style={{ color: "var(--text)" }}>{previewNumber(draft)}</b> · <b style={{ color: "var(--text)" }}>{formatDate(new Date(), { dateFormat: draft.dateFormat, timezone: draft.timezone })}</b>
        </p>
      </Section>

      <Section title="General">
        <Divided>
          <ToggleRow
            label="Maintenance mode"
            description="Locks everyone except Super Admins out of the dashboard — use it while doing stock counts or migrations."
            checked={draft.maintenanceMode}
            onChange={(v) => set("maintenanceMode", v)}
            disabled={!isSuperAdmin}
          />
        </Divided>
        {!isSuperAdmin && (
          <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            Only a Super Admin can change maintenance mode.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Default language (optional)" hint="Interface translation isn't available yet — this is saved for when it is.">
            <SelectInput value={draft.defaultLanguage} onChange={(v) => set("defaultLanguage", v)} options={[{ value: "en", label: "English" }, { value: "bn", label: "বাংলা (Bangla)" }]} />
          </Field>
        </div>
      </Section>
    </FormShell>
  );
}

export default function CompanySettingsPage() {
  return (
    <SettingsGate>
      <PageHeader title="Company / Shop" description="Header information, invoice details and localization defaults." back={{ href: "/settings", label: "Settings" }} />
      <div className="mt-5">
        <CompanyForm />
      </div>
    </SettingsGate>
  );
}
