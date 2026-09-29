"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Lock, Plus, RotateCcw, ShieldAlert, Trash2, X } from "lucide-react";
import clsx from "clsx";
import { useSettings } from "@/lib/settings/store";
import { useAccess } from "@/lib/settings/access";
import type { SettingsData, SettingsSection } from "@/lib/settings/types";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";

export const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
export const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px] disabled:cursor-not-allowed disabled:opacity-60";

// ---- Page chrome ----------------------------------------------------------

export function PageHeader({ title, description, actions, back }: { title: string; description?: string; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="space-y-3">
      {back && (
        <Link href={back.href} className="focus-ring flex w-fit items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
          <ArrowLeft size={14} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 max-w-3xl text-[13px]" style={{ color: "var(--text-muted)" }}>
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Section({ title, description, actions, children, className }: { title: string; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("card space-y-4 p-5", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </p>
          {description && (
            <p className="mt-0.5 max-w-3xl text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              {description}
            </p>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, required, children, className }: { label: string; hint?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={clsx("block", className)}>
      <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
        {required && <span style={{ color: "var(--red)" }}> *</span>}
      </span>
      {children}
      {hint && (
        <span className="mt-1 block text-[11.5px]" style={{ color: "var(--text-faint)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={clsx(inputClass, props.className)} style={{ ...inputStyle, ...props.style }} />;
}

export function NumberInput({ value, onChange, min = 0, max, step, ...rest }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max" | "step">) {
  return (
    <input
      {...rest}
      type="number"
      min={min}
      max={max}
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))}
      className={clsx(inputClass, rest.className)}
      style={inputStyle}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={clsx(inputClass, props.className)} style={{ ...inputStyle, ...props.style }} />;
}

export function SelectInput<T extends string>({ value, onChange, options, ...rest }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select {...rest} value={value} onChange={(e) => onChange(e.target.value as T)} className={clsx(inputClass, rest.className)} style={inputStyle}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ---- Tags -----------------------------------------------------------------

export function Tag({ tone = "muted", children, title }: { tone?: "muted" | "brand" | "green" | "red" | "blue"; children: ReactNode; title?: string }) {
  const map = {
    muted: { bg: "var(--surface-2)", fg: "var(--text-muted)" },
    brand: { bg: "var(--brand-soft)", fg: "var(--brand-strong)" },
    green: { bg: "var(--green-soft)", fg: "var(--green)" },
    red: { bg: "var(--red-soft)", fg: "var(--red)" },
    blue: { bg: "var(--blue-soft)", fg: "var(--blue)" },
  }[tone];
  return (
    <span title={title} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: map.bg, color: map.fg }}>
      {children}
    </span>
  );
}

/** Marks a setting that is saved but not yet acted on by another module. */
export function SoonTag() {
  return (
    <Tag tone="muted" title="Saved with your settings — the related screens don't act on it yet.">
      Not enforced yet
    </Tag>
  );
}

export function LockedTag({ children = "Fixed policy" }: { children?: ReactNode }) {
  return (
    <Tag tone="muted">
      <Lock size={10} />
      {children}
    </Tag>
  );
}

// ---- Toggles --------------------------------------------------------------

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="focus-ring relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{ background: checked ? "var(--brand)" : "var(--border)" }}
    >
      <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: checked ? 22 : 2 }} />
    </button>
  );
}

export function ToggleRow({ label, description, checked, onChange, disabled, locked, soon }: { label: string; description?: ReactNode; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean; locked?: boolean; soon?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium" style={{ color: "var(--text)" }}>
          {label}
          {locked && <LockedTag />}
          {soon && <SoonTag />}
        </p>
        {description && (
          <p className="mt-0.5 max-w-2xl text-[12px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
      <Toggle checked={checked} onChange={onChange ?? (() => {})} disabled={disabled || locked} label={label} />
    </div>
  );
}

export function Divided({ children }: { children: ReactNode }) {
  return <div className="divide-y" style={{ borderColor: "var(--border-soft)" }}>{children}</div>;
}

// ---- Editable list of strings ---------------------------------------------

export function ListEditor({ items, onChange, placeholder, emptyText = "Nothing here yet." }: { items: string[]; onChange: (items: string[]) => void; placeholder: string; emptyText?: string }) {
  const [draft, setDraft] = useState("");

  function add(e: React.FormEvent) {
    e.preventDefault();
    const v = draft.trim();
    if (!v) return;
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...items, v]);
    setDraft("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {items.length === 0 && (
          <p className="text-[12.5px]" style={{ color: "var(--text-faint)" }}>
            {emptyText}
          </p>
        )}
        {items.map((item, idx) => (
          <span key={`${item}-${idx}`} className="inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1.5 text-[12.5px]" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text)" }}>
            {item}
            <button type="button" onClick={() => onChange(items.filter((_, i) => i !== idx))} aria-label={`Remove ${item}`} className="focus-ring rounded-full p-0.5" style={{ color: "var(--text-faint)" }}>
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={add} className="flex gap-2">
        <TextInput value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
        <button type="submit" className="focus-ring flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
          <Plus size={15} />
          Add
        </button>
      </form>
    </div>
  );
}

// ---- Buttons --------------------------------------------------------------

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props} className={clsx("focus-ring flex items-center gap-1.5 rounded-xl px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40", props.className)} style={{ background: "var(--brand)", ...props.style }}>
      {children}
    </button>
  );
}

export function GhostButton({ children, danger, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { danger?: boolean }) {
  return (
    <button {...props} className={clsx("focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium disabled:opacity-40", props.className)} style={{ borderColor: "var(--border)", color: danger ? "var(--red)" : "var(--text)", background: "var(--surface)", ...props.style }}>
      {children}
    </button>
  );
}

// ---- Modal ----------------------------------------------------------------

export function Modal({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center" style={{ background: "rgba(0,0,0,0.5)" }} role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={clsx("card my-4 w-full", wide ? "max-w-2xl" : "max-w-lg")}>
        <div className="flex items-center justify-between border-b px-5 py-3.5" style={{ borderColor: "var(--border-soft)" }}>
          <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </p>
          <button onClick={onClose} aria-label="Close" className="focus-ring rounded-md p-1" style={{ color: "var(--text-faint)" }}>
            <X size={17} />
          </button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t px-5 py-3.5" style={{ borderColor: "var(--border-soft)" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Access banners -------------------------------------------------------

export function ReadOnlyBanner({ message }: { message?: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[12.5px]" style={{ background: "var(--brand-tint-bg)", borderColor: "var(--brand-tint-border)", color: "var(--text-muted)" }}>
      <ShieldAlert size={15} style={{ color: "var(--brand)" }} />
      {message ?? <>You have view-only access to Settings. Ask a Super Admin for the &ldquo;Settings → Edit&rdquo; permission to make changes.</>}
    </div>
  );
}

export function Loading() {
  return (
    <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
      Loading…
    </p>
  );
}

/** Renders children once settings and users/roles have loaded from storage. */
export function SettingsGate({ children }: { children: ReactNode }) {
  const { hydrated } = useSettings();
  const { hydrated: accessReady } = useAccess();
  if (!hydrated || !accessReady) return <Loading />;
  return <>{children}</>;
}

// ---- Draft/save hook ------------------------------------------------------

export function useSectionForm<K extends SettingsSection>(section: K, opts: { superAdminOnly?: boolean } = {}) {
  const { settings, saveSection } = useSettings();
  const { can, isSuperAdmin } = useAccess();
  const showToast = useToast();
  const saved = settings[section];
  const [draft, setDraft] = useState<SettingsData[K]>(saved);
  const [confirmReset, setConfirmReset] = useState(false);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const canEdit = can("settings", "edit") && (!opts.superAdminOnly || isSuperAdmin);

  const set = <F extends keyof SettingsData[K]>(key: F, value: SettingsData[K][F]) => setDraft((d) => ({ ...d, [key]: value }));

  return {
    draft,
    setDraft,
    set,
    saved,
    dirty,
    canEdit,
    readOnly: !canEdit,
    save: (validate?: () => string | null) => {
      const error = validate?.();
      if (error) {
        showToast(error, "error");
        return false;
      }
      saveSection(section, draft);
      showToast("Settings saved");
      return true;
    },
    discard: () => setDraft(saved),
    confirmReset,
    setConfirmReset,
    restoreDefaults: () => {
      setDraft(DEFAULT_SETTINGS[section]);
      setConfirmReset(false);
      showToast("Defaults loaded — save to apply");
    },
  };
}

interface FormLike {
  dirty: boolean;
  readOnly: boolean;
  save: (validate?: () => string | null) => boolean;
  discard: () => void;
  confirmReset: boolean;
  setConfirmReset: (v: boolean) => void;
  restoreDefaults: () => void;
}

/** Sticky save bar + reset-to-defaults confirmation; also disables every control when the user is view-only. */
export function FormShell({ form, children, onSave, resetLabel = "Restore defaults", allowReset = true, readOnlyMessage }: { form: FormLike; children: ReactNode; onSave?: () => string | null; resetLabel?: string; allowReset?: boolean; readOnlyMessage?: string }) {
  return (
    <div className="space-y-5 pb-24">
      {form.readOnly && <ReadOnlyBanner message={readOnlyMessage} />}
      <fieldset disabled={form.readOnly} className="min-w-0 space-y-5 border-0 p-0">
        {children}
      </fieldset>

      {!form.readOnly && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-lg" style={{ background: "var(--surface)", borderColor: form.dirty ? "var(--brand-tint-border)" : "var(--border)" }}>
          <p className="text-[12.5px]" style={{ color: form.dirty ? "var(--brand-strong)" : "var(--text-faint)" }}>
            {form.dirty ? "You have unsaved changes." : "All changes saved."}
          </p>
          <div className="flex items-center gap-2">
            {allowReset && (
              <GhostButton type="button" onClick={() => form.setConfirmReset(true)}>
                <RotateCcw size={14} />
                {resetLabel}
              </GhostButton>
            )}
            <GhostButton type="button" onClick={form.discard} disabled={!form.dirty}>
              Discard
            </GhostButton>
            <PrimaryButton type="button" disabled={!form.dirty} onClick={() => form.save(onSave)}>
              Save changes
            </PrimaryButton>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={form.confirmReset}
        title="Restore defaults?"
        message="This loads the default values into the form. Nothing changes until you press Save."
        confirmLabel="Load defaults"
        danger={false}
        onCancel={() => form.setConfirmReset(false)}
        onConfirm={form.restoreDefaults}
      />
    </div>
  );
}

export function EmptyRow({ children, cols }: { children: ReactNode; cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className="px-5 py-10 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
        {children}
      </td>
    </tr>
  );
}

export function RowDelete({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="focus-ring rounded-md p-1.5" style={{ color: "var(--text-faint)" }}>
      <Trash2 size={15} />
    </button>
  );
}
