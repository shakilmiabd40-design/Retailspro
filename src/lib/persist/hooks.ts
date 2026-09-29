"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { CollectionName, DocumentKey } from "@/server/collections-names";
import { syncManager, type CollectionAdapter, type DocumentAdapter, type Row } from "./sync";

/**
 * Drop-in replacement for `useState(seed)` + "load from localStorage" + "save to localStorage" in a store:
 * the same setter, but the list lives in the database.
 */
export function useCollection<T extends { id: string }>(name: CollectionName, normalize?: (item: T) => T): [T[], Dispatch<SetStateAction<T[]>>, boolean] {
  const [items, setItems] = useState<T[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const itemsRef = useRef<T[]>(items);
  const norm = useRef(normalize);
  const state = useRef({ synced: new Map<string, { json: string; version: number }>(), loaded: false });
  const cache = useRef(new WeakMap<object, string>());

  useEffect(() => {
    itemsRef.current = items;
    if (state.current.loaded) syncManager.touch();
  }, [items]);

  useEffect(() => {
    const s = state.current;
    const jsonOf = (item: T) => {
      let j = cache.current.get(item);
      if (j === undefined) {
        j = JSON.stringify(item);
        cache.current.set(item, j);
      }
      return j;
    };

    const adapter: CollectionAdapter = {
      kind: "collection",
      name,
      rev: 0,
      forbidden: false,
      loaded: () => s.loaded,
      applyRows(rows: Row[], rev: number) {
        s.synced = new Map();
        const list = rows.map((r) => {
          const item = norm.current ? norm.current(r.data as unknown as T) : (r.data as unknown as T);
          // Compare against the normalised shape so a read-only user never tries to "save" a migration.
          s.synced.set(r.id, { json: JSON.stringify(item), version: r.version });
          return item;
        });
        s.loaded = true;
        adapter.rev = rev;
        itemsRef.current = list;
        setItems(list);
        setHydrated(true);
      },
      applyForbidden() {
        s.loaded = true;
        itemsRef.current = [];
        setItems([]);
        setHydrated(true);
      },
      collect() {
        if (!s.loaded) return null;
        const upserts: { id: string; data: unknown; baseVersion: number; json: string }[] = [];
        const seen = new Set<string>();
        for (const item of itemsRef.current) {
          const json = jsonOf(item);
          seen.add(item.id);
          const prev = s.synced.get(item.id);
          if (!prev) upserts.push({ id: item.id, data: item, baseVersion: 0, json });
          else if (prev.json !== json) upserts.push({ id: item.id, data: item, baseVersion: prev.version, json });
        }
        const deletes = [...s.synced.keys()].filter((id) => !seen.has(id));
        if (!upserts.length && !deletes.length) return null;
        return {
          upserts: upserts.map(({ json: _json, ...u }) => {
            void _json;
            return u;
          }),
          deletes,
          commit(versions: Record<string, number>) {
            for (const u of upserts) s.synced.set(u.id, { json: u.json, version: versions[u.id] ?? u.baseVersion + 1 });
            for (const id of deletes) s.synced.delete(id);
          },
        };
      },
    };

    syncManager.register(adapter);
    return () => {
      syncManager.unregister(name);
      s.loaded = false;
    };
  }, [name]);

  return [items, setItems, hydrated];
}

/** Same idea for a single JSON document (settings, catalog, settlement ledger…). */
export function useDocument<T extends object>(
  key: DocumentKey,
  initial: T,
  opts: { normalize?: (raw: unknown) => T; force?: boolean } = {}
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);
  const valueRef = useRef<T>(value);
  const initialRef = useRef(initial);
  const optsRef = useRef(opts);
  const state = useRef({ syncedJson: "", version: 0, loaded: false });

  useEffect(() => {
    valueRef.current = value;
    if (state.current.loaded) syncManager.touch();
  }, [value]);

  useEffect(() => {
    const s = state.current;
    const adapter: DocumentAdapter = {
      kind: "document",
      name: key,
      force: !!optsRef.current.force,
      rev: 0,
      forbidden: false,
      loaded: () => s.loaded,
      applyDoc(data, version, rev) {
        const next = data === null ? initialRef.current : optsRef.current.normalize ? optsRef.current.normalize(data) : (data as T);
        s.syncedJson = JSON.stringify(next);
        s.version = version;
        s.loaded = true;
        adapter.rev = rev;
        valueRef.current = next;
        setValue(next);
        setHydrated(true);
      },
      applyForbidden() {
        s.loaded = true;
        setHydrated(true);
      },
      collect() {
        if (!s.loaded) return null;
        const json = JSON.stringify(valueRef.current);
        if (json === s.syncedJson) return null;
        const base = s.version;
        const data = valueRef.current;
        return {
          data,
          baseVersion: base,
          commit(version: number) {
            s.syncedJson = json;
            s.version = version;
          },
        };
      },
    };
    syncManager.register(adapter);
    return () => {
      syncManager.unregister(key);
      s.loaded = false;
    };
  }, [key]);

  return [value, setValue, hydrated];
}

export function useSyncStatus() {
  return useSyncExternalStore(syncManager.subscribe, syncManager.getStatus, syncManager.getStatus);
}
