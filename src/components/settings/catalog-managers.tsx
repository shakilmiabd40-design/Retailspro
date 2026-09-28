"use client";

import { useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { useSettings } from "@/lib/settings/store";
import { useAccess } from "@/lib/settings/access";
import { useAudit } from "@/lib/settings/audit";
import type { CategoryMeta } from "@/lib/settings/types";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyRow, Field, GhostButton, Modal, PrimaryButton, RowDelete, Section, SelectInput, Tag, TextInput } from "@/components/settings/ui";

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function CategoryManager() {
  const { catalog, products, addCatalogItem, removeCatalogItem, setProductsCategory } = useProducts();
  const { settings, saveSection } = useSettings();
  const { can } = useAccess();
  const { log } = useAudit();
  const showToast = useToast();
  const canEdit = can("settings", "edit");
  const meta = settings.products.categoryMeta;

  const [editing, setEditing] = useState<{ original: string | null; name: string; parent: string; status: CategoryMeta["status"] } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const usage = (c: string) => products.filter((p) => p.category === c).length;
  const childrenOf = (c: string) => catalog.categories.filter((x) => meta[x]?.parent === c);

  function descendants(c: string): string[] {
    const out: string[] = [];
    const walk = (n: string) => childrenOf(n).forEach((k) => (out.push(k), walk(k)));
    walk(c);
    return out;
  }

  function saveMeta(next: Record<string, CategoryMeta>) {
    saveSection("products", { ...settings.products, categoryMeta: next });
  }

  function submit() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return showToast("Category name is required", "error");
    const dupe = catalog.categories.some((c) => same(c, name) && c !== editing.original);
    if (dupe) return showToast("That category already exists", "error");

    const nextMeta = { ...meta };
    const entry: CategoryMeta = { status: editing.status, ...(editing.parent ? { parent: editing.parent } : {}) };

    if (editing.original && editing.original !== name) {
      // Rename: keep products, children and metadata pointing at the new name.
      addCatalogItem("categories", name);
      const ids = products.filter((p) => p.category === editing.original).map((p) => p.id);
      if (ids.length) setProductsCategory(ids, name);
      removeCatalogItem("categories", editing.original);
      delete nextMeta[editing.original];
      for (const k of Object.keys(nextMeta)) if (nextMeta[k].parent === editing.original) nextMeta[k] = { ...nextMeta[k], parent: name };
      log({ module: "Products", action: "edit", entity: `Category ${editing.original}`, summary: `Renamed category to ${name}`, before: { name: editing.original }, after: { name } });
    } else if (!editing.original) {
      addCatalogItem("categories", name);
      log({ module: "Products", action: "create", entity: `Category ${name}`, summary: `Added category ${name}` });
    } else {
      log({ module: "Products", action: "edit", entity: `Category ${name}`, summary: `Updated category ${name}`, before: { ...meta[name] }, after: { ...entry } });
    }
    nextMeta[name] = entry;
    saveMeta(nextMeta);
    setEditing(null);
    showToast(editing.original ? "Category updated" : "Category added");
  }

  function remove(name: string) {
    const nextMeta = { ...meta };
    delete nextMeta[name];
    for (const k of Object.keys(nextMeta)) if (nextMeta[k].parent === name) nextMeta[k] = { ...nextMeta[k], parent: undefined };
    removeCatalogItem("categories", name);
    saveMeta(nextMeta);
    log({ module: "Products", action: "delete", entity: `Category ${name}`, summary: `Removed category ${name}` });
    showToast("Category removed");
  }

  const blocked = editing?.original ? new Set([editing.original, ...descendants(editing.original)]) : new Set<string>();

  return (
    <Section
      title="Categories"
      description="Group products, optionally under a parent category. Inactive categories stay on existing products but aren't suggested for new ones."
      actions={canEdit && <PrimaryButton onClick={() => setEditing({ original: null, name: "", parent: "", status: "active" })}><Plus size={15} />Add category</PrimaryButton>}
    >
      <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="text-[11.5px]" style={{ color: "var(--text-faint)", background: "var(--surface-2)" }}>
              {["Category", "Parent", "Status", "Products", ""].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {catalog.categories.length === 0 && <EmptyRow cols={5}>No categories yet.</EmptyRow>}
            {catalog.categories.map((c) => (
              <tr key={c} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                <td className="px-4 py-2.5 font-medium" style={{ color: "var(--text)" }}>{c}</td>
                <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{meta[c]?.parent ?? "—"}</td>
                <td className="px-4 py-2.5"><Tag tone={meta[c]?.status === "inactive" ? "red" : "green"}>{meta[c]?.status === "inactive" ? "Inactive" : "Active"}</Tag></td>
                <td className="px-4 py-2.5" style={{ color: "var(--text-muted)" }}>{usage(c)}</td>
                <td className="px-4 py-2.5">
                  {canEdit && (
                    <div className="flex justify-end gap-0.5">
                      <button type="button" aria-label={`Edit ${c}`} title="Edit" onClick={() => setEditing({ original: c, name: c, parent: meta[c]?.parent ?? "", status: meta[c]?.status ?? "active" })} className="focus-ring rounded-md p-1.5" style={{ color: "var(--text-muted)" }}><Pencil size={15} /></button>
                      <RowDelete label={`Delete ${c}`} onClick={() => setPendingDelete(c)} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.original ? "Edit category" : "Add category"} footer={<><GhostButton onClick={() => setEditing(null)}>Cancel</GhostButton><PrimaryButton onClick={submit}>Save</PrimaryButton></>}>
        {editing && (
          <div className="space-y-4">
            <Field label="Name" required><TextInput autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
            <Field label="Parent category (optional)">
              <SelectInput value={editing.parent} onChange={(v) => setEditing({ ...editing, parent: v })} options={[{ value: "", label: "None — top level" }, ...catalog.categories.filter((c) => !blocked.has(c)).map((c) => ({ value: c, label: c }))]} />
            </Field>
            <Field label="Status"><SelectInput value={editing.status} onChange={(v) => setEditing({ ...editing, status: v })} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete category"
        message={pendingDelete && usage(pendingDelete) > 0 ? `"${pendingDelete}" is used by ${usage(pendingDelete)} product(s). They keep it, but it won't be suggested for new products.` : `Delete "${pendingDelete}"?`}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) remove(pendingDelete);
          setPendingDelete(null);
        }}
      />
    </Section>
  );
}

export function BrandManager() {
  const { catalog, products, addCatalogItem, removeCatalogItem, updateProduct } = useProducts();
  const { can } = useAccess();
  const { log } = useAudit();
  const showToast = useToast();
  const canEdit = can("settings", "edit");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ original: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const usage = (b: string) => products.filter((p) => p.brand === b).length;

  function add(e: React.FormEvent) {
    e.preventDefault();
    const name = draft.trim();
    if (!name) return;
    if (catalog.brands.some((b) => same(b, name))) return showToast("That brand already exists", "error");
    addCatalogItem("brands", name);
    log({ module: "Products", action: "create", entity: `Brand ${name}`, summary: `Added brand ${name}` });
    setDraft("");
    showToast("Brand added");
  }

  function rename() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return showToast("Brand name is required", "error");
    if (name !== editing.original) {
      if (catalog.brands.some((b) => same(b, name))) return showToast("That brand already exists", "error");
      addCatalogItem("brands", name);
      products.filter((p) => p.brand === editing.original).forEach((p) => updateProduct(p.id, (x) => ({ ...x, brand: name })));
      removeCatalogItem("brands", editing.original);
      log({ module: "Products", action: "edit", entity: `Brand ${editing.original}`, summary: `Renamed brand to ${name}`, before: { name: editing.original }, after: { name } });
      showToast("Brand renamed");
    }
    setEditing(null);
  }

  return (
    <Section title="Brands" description="Brands appear as suggestions on the product form and as a filter on the product list.">
      {canEdit && (
        <form onSubmit={add} className="flex gap-2">
          <TextInput value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Bata" />
          <button type="submit" className="focus-ring flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}><Plus size={15} />Add</button>
        </form>
      )}
      <div className="divide-y rounded-xl border" style={{ borderColor: "var(--border)" }}>
        {catalog.brands.length === 0 && <p className="py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>No brands yet.</p>}
        {catalog.brands.map((b) => (
          <div key={b} className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ borderColor: "var(--border-soft)" }}>
            {editing?.original === b ? (
              <div className="flex flex-1 items-center gap-2">
                <TextInput autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && rename()} />
                <button type="button" aria-label="Save" onClick={rename} className="focus-ring rounded-md p-1.5" style={{ color: "var(--green)" }}><Check size={16} /></button>
                <button type="button" aria-label="Cancel" onClick={() => setEditing(null)} className="focus-ring rounded-md p-1.5" style={{ color: "var(--text-faint)" }}><X size={16} /></button>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>{b}</p>
                  <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>{usage(b)} product{usage(b) === 1 ? "" : "s"}</p>
                </div>
                {canEdit && (
                  <div className="flex gap-0.5">
                    <button type="button" aria-label={`Edit ${b}`} title="Edit" onClick={() => setEditing({ original: b, name: b })} className="focus-ring rounded-md p-1.5" style={{ color: "var(--text-muted)" }}><Pencil size={15} /></button>
                    <RowDelete label={`Delete ${b}`} onClick={() => setPendingDelete(b)} />
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete brand"
        message={pendingDelete && usage(pendingDelete) > 0 ? `"${pendingDelete}" is used by ${usage(pendingDelete)} product(s). They keep it, but it won't be suggested for new products.` : `Delete "${pendingDelete}"?`}
        confirmLabel="Delete"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) {
            removeCatalogItem("brands", pendingDelete);
            log({ module: "Products", action: "delete", entity: `Brand ${pendingDelete}`, summary: `Removed brand ${pendingDelete}` });
            showToast("Brand removed");
          }
          setPendingDelete(null);
        }}
      />
    </Section>
  );
}
