"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useDocument } from "@/lib/persist/hooks";
import type { SettingsData, SettingsSection } from "./types";
import { DEFAULT_SETTINGS } from "./defaults";
import { applyRuntime } from "./runtime";
import { useAudit } from "./audit";
import { FALLBACK_SHOP_NAME } from "@/lib/settings/shop";

export const SECTION_LABELS: Record<SettingsSection, string> = {
  company: "Company / Shop",
  products: "Product",
  inventory: "Inventory",
  orders: "Orders",
  courier: "Courier & Settlement",
  purchase: "Purchase",
  returns: "Returns",
  warranty: "Warranty",
  invoice: "Invoice / Numbering & Printing",
  pos: "POS",
  notifications: "Notifications",
  security: "Security",
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Saved values win; anything missing (a newer default) falls back. Arrays are replaced whole. */
function deepMerge<T>(base: T, saved: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(saved)) return (saved === undefined ? base : (saved as T)) as T;
  const out: Record<string, unknown> = { ...base };
  for (const key of Object.keys(saved)) {
    out[key] = key in base ? deepMerge((base as Record<string, unknown>)[key], saved[key]) : saved[key];
  }
  return out as T;
}

function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

function applyToRuntime(s: SettingsData) {
  applyRuntime({
    locale: s.company.numberGrouping === "lakh" ? "en-IN" : "en-US",
    decimals: s.company.decimals,
    dateFormat: s.company.dateFormat,
    timezone: s.company.timezone,
    lowStockThreshold: s.inventory.lowStockThreshold,
    cancelAllowed: s.orders.cancelAllowedStatuses,
    settlementMode: s.courier.settlementMode,
  });
}

interface SettingsContextValue {
  settings: SettingsData;
  hydrated: boolean;
  /** Replace one whole section. Records a before/after audit entry for the keys that changed. */
  saveSection: <K extends SettingsSection>(section: K, next: SettingsData[K]) => void;
  resetSection: (section: SettingsSection) => void;
  resetAll: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { log } = useAudit();
  const [settings, setSettings, hydrated] = useDocument<SettingsData>("settings", DEFAULT_SETTINGS, {
    normalize: (raw) => deepMerge(DEFAULT_SETTINGS, raw),
  });

  // Mirror into the runtime *during render* so components rendered in this pass already see the new values.
  applyToRuntime(settings);

  // Latest settings for callbacks that need a diff without re-creating themselves on every change.
  const latest = useRef(settings);
  useEffect(() => {
    latest.current = settings;
  }, [settings]);

  // Browser tab title follows the shop name from Settings → Company (falls back to "My Shop").
  useEffect(() => {
    if (!hydrated) return;
    document.title = `${settings.company.shopName.trim() || FALLBACK_SHOP_NAME} — Inventory Management`;
  }, [hydrated, settings.company.shopName]);

  // Browser tab icon follows the uploaded shop logo; falls back to the app's default icon.
  useEffect(() => {
    if (!hydrated) return;
    const href = settings.company.logo || "/favicon.ico";
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = href;
  }, [hydrated, settings.company.logo]);

  const saveSection = useCallback(
    <K extends SettingsSection>(section: K, next: SettingsData[K]) => {
      const before = latest.current[section] as unknown as Record<string, unknown>;
      const after = next as unknown as Record<string, unknown>;
      const keys = changedKeys(before, after);
      latest.current = { ...latest.current, [section]: next };
      setSettings((prev) => ({ ...prev, [section]: next }));
      if (keys.length) {
        const pick = (o: Record<string, unknown>) => Object.fromEntries(keys.map((k) => [k, o[k]]));
        log({
          module: section === "security" ? "Security" : "Settings",
          action: section === "security" ? "security" : "edit",
          entity: `${SECTION_LABELS[section]} settings`,
          summary: `Changed ${keys.join(", ")}`,
          before: pick(before),
          after: pick(after),
        });
      }
    },
    [log, setSettings]
  );

  const resetSection = useCallback(
    (section: SettingsSection) => {
      saveSection(section, DEFAULT_SETTINGS[section]);
    },
    [saveSection]
  );

  const resetAll = useCallback(() => {
    latest.current = DEFAULT_SETTINGS;
    setSettings(DEFAULT_SETTINGS);
    log({ module: "Settings", action: "edit", entity: "All settings", summary: "Reset every settings section to its defaults" });
  }, [log, setSettings]);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, hydrated, saveSection, resetSection, resetAll }),
    [settings, hydrated, saveSection, resetSection, resetAll]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
