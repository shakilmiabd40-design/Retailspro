"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSuppliers } from "@/lib/suppliers/store";
import { useToast } from "@/components/toast";
import type { Supplier, SupplierStatus } from "@/lib/suppliers/types";

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
        {required && <span style={{ color: "var(--red)" }}> *</span>}
      </span>
      {children}
    </label>
  );
}

export function SupplierForm({ initial }: { initial?: Supplier }) {
  const isEdit = !!initial;
  const router = useRouter();
  const { addSupplier, updateSupplier } = useSuppliers();
  const showToast = useToast();

  const [name, setName] = useState(initial?.name ?? "");
  const [contactPerson, setContactPerson] = useState(initial?.contactPerson ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [status, setStatus] = useState<SupplierStatus>(initial?.status ?? "active");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [paymentTerms, setPaymentTerms] = useState(initial?.paymentTerms ?? "Cash");
  const [currency, setCurrency] = useState(initial?.currency ?? "BDT");
  const [openingBalance, setOpeningBalance] = useState(initial?.openingBalance ?? 0);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      showToast("Supplier name and phone are required", "error");
      return;
    }
    if (isEdit && initial) {
      updateSupplier(initial.id, (s) => ({
        ...s,
        name,
        contactPerson,
        phone,
        email,
        status,
        address,
        city,
        notes,
        paymentTerms,
        currency,
        openingBalance,
      }));
      showToast("Supplier updated");
      router.push(`/suppliers/${initial.id}`);
    } else {
      const supplier: Supplier = {
        id: crypto.randomUUID(),
        name,
        contactPerson,
        phone,
        email,
        status,
        archived: false,
        address,
        city,
        notes,
        paymentTerms,
        currency,
        openingBalance,
        createdAt: new Date().toISOString(),
      };
      addSupplier(supplier);
      showToast("Supplier created");
      router.push(`/suppliers/${supplier.id}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            {isEdit ? "Edit Supplier" : "Add Supplier"}
          </h1>
        </div>
        <button type="submit" className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
          {isEdit ? "Save Changes" : "Save Supplier"}
        </button>
      </div>

      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Basic Info
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Supplier Name" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Contact Person">
            <input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Phone" required>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Status">
            <select value={status} onChange={(e) => setStatus(e.target.value as SupplierStatus)} className={inputClass} style={inputStyle}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Address
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="City/District">
            <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
        </div>
        <Field label="Full Address">
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={inputClass} style={inputStyle} />
        </Field>
        <Field label="Notes">
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} style={inputStyle} />
        </Field>
      </section>

      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Payment / Terms
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Payment Terms">
            <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="e.g. 15 days" className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Default Currency">
            <input value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass} style={inputStyle} />
          </Field>
          <Field label="Opening Balance">
            <input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(Number(e.target.value))} className={inputClass} style={inputStyle} />
          </Field>
        </div>
      </section>
    </form>
  );
}
