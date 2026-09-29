"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TextInput } from "@/components/settings/ui";

/** A master-data list: add, rename (optional), delete with usage counts. Changes apply immediately. */
export function CatalogList({
  title,
  description,
  items,
  onAdd,
  onRename,
  onRemove,
  usageCount,
  usageLabel = "product",
  placeholder,
}: {
  title: string;
  description: string;
  items: string[];
  onAdd: (value: string) => void;
  onRename?: (from: string, to: string) => void;
  onRemove: (value: string) => void;
  usageCount: (value: string) => number;
  usageLabel?: string;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
  }

  function commitRename(from: string) {
    const to = editValue.trim();
    if (to && to !== from) onRename?.(from, to);
    setEditing(null);
  }

  return (
    <div className="card p-5">
      <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
        {title}
      </p>
      <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
        {description}
      </p>

      <form onSubmit={add} className="mt-4 flex gap-2">
        <TextInput value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} />
        <button type="submit" className="focus-ring flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-40" style={{ background: "var(--brand)" }}>
          <Plus size={15} />
          Add
        </button>
      </form>

      <div className="mt-3 divide-y" style={{ borderColor: "var(--border-soft)" }}>
        {items.length === 0 && (
          <p className="py-6 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Nothing here yet — add your first one above.
          </p>
        )}
        {items.map((item) => {
          const count = usageCount(item);
          const isEditing = editing === item;
          return (
            <div key={item} className="flex items-center justify-between gap-3 py-2.5" style={{ borderColor: "var(--border-soft)" }}>
              {isEditing ? (
                <form
                  className="flex flex-1 items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    commitRename(item);
                  }}
                >
                  <TextInput autoFocus value={editValue} onChange={(e) => setEditValue(e.target.value)} />
                  <button type="submit" aria-label="Save name" className="focus-ring rounded-md p-1.5" style={{ color: "var(--green)" }}>
                    <Check size={16} />
                  </button>
                  <button type="button" aria-label="Cancel" onClick={() => setEditing(null)} className="focus-ring rounded-md p-1.5" style={{ color: "var(--text-faint)" }}>
                    <X size={16} />
                  </button>
                </form>
              ) : (
                <>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium" style={{ color: "var(--text)" }}>
                      {item}
                    </p>
                    <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                      {count} {usageLabel}
                      {count === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    {onRename && (
                      <button
                        type="button"
                        aria-label={`Rename ${item}`}
                        onClick={() => {
                          setEditing(item);
                          setEditValue(item);
                        }}
                        className="focus-ring rounded-md p-1.5"
                        style={{ color: "var(--text-faint)" }}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    <button type="button" aria-label={`Delete ${item}`} onClick={() => setPendingRemove(item)} className="focus-ring rounded-md p-1.5" style={{ color: "var(--text-faint)" }}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!pendingRemove}
        title="Delete item"
        message={
          pendingRemove && usageCount(pendingRemove) > 0
            ? `"${pendingRemove}" is used by ${usageCount(pendingRemove)} ${usageLabel}(s). It stays on those records but won't be suggested for new ones.`
            : `Delete "${pendingRemove}"?`
        }
        confirmLabel="Delete"
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          if (pendingRemove) onRemove(pendingRemove);
          setPendingRemove(null);
        }}
      />
    </div>
  );
}
