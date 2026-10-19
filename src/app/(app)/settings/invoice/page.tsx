"use client";

import { useMemo, useState } from "react";
import { Eye } from "lucide-react";
import type { Order } from "@/lib/orders/types";
import type { NumberingSettings } from "@/lib/settings/types";
import { useSettings } from "@/lib/settings/store";
import { InvoiceView } from "@/components/settings/invoice-view";
import { Divided, Field, FormShell, GhostButton, Modal, NumberInput, PageHeader, Section, SelectInput, SettingsGate, TextArea, TextInput, ToggleRow, useSectionForm } from "@/components/settings/ui";

function sampleOrder(): Order {
  const now = new Date().toISOString();
  return {
    id: "sample",
    orderNumber: "ORD-10241",
    status: "delivered",
    customerName: "Nusrat Jahan",
    phone: "01712 345 678",
    address: "House 12, Road 5, Sector 7",
    area: "Uttara",
    district: "Dhaka",
    items: [
      { id: "1", productId: "p1", productName: "Air Runner", variantId: "v1", color: "Black", size: "42", sku: "NIK-AIRRUNNER-BLK-42", price: 3200, qty: 1, discount: 200 },
      { id: "2", productId: "p2", productName: "Classic Loafer", variantId: "v2", color: "Brown", size: "41", sku: "BAT-CLASSICL-BRN-41", price: 2450, qty: 2, discount: 0 },
    ],
    deliveryCharge: 70,
    courier: { company: "Steadfast", trackingId: "STF-1", forwardCost: 100, returnCost: 0, otherCost: 0 },
    delivery: { customerPaid: 7770 },
    returnInfo: { returnRequired: false, returnReceived: false },
    cancellation: {},
    activity: [],
    createdAt: now,
    updatedAt: now,
  };
}

const NUMBERING: { key: keyof NumberingSettings; label: string; example: string }[] = [
  { key: "order", label: "Order number prefix", example: "10241" },
  { key: "po", label: "Purchase order prefix", example: "3002" },
  { key: "return", label: "Return prefix", example: "5001" },
  { key: "warranty", label: "Warranty prefix", example: "1001" },
  { key: "claim", label: "Claim prefix", example: "2001" },
  { key: "posInvoice", label: "POS invoice prefix", example: "1001" },
  { key: "posReturn", label: "POS return / exchange prefix", example: "1001" },
  { key: "posSession", label: "POS session prefix", example: "1001" },
];

function InvoiceForm() {
  const form = useSectionForm("invoice");
  const { settings } = useSettings();
  const { draft, set } = form;
  const sample = useMemo(() => sampleOrder(), []);
  const [preview, setPreview] = useState(false);

  const setNum = (k: keyof NumberingSettings, v: string) => set("numbering", { ...draft.numbering, [k]: v.toUpperCase() });
  const setTpl = <K extends keyof typeof draft.template>(k: K, v: (typeof draft.template)[K]) => set("template", { ...draft.template, [k]: v });
  const setPrint = <K extends keyof typeof draft.print>(k: K, v: (typeof draft.print)[K]) => set("print", { ...draft.print, [k]: v });

  function validate(): string | null {
    const prefixes = Object.values(draft.numbering).map((p) => p.trim());
    if (prefixes.some((p) => !p)) return "Every number prefix is required.";
    if (prefixes.some((p) => p.length > 8)) return "Prefixes can be up to 8 characters.";
    if (new Set(prefixes).size !== prefixes.length) return "Each prefix must be different.";
    if (draft.print.labelWidthMm < 20 || draft.print.labelHeightMm < 15) return "Label size is too small (min 20 × 15 mm).";
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_420px]">
      <FormShell form={form} onSave={validate}>
        <Section title="Numbering" description="Applies to new records only — existing numbers never change.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {NUMBERING.map((n) => (
              <Field key={n.key} label={n.label} hint={<>Next one looks like <b style={{ color: "var(--text)" }}>{draft.numbering[n.key]}{n.example}</b></>}>
                <TextInput value={draft.numbering[n.key]} maxLength={8} onChange={(e) => setNum(n.key, e.target.value)} className="font-mono" />
              </Field>
            ))}
          </div>
        </Section>

        <Section title="Invoice template" description="What appears on printed invoices." actions={<GhostButton type="button" className="2xl:hidden" onClick={() => setPreview(true)}><Eye size={15} />Preview</GhostButton>}>
          <Divided>
            <ToggleRow label="Show logo" checked={draft.template.showLogo} onChange={(v) => setTpl("showLogo", v)} />
            <ToggleRow label="Show shop address" checked={draft.template.showAddress} onChange={(v) => setTpl("showAddress", v)} />
            <ToggleRow label="Show customer phone" checked={draft.template.showCustomerPhone} onChange={(v) => setTpl("showCustomerPhone", v)} />
            <ToggleRow label="Show customer address" checked={draft.template.showCustomerAddress} onChange={(v) => setTpl("showCustomerAddress", v)} />
            <ToggleRow label="Show delivery charge line" checked={draft.template.showDeliveryCharge} onChange={(v) => setTpl("showDeliveryCharge", v)} />
            <ToggleRow label="Show paid / collected amount" checked={draft.template.showPaidAmount} onChange={(v) => setTpl("showPaidAmount", v)} />
          </Divided>
          <Field label="Terms / notes">
            <TextArea rows={3} value={draft.template.terms} onChange={(e) => setTpl("terms", e.target.value)} />
          </Field>
          <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
            Shop name, logo, address, phone and license numbers come from Company / Shop.
          </p>
        </Section>

        <Section title="Print options">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Default paper size" hint="Can be switched on the invoice screen before printing.">
              <SelectInput value={draft.print.paperSize} onChange={(v) => setPrint("paperSize", v)} options={[{ value: "a4", label: "A4" }, { value: "pos", label: "POS receipt (80 mm)" }]} />
            </Field>
          </div>
        </Section>

        <Section title="Barcode label" description="Template for printed product labels.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Label width (mm)">
              <NumberInput min={20} value={draft.print.labelWidthMm} onChange={(v) => setPrint("labelWidthMm", v)} />
            </Field>
            <Field label="Label height (mm)">
              <NumberInput min={15} value={draft.print.labelHeightMm} onChange={(v) => setPrint("labelHeightMm", v)} />
            </Field>
          </div>
          <Divided>
            <ToggleRow label="Product name" checked={draft.print.labelShowName} onChange={(v) => setPrint("labelShowName", v)} />
            <ToggleRow label="Selling price" checked={draft.print.labelShowPrice} onChange={(v) => setPrint("labelShowPrice", v)} />
            <ToggleRow label="SKU text under barcode" checked={draft.print.labelShowSku} onChange={(v) => setPrint("labelShowSku", v)} />
          </Divided>
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center justify-center gap-0.5 rounded border border-dashed p-1.5 text-center" style={{ width: draft.print.labelWidthMm * 3.2, height: draft.print.labelHeightMm * 3.2, background: "#fff", color: "#14161b", borderColor: "#9aa1ad", fontSize: 9 }}>
              {draft.print.labelShowName && <span style={{ fontWeight: 600 }}>Air Runner</span>}
              <span style={{ letterSpacing: -1, fontSize: 18, lineHeight: 1 }}>▌▌▎▌▎▎▌▌▎▌</span>
              {draft.print.labelShowSku && <span style={{ fontFamily: "monospace" }}>NIK-AIRRUNNER-BLK-42</span>}
              {draft.print.labelShowPrice && <span style={{ fontWeight: 700 }}>৳3,200</span>}
            </div>
            <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
              Preview ({draft.print.labelWidthMm} × {draft.print.labelHeightMm} mm). Barcode type: {settings.products.barcodeType === "ean13" ? "EAN-13" : "Code 128"} (Product Settings).
            </p>
          </div>
        </Section>
      </FormShell>

      <Modal open={preview} onClose={() => setPreview(false)} title="Invoice preview" wide footer={<GhostButton onClick={() => setPreview(false)}>Close</GhostButton>}>
        <div className="overflow-x-auto">
          <InvoiceView order={sample} company={settings.company} invoice={draft} />
        </div>
      </Modal>

      <div className="hidden 2xl:block">
        <div className="sticky top-20 space-y-2">
          <p className="text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>Invoice preview</p>
          <div className="overflow-auto rounded-2xl p-3" style={{ background: "var(--surface-2)", maxHeight: "calc(100vh - 140px)" }}>
            <div style={{ transform: "scale(0.5)", transformOrigin: "top left", width: draft.print.paperSize === "pos" ? 302 : 794, marginBottom: draft.print.paperSize === "pos" ? -170 : -330 }}>
              <InvoiceView order={sample} company={settings.company} invoice={draft} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <SettingsGate>
      <PageHeader title="Invoice, Numbering & Printing" description="Number prefixes, the invoice template and print sizes." back={{ href: "/settings", label: "Settings" }} />
      <div className="mt-5">
        <InvoiceForm />
      </div>
    </SettingsGate>
  );
}
