"use client";

import { useCallback, useSyncExternalStore } from "react";

/** A per-device preference (this browser only) — e.g. grid vs list. Kept out of the database on purpose. */
export function usePref<T extends string | boolean>(name: string, fallback: T): [T, (v: T) => void] {
  const k = `rp:pos:pref:${name}`;
  const subscribe = useCallback(
    (cb: () => void) => {
      const on = (e: Event) => (e instanceof StorageEvent ? e.key === k : (e as CustomEvent).detail === k) && cb();
      window.addEventListener("storage", on);
      window.addEventListener("rp-pref", on);
      return () => {
        window.removeEventListener("storage", on);
        window.removeEventListener("rp-pref", on);
      };
    },
    [k]
  );
  const raw = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    () => null
  );
  const value = raw === null ? fallback : ((typeof fallback === "boolean" ? raw === "true" : raw) as T);
  const set = useCallback(
    (v: T) => {
      try {
        localStorage.setItem(k, String(v));
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent("rp-pref", { detail: k }));
    },
    [k]
  );
  return [value, set];
}
