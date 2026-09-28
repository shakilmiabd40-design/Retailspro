"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileDown, Upload } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { useSuppliers } from "@/lib/suppliers/store";
import { useOrders } from "@/lib/orders/store";
import { useAccess } from "@/lib/settings/access";
import { useAudit } from "@/lib/settings/audit";
import { toCsv, toTable, type ParsedTable } from "@/lib/settings/csv-import";
import { downloadCsv, productsToCsv } from "@/lib/products/csv";
import { ORDER_STATUS_LABELS, actualCourierCost, collectedAmount, expectedCod, productSubtotal, totalDiscount, totalItemQty } from "@/lib/orders/utils";
import { formatDate } from "@/lib/settings/runtime";
import type { OrderStatus } from "@/lib/orders/types";
import type { Product } from "@/lib/products/types";
import type { Supplier } from "@/lib/suppliers/types";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { api, HttpError } from "@/lib/persist/api";
import { clearLegacyKeys, collectLegacyKeys, legacySummary } from "@/lib/settings/backup";
import { Field, GhostButton, PageHeader, PrimaryButton, ReadOnlyBanner, Section, SelectInput, SettingsGate, Tag, TextInput } from "@/components/settings/ui";

type ImportKind = "products" | "stock" | "suppliers";

const KINDS: Record<ImportKind, { label: string; required: string[]; template: string[][]; help: string }> = {
  products: {
    label: "Products",
    required: ["name", "sku"],
    template: [["name", "sku", "brand", "category", "costPrice", "sellingPrice", "stock", "status"], ["Air Runner", "NIK-AIRRUNNER", "Nike", "Sneakers", "2400", "3200", "10", "active"]],
    help: "Each row becomes a product with one default variant. New brands and categories are added to your lists automatically.",
  },
  stock: {
    label: "Opening stock",
    required: ["sku", "stock"],
    template: [["sku", "stock"], ["NIK-AIRRUNNER-BLK-42", "12"]],
    help: "Sets on-hand stock for the variant with that SKU (or for a product SKU that has a single variant).",
  },
  suppliers: {
    label: "Suppliers",
    required: ["name", "phone"],
    template: [["name", "phone", "contactPerson", "email", "city", "address"], ["Dhaka Footwear Ltd", "01711000000", "Mr. Alam", "sales@example.com", "Dhaka", "Islampur"]],
    help: "Supplier names must be unique.",
  },
};

interface Checked {
  line: number;
  label: string;
  error?: string;
  apply?: () => void;
  stockBefore?: number;
  stockAfter?: number;
}

function num(v: string): number | null {
  if (v === "") return 0;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function ExportSection() {
  const { products } = useProducts();
  const { suppliers } = useSuppliers();
  const { orders } = useOrders();
  const { can } = useAccess();
  const { log } = useAudit();
  const showToast = useToast();
  const [status, setStatus] = useState<"all" | OrderStatus>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filteredOrders = useMemo(() => {
    const f = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const t = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    return orders.filter((o) => {
      const ms = new Date(o.createdAt).getTime();
      return (status === "all" || o.status === status) && (f === null || ms >= f) && (t === null || ms <= t);
    });
  }, [orders, status, from, to]);

  function done(entity: string, count: number, filename: string, csv: string) {
    if (!count) return showToast("Nothing to export", "error");
    downloadCsv(filename, csv);
    log({ module: "Data", action: "export", entity, summary: `Exported ${count} row${count === 1 ? "" : "s"} to CSV` });
    showToast(`Exported ${count} row${count === 1 ? "" : "s"}`);
  }

  const stamp = new Date().toISOString().slice(0, 10);

  return (
    <Section title="Export" description="CSV files open in Excel and Google Sheets. Each export needs the matching Export permission.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border-soft)" }}>
          <p className="text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>Products</p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>{products.length} products · name, SKU, brand, category, prices, stock, status</p>
          <GhostButton className="mt-3" disabled={!can("products", "export")} onClick={() => done("Products", products.length, `products-${stamp}.csv`, productsToCsv(products))}>
            <FileDown size={15} />
            Export products
          </GhostButton>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border-soft)" }}>
          <p className="text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>Suppliers</p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>{suppliers.length} suppliers · contact details and status</p>
          <GhostButton
            className="mt-3"
            disabled={!can("suppliers", "export")}
            onClick={() =>
              done("Suppliers", suppliers.length, `suppliers-${stamp}.csv`, toCsv(["name", "phone", "contactPerson", "email", "city", "address", "status"], suppliers.map((s) => [s.name, s.phone, s.contactPerson ?? "", s.email ?? "", s.city ?? "", s.address ?? "", s.status])))
            }
          >
            <FileDown size={15} />
            Export suppliers
          </GhostButton>
        </div>
        <div className="rounded-xl border p-4" style={{ borderColor: "var(--border-soft)" }}>
          <p className="text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>Reports</p>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>Each report has its own CSV / print export, respecting its filters.</p>
          <Link href="/reports" className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
            Open reports
          </Link>
        </div>
      </div>

      <div className="rounded-xl border p-4" style={{ borderColor: "var(--border-soft)" }}>
        <p className="text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>Orders (filtered)</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Status">
            <SelectInput<"all" | OrderStatus> value={status} onChange={setStatus} options={[{ value: "all", label: "All statuses" }, ...(Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]).map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))]} />
          </Field>
          <Field label="Created from">
            <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Created to">
            <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <GhostButton
            disabled={!can("orders", "export")}
            onClick={() =>
              done(
                "Orders",
                filteredOrders.length,
                `orders-${stamp}.csv`,
                toCsv(
                  ["order", "date", "status", "customer", "phone", "district", "units", "subtotal", "discount", "deliveryCharge", "expectedCOD", "collected", "courier", "tracking", ...(can("orders", "financial") ? ["courierCost"] : [])],
                  filteredOrders.map((o) => [o.orderNumber, formatDate(o.createdAt), ORDER_STATUS_LABELS[o.status], o.customerName, o.phone, o.district ?? "", totalItemQty(o), productSubtotal(o), totalDiscount(o), o.deliveryCharge, expectedCod(o), collectedAmount(o), o.courier.company, o.courier.trackingId, ...(can("orders", "financial") ? [actualCourierCost(o)] : [])])
                )
              )
            }
          >
            <FileDown size={15} />
            Export {filteredOrders.length} order{filteredOrders.length === 1 ? "" : "s"}
          </GhostButton>
          {!can("orders", "financial") && <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>Courier cost is left out — it needs Financial access.</span>}
        </div>
      </div>
    </Section>
  );
}

function ImportSection() {
  const { products, addProduct, addCatalogItem, bulkUpdateStock } = useProducts();
  const { suppliers, addSupplier } = useSuppliers();
  const { can } = useAccess();
  const { log } = useAudit();
  const showToast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<ImportKind>("products");
  const [fileName, setFileName] = useState("");
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);

  const canImport = can("settings", "edit");
  const spec = KINDS[kind];

  const checked: Checked[] = useMemo(() => {
    if (!table || fatal) return [];
    const out: Checked[] = [];
    const seen = new Set<string>();

    if (kind === "products") {
      const existing = new Set(products.map((p) => p.sku.toLowerCase()));
      for (const r of table.rows) {
        const v = r.values;
        const label = `${v.name || "(no name)"} · ${v.sku || "(no SKU)"}`;
        const cost = num(v.costPrice ?? "");
        const price = num(v.sellingPrice ?? "");
        const stock = num(v.stock ?? v.totalStock ?? "");
        let error: string | undefined;
        if (!v.name) error = "Name is required";
        else if (!v.sku) error = "SKU is required";
        else if (existing.has(v.sku.toLowerCase())) error = "SKU already exists in Products";
        else if (seen.has(v.sku.toLowerCase())) error = "Duplicate SKU in this file";
        else if (cost === null || price === null) error = "Cost / selling price must be a number ≥ 0";
        else if (stock === null || !Number.isInteger(stock)) error = "Stock must be a whole number ≥ 0";
        else if (v.status && !["active", "inactive"].includes(v.status.toLowerCase())) error = "Status must be active or inactive";
        if (v.sku) seen.add(v.sku.toLowerCase());
        out.push({
          line: r.line,
          label,
          error,
          apply: error
            ? undefined
            : () => {
                const brand = v.brand || "Unbranded";
                const category = v.category || "Uncategorized";
                if (v.brand) addCatalogItem("brands", brand);
                if (v.category) addCatalogItem("categories", category);
                const product: Product = {
                  id: crypto.randomUUID(),
                  name: v.name,
                  sku: v.sku,
                  brand,
                  category,
                  status: v.status?.toLowerCase() === "inactive" ? "inactive" : "active",
                  costPrice: cost!,
                  sellingPrice: price!,
                  colors: ["Default"],
                  sizes: ["OS"],
                  variants: [{ id: crypto.randomUUID(), color: "Default", size: "OS", sku: `${v.sku}-DEF-OS`, barcode: "", cost: cost!, price: price!, stock: stock!, reserved: 0, status: "active" }],
                  createdAt: new Date().toISOString(),
                };
                addProduct(product);
              },
        });
      }
    } else if (kind === "stock") {
      const bySku = new Map<string, { productId: string; variantId: string; stock: number }>();
      for (const p of products) {
        for (const va of p.variants) bySku.set(va.sku.toLowerCase(), { productId: p.id, variantId: va.id, stock: va.stock });
        if (p.variants.length === 1) bySku.set(p.sku.toLowerCase(), { productId: p.id, variantId: p.variants[0].id, stock: p.variants[0].stock });
      }
      for (const r of table.rows) {
        const sku = r.values.sku;
        const n = num(r.values.stock ?? "");
        const hit = sku ? bySku.get(sku.toLowerCase()) : undefined;
        let error: string | undefined;
        if (!sku) error = "SKU is required";
        else if (!hit) error = "No product or variant with that SKU";
        else if (n === null || !Number.isInteger(n)) error = "Stock must be a whole number ≥ 0";
        else if (seen.has(sku.toLowerCase())) error = "Duplicate SKU in this file";
        if (sku) seen.add(sku.toLowerCase());
        out.push({
          line: r.line,
          label: `${sku || "(no SKU)"} → ${r.values.stock || "?"}`,
          error,
          stockBefore: hit?.stock,
          stockAfter: n ?? undefined,
          apply: error ? undefined : () => bulkUpdateStock([{ productId: hit!.productId, variantId: hit!.variantId, value: n!, mode: "set" }]),
        });
      }
    } else {
      const names = new Set(suppliers.map((s) => s.name.toLowerCase()));
      for (const r of table.rows) {
        const v = r.values;
        let error: string | undefined;
        if (!v.name) error = "Name is required";
        else if (!v.phone) error = "Phone is required";
        else if (names.has(v.name.toLowerCase())) error = "A supplier with this name already exists";
        else if (seen.has(v.name.toLowerCase())) error = "Duplicate name in this file";
        else if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) error = "Email doesn't look right";
        if (v.name) seen.add(v.name.toLowerCase());
        out.push({
          line: r.line,
          label: `${v.name || "(no name)"} · ${v.phone || "(no phone)"}`,
          error,
          apply: error
            ? undefined
            : () => {
                const s: Supplier = { id: crypto.randomUUID(), name: v.name, phone: v.phone, contactPerson: v.contactPerson || undefined, email: v.email || undefined, city: v.city || undefined, address: v.address || undefined, status: "active", archived: false, createdAt: new Date().toISOString() };
                addSupplier(s);
              },
        });
      }
    }
    return out;
  }, [table, fatal, kind, products, suppliers, addProduct, addCatalogItem, bulkUpdateStock, addSupplier]);

  const valid = checked.filter((c) => !c.error);
  const invalid = checked.filter((c) => c.error);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const t = toTable(String(reader.result));
      setFileName(file.name);
      const missing = KINDS[kind].required.filter((h) => !t.headers.includes(h));
      if (!t.headers.length || !t.rows.length) {
        setFatal("The file is empty or has no data rows.");
        setTable(null);
      } else if (missing.length) {
        setFatal(`Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Download the template to see the expected headers.`);
        setTable(null);
      } else {
        setFatal(null);
        setTable(t);
      }
    };
    reader.readAsText(file);
  }

  function reset() {
    setTable(null);
    setFatal(null);
    setFileName("");
  }

  function confirmImport() {
    if (!valid.length) return;
    valid.forEach((c) => c.apply?.());
    const stockSample = valid.filter((c) => c.stockBefore !== undefined).slice(0, 15);
    log({
      module: "Data",
      action: "import",
      entity: `${spec.label} import`,
      summary: `Imported ${valid.length} of ${checked.length} ${spec.label.toLowerCase()} rows from ${fileName}${invalid.length ? ` (${invalid.length} skipped)` : ""}`,
      ...(kind === "stock" ? { before: Object.fromEntries(stockSample.map((c) => [c.label.split(" → ")[0], c.stockBefore])), after: Object.fromEntries(stockSample.map((c) => [c.label.split(" → ")[0], c.stockAfter])) } : {}),
    });
    showToast(`Imported ${valid.length} ${spec.label.toLowerCase()} row${valid.length === 1 ? "" : "s"}`);
    reset();
  }

  function errorReport() {
    downloadCsv(`import-errors-${kind}-${Date.now()}.csv`, toCsv(["line", "row", "error"], invalid.map((c) => [c.line, c.label, c.error ?? ""])));
  }

  return (
    <Section title="Import" description="Upload a CSV, review the validation preview, then confirm. Nothing is saved until you press Import.">
      {!canImport && <ReadOnlyBanner message="Importing needs the Settings → Edit permission." />}
      <fieldset disabled={!canImport} className="min-w-0 space-y-4 border-0 p-0">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-52">
            <Field label="What are you importing?">
              <SelectInput<ImportKind>
                value={kind}
                onChange={(v) => {
                  setKind(v);
                  reset();
                }}
                options={(Object.keys(KINDS) as ImportKind[]).map((k) => ({ value: k, label: KINDS[k].label }))}
              />
            </Field>
          </div>
          <GhostButton onClick={() => downloadCsv(`${kind}-template.csv`, toCsv(spec.template[0], spec.template.slice(1)))}>
            <Download size={15} />
            Download template
          </GhostButton>
          <PrimaryButton onClick={() => fileRef.current?.click()}>
            <Upload size={15} />
            Choose CSV file
          </PrimaryButton>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
        </div>
        <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          {spec.help} Required columns: <b style={{ color: "var(--text)" }}>{spec.required.join(", ")}</b>.
        </p>

        {fatal && (
          <div className="flex items-start gap-2 rounded-xl border px-4 py-3 text-[12.5px]" style={{ background: "var(--red-soft)", borderColor: "transparent", color: "var(--red)" }}>
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            {fatal}
          </div>
        )}

        {table && !fatal && (
          <div className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--border-soft)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: "var(--text)" }}>
                <span className="font-semibold">{fileName}</span>
                <Tag tone="green"><CheckCircle2 size={11} />{valid.length} ready</Tag>
                {invalid.length > 0 && <Tag tone="red"><AlertTriangle size={11} />{invalid.length} with errors</Tag>}
              </div>
              <div className="flex flex-wrap gap-2">
                {invalid.length > 0 && (
                  <GhostButton onClick={errorReport}>
                    <Download size={15} />
                    Error report
                  </GhostButton>
                )}
                <GhostButton onClick={reset}>Cancel</GhostButton>
                <PrimaryButton disabled={!valid.length} onClick={confirmImport}>
                  Import {valid.length} row{valid.length === 1 ? "" : "s"}
                </PrimaryButton>
              </div>
            </div>
            {invalid.length > 0 && <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>Rows with errors are skipped. Fix them in your file and import again, or import the valid rows now.</p>}
            <div className="max-h-72 overflow-auto rounded-lg border" style={{ borderColor: "var(--border-soft)" }}>
              <table className="w-full min-w-[480px] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr className="sticky top-0" style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                    <th className="px-3 py-2 font-medium">Line</th>
                    <th className="px-3 py-2 font-medium">Row</th>
                    {kind === "stock" && <th className="px-3 py-2 font-medium">Stock change</th>}
                    <th className="px-3 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {checked.slice(0, 200).map((c) => (
                    <tr key={c.line} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                      <td className="px-3 py-1.5" style={{ color: "var(--text-faint)" }}>{c.line}</td>
                      <td className="px-3 py-1.5" style={{ color: "var(--text)" }}>{c.label}</td>
                      {kind === "stock" && <td className="px-3 py-1.5" style={{ color: "var(--text-muted)" }}>{c.stockBefore !== undefined ? `${c.stockBefore} → ${c.stockAfter ?? "?"}` : "—"}</td>}
                      <td className="px-3 py-1.5" style={{ color: c.error ? "var(--red)" : "var(--green)" }}>{c.error ?? "OK"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {checked.length > 200 && <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>Showing the first 200 of {checked.length} rows — all rows are validated and imported.</p>}
          </div>
        )}
      </fieldset>
    </Section>
  );
}

/** One-time bridge: shop data that used to live only in this browser goes into the shared database. */
function MigrateSection() {
  const { isSuperAdmin } = useAccess();
  const showToast = useToast();
  const [summary, setSummary] = useState<{ total: number; parts: Record<string, number> } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSummary(legacySummary());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!isSuperAdmin || !summary || summary.total === 0) return null;

  async function run() {
    setBusy(true);
    try {
      await api("POST", "/api/migrate", { keys: collectLegacyKeys(), replace: true });
      clearLegacyKeys();
      showToast("Browser data moved to the database");
      window.location.reload();
    } catch (err) {
      showToast(err instanceof HttpError ? err.message : "Migration failed", "error");
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <Section title="Move this browser's old data into the database" description="This browser still holds data saved before RetailPro moved to a database. Move it once so everyone sees it.">
      <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
        Found: {Object.entries(summary.parts).map(([k, v]) => `${v} ${k.replace("-", " ")}`).join(" · ")}
      </p>
      <PrimaryButton onClick={() => setConfirm(true)} disabled={busy}>
        <Upload size={15} />
        Move data to the database
      </PrimaryButton>
      <ConfirmDialog
        open={confirm}
        title="Replace database data with this browser's data?"
        message="Any products, orders and other shop data currently in the database are replaced by what's stored in this browser. The browser's old copy is cleared afterwards. Users and roles are not affected."
        confirmLabel="Replace & move"
        onCancel={() => setConfirm(false)}
        onConfirm={run}
      />
    </Section>
  );
}

export default function Page() {
  return (
    <SettingsGate>
      <PageHeader title="Data (Import / Export)" description="Bulk-load products, opening stock and suppliers from CSV, and export your data." back={{ href: "/settings", label: "Settings" }} />
      <div className="mt-5 space-y-5">
        <MigrateSection />
        <ImportSection />
        <ExportSection />
      </div>
    </SettingsGate>
  );
}
