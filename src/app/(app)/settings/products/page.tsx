"use client";

import { useState } from "react";
import clsx from "clsx";
import { useProducts } from "@/lib/products/store";
import { useSettings } from "@/lib/settings/store";
import { useAccess } from "@/lib/settings/access";
import { buildSku } from "@/lib/settings/sku";
import { buildBarcode } from "@/lib/settings/barcode";
import type { ProductSettings } from "@/lib/settings/types";
import { TagListManager } from "@/components/products/tag-list-manager";
import { BrandManager, CategoryManager } from "@/components/settings/catalog-managers";
import { Divided, Field, FormShell, ListEditor, PageHeader, ReadOnlyBanner, Section, SelectInput, SettingsGate, TextInput, ToggleRow, useSectionForm } from "@/components/settings/ui";

const TABS = ["Categories", "Brands", "Attributes", "SKU & Barcode"] as const;
type Tab = (typeof TABS)[number];

/** Saves as soon as a list changes — these are master data, not a form. */
function LiveList({ title, description, field, placeholder }: { title: string; description: string; field: "genders" | "shoeTypes" | "materials"; placeholder: string }) {
  const { settings, saveSection } = useSettings();
  const { can } = useAccess();
  const { products } = useProducts();
  const items = settings.products[field];
  const canEdit = can("settings", "edit");
  const usedBy = field === "genders" ? "gender" : field === "shoeTypes" ? "shoeType" : "material";
  const inUse = items.filter((i) => products.some((p) => p[usedBy] === i)).length;

  return (
    <Section title={title} description={description}>
      <fieldset disabled={!canEdit} className="min-w-0 border-0 p-0">
        <ListEditor items={items} onChange={(next) => saveSection("products", { ...settings.products, [field]: next })} placeholder={placeholder} />
      </fieldset>
      {inUse > 0 && (
        <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
          {inUse} of these are used by existing products; removing one keeps it on those products.
        </p>
      )}
    </Section>
  );
}

function AttributesTab() {
  const { catalog, products, addCatalogItem, removeCatalogItem } = useProducts();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <TagListManager title="Sizes" description="Shoe sizes offered when building variants (39, 40, 41…)." items={catalog.sizes} onAdd={(v) => addCatalogItem("sizes", v)} onRemove={(v) => removeCatalogItem("sizes", v)} usageCount={(v) => products.filter((p) => p.sizes.includes(v)).length} placeholder="e.g. 45" />
        <TagListManager title="Colors" description="Colors offered when building variants." items={catalog.colors} onAdd={(v) => addCatalogItem("colors", v)} onRemove={(v) => removeCatalogItem("colors", v)} usageCount={(v) => products.filter((p) => p.colors.includes(v)).length} placeholder="e.g. Green" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <LiveList title="Gender (optional)" description="Options on the product form." field="genders" placeholder="e.g. Boys" />
        <LiveList title="Shoe type" description="Suggestions for the shoe-type field." field="shoeTypes" placeholder="e.g. Slippers" />
        <LiveList title="Material" description="Suggestions for the material field." field="materials" placeholder="e.g. Suede" />
      </div>
    </div>
  );
}

function SkuForm() {
  const form = useSectionForm("products");
  const { draft, set } = form;
  const sample = buildSku(draft.skuFormat, { brand: "Nike", product: "Air Runner", color: "Black", size: "42" });
  const valid = /\{(BRAND|PRODUCT|COLOR|SIZE)\}/.test(draft.skuFormat);

  return (
    <FormShell form={form} onSave={() => (!draft.skuFormat.trim() ? "Enter a SKU format." : !valid ? "The SKU format needs at least one token, e.g. {BRAND}." : null)}>
      <Section title="SKU rules" description="How new product and variant SKUs are generated.">
        <Divided>
          <ToggleRow label="Auto-generate SKU" description="Fill the SKU field automatically while typing a product name. You can still overwrite it." checked={draft.skuAutoGenerate} onChange={(v) => set("skuAutoGenerate", v)} />
        </Divided>
        <Field label="SKU format template" hint={<>Tokens: <code>{"{BRAND}"}</code> <code>{"{PRODUCT}"}</code> <code>{"{COLOR}"}</code> <code>{"{SIZE}"}</code></>}>
          <TextInput value={draft.skuFormat} onChange={(e) => set("skuFormat", e.target.value.toUpperCase().replace(/[^A-Z0-9{}\-_]/g, ""))} />
        </Field>
        <p className="rounded-xl px-3.5 py-2.5 text-[12.5px]" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
          Example: <b style={{ color: "var(--text)" }}>{sample || "—"}</b>
        </p>
      </Section>
      <Section title="Barcode" description="Symbology used for barcode labels, and whether new variants get one automatically.">
        <div className="max-w-xs">
          <Field label="Barcode type">
            <SelectInput<ProductSettings["barcodeType"]>
              value={draft.barcodeType}
              onChange={(v) => {
                set("barcodeType", v);
                if (v === "ean13" && draft.barcodeMode === "sku") set("barcodeMode", "sequence");
              }}
              options={[{ value: "code128", label: "Code 128 (any text)" }, { value: "ean13", label: "EAN-13 (13 digits)" }]}
            />
          </Field>
        </div>
        <Divided>
          <ToggleRow
            label="Auto-generate barcode"
            description="Fill each new variant's barcode automatically when you generate variants. You can still overwrite any value by hand."
            checked={draft.barcodeAutoGenerate}
            onChange={(v) => set("barcodeAutoGenerate", v)}
          />
        </Divided>
        {draft.barcodeAutoGenerate && (
          <>
            <Field label="How to generate it">
              <SelectInput<ProductSettings["barcodeMode"]>
                value={draft.barcodeMode}
                onChange={(v) => set("barcodeMode", v)}
                options={[
                  ...(draft.barcodeType === "code128" ? [{ value: "sku" as const, label: "Same as SKU" }] : []),
                  { value: "sequence", label: "Sequential number" },
                  { value: "random", label: "Random unique code" },
                ]}
              />
            </Field>
            {draft.barcodeMode !== "sku" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Prefix" hint={draft.barcodeType === "ean13" ? "Digits only (leading digits of the code)." : "Optional, e.g. your shop's initials."}>
                  <TextInput
                    value={draft.barcodePrefix}
                    onChange={(e) => set("barcodePrefix", draft.barcodeType === "ean13" ? e.target.value.replace(/\D+/g, "").slice(0, 11) : e.target.value.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8))}
                  />
                </Field>
                {draft.barcodeType === "code128" && (
                  <Field label="Digits" hint="How many digits the number is padded to.">
                    <TextInput type="number" min={3} max={14} value={String(draft.barcodeDigits)} onChange={(e) => set("barcodeDigits", Math.min(14, Math.max(3, Number(e.target.value) || 6)))} />
                  </Field>
                )}
              </div>
            )}
            <p className="rounded-xl px-3.5 py-2.5 text-[12.5px]" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
              Example: <b style={{ color: "var(--text)" }}>{buildBarcode(draft, 1, buildSku(draft.skuFormat, { brand: "Nike", product: "Air Runner", color: "Black", size: "42" }) || "NK-AIRRUNNER-BLA-42")}</b>
            </p>
          </>
        )}
      </Section>
    </FormShell>
  );
}

function ProductSettingsView() {
  const [tab, setTab] = useState<Tab>("Categories");
  const { can } = useAccess();
  return (
    <div className="space-y-5">
      <PageHeader title="Product Settings" description="Master data for products — categories, brands, shoe attributes and SKU rules." back={{ href: "/settings", label: "Settings" }} />
      {!can("settings", "edit") && <ReadOnlyBanner />}
      <div className="flex gap-1 overflow-x-auto border-b" style={{ borderColor: "var(--border)" }}>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={clsx("focus-ring -mb-px shrink-0 border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors")} style={{ borderColor: tab === t ? "var(--brand)" : "transparent", color: tab === t ? "var(--brand-strong)" : "var(--text-muted)" }}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Categories" && <CategoryManager />}
      {tab === "Brands" && <BrandManager />}
      {tab === "Attributes" && <AttributesTab />}
      {tab === "SKU & Barcode" && <SkuForm />}
    </div>
  );
}

export default function ProductSettingsPage() {
  return (
    <SettingsGate>
      <ProductSettingsView />
    </SettingsGate>
  );
}
