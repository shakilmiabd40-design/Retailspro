"use client";

import type { ActionKey, ModuleKey, PermissionMap } from "@/lib/settings/types";
import { ACTION_COLUMNS, MODULES } from "@/lib/settings/permissions";

function Check({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 cursor-pointer accent-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}

export function PermissionMatrix({ value, onChange, readOnly }: { value: PermissionMap; onChange: (next: PermissionMap) => void; readOnly?: boolean }) {
  const has = (m: ModuleKey, a: ActionKey) => !!value[m]?.includes(a);

  function toggle(m: ModuleKey, a: ActionKey, on: boolean) {
    const current = new Set(value[m] ?? []);
    if (on) {
      current.add(a);
      // Anything you can do to a module, you must be able to see.
      if (a !== "view" && MODULES.find((x) => x.key === m)?.actions.includes("view")) current.add("view");
    } else {
      current.delete(a);
      if (a === "view") current.clear();
    }
    const next = { ...value, [m]: [...current] };
    if (!next[m]!.length) delete next[m];
    onChange(next);
  }

  function toggleRow(m: ModuleKey, on: boolean) {
    const mod = MODULES.find((x) => x.key === m)!;
    const next = { ...value };
    if (on) next[m] = [...mod.actions];
    else delete next[m];
    onChange(next);
  }

  function toggleColumn(a: ActionKey, on: boolean) {
    let next: PermissionMap = { ...value };
    for (const mod of MODULES) {
      if (!mod.actions.includes(a)) continue;
      const set = new Set(next[mod.key] ?? []);
      if (on) {
        set.add(a);
        if (mod.actions.includes("view")) set.add("view");
      } else {
        set.delete(a);
        if (a === "view") set.clear();
      }
      next = { ...next, [mod.key]: [...set] };
      if (!next[mod.key]!.length) delete next[mod.key];
    }
    onChange(next);
  }

  return (
    <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full min-w-[860px] border-collapse text-[12.5px]">
        <thead>
          <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
            <th className="sticky left-0 z-[1] px-4 py-2.5 text-left font-medium" style={{ background: "var(--surface-2)" }}>
              Module
            </th>
            {ACTION_COLUMNS.map((a) => {
              const applicable = MODULES.filter((m) => m.actions.includes(a.key));
              const all = applicable.every((m) => has(m.key, a.key));
              return (
                <th key={a.key} className="px-2 py-2.5 text-center font-medium" title={a.hint}>
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="whitespace-nowrap">{a.label}</span>
                    <Check checked={all} disabled={readOnly} onChange={(v) => toggleColumn(a.key, v)} label={`Toggle ${a.label} for every module`} />
                  </div>
                </th>
              );
            })}
            <th className="px-3 py-2.5 text-center font-medium">All</th>
          </tr>
        </thead>
        <tbody>
          {MODULES.map((m) => {
            const all = m.actions.every((a) => has(m.key, a));
            return (
              <tr key={m.key} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                <td className="sticky left-0 z-[1] px-4 py-2.5 font-medium" style={{ background: "var(--surface)", color: "var(--text)" }}>
                  <span className="whitespace-nowrap">{m.label}</span>
                  {m.note && (
                    <span className="mt-0.5 block max-w-[230px] text-[11px] font-normal leading-snug" style={{ color: "var(--text-faint)" }}>
                      {m.note}
                    </span>
                  )}
                </td>
                {ACTION_COLUMNS.map((a) => (
                  <td key={a.key} className="px-2 py-2.5 text-center">
                    {m.actions.includes(a.key) ? (
                      <Check checked={has(m.key, a.key)} disabled={readOnly} onChange={(v) => toggle(m.key, a.key, v)} label={`${m.label}: ${a.label}`} />
                    ) : (
                      <span style={{ color: "var(--border)" }}>–</span>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-center">
                  <Check checked={all} disabled={readOnly} onChange={(v) => toggleRow(m.key, v)} label={`Grant every ${m.label} permission`} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
