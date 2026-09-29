"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function TagListManager({
  title,
  description,
  items,
  onAdd,
  onRemove,
  usageCount,
  placeholder,
}: {
  title: string;
  description: string;
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  usageCount: (value: string) => number;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    onAdd(draft.trim());
    setDraft("");
  }

  return (
    <div className="card p-5">
      <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
        {title}
      </p>
      <p className="mt-0.5 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
        {description}
      </p>

      <form onSubmit={handleAdd} className="mt-4 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="focus-ring flex-1 rounded-xl border px-3 py-2 text-[13px]"
          style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
        />
        <button
          type="submit"
          className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white"
          style={{ background: "var(--brand)" }}
        >
          <Plus size={15} />
          Add
        </button>
      </form>

      <div className="mt-4 divide-y" style={{ borderColor: "var(--border-soft)" }}>
        {items.length === 0 && (
          <p className="py-6 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Nothing here yet — add your first one above.
          </p>
        )}
        {items.map((item) => {
          const count = usageCount(item);
          return (
            <div key={item} className="flex items-center justify-between py-2.5" style={{ borderColor: "var(--border-soft)" }}>
              <div>
                <p className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                  {item}
                </p>
                <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                  {count} product{count === 1 ? "" : "s"}
                </p>
              </div>
              <button
                onClick={() => setPendingRemove(item)}
                className="focus-ring rounded-md p-1.5"
                style={{ color: "var(--text-faint)" }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!pendingRemove}
        title="Remove item"
        message={
          pendingRemove && usageCount(pendingRemove) > 0
            ? `"${pendingRemove}" is used by ${usageCount(pendingRemove)} product(s). It will stay on those products, but won't be suggested for new ones.`
            : `Remove "${pendingRemove}"?`
        }
        confirmLabel="Remove"
        onCancel={() => setPendingRemove(null)}
        onConfirm={() => {
          if (pendingRemove) onRemove(pendingRemove);
          setPendingRemove(null);
        }}
      />
    </div>
  );
}
