import "server-only";
import type { PoolClient } from "pg";
import { query } from "./db";
import { ApiError } from "./http";
import { COLLECTION_NAMES, COUNTER_START, DOCUMENT_KEYS, type CollectionName, type DocumentKey } from "./collections";
import { bumpRev, insertRecords } from "./seed";

export interface BackupFile {
  app: "inventorypro";
  version: 2;
  exportedAt: string;
  collections: Partial<Record<CollectionName, { id: string }[]>>;
  documents: Partial<Record<DocumentKey, Record<string, unknown>>>;
  counters: Record<string, number>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
/** Old backups (downloaded before the app was renamed) still say "retailpro" — still accepted here. */
const isValidAppMarker = (v: unknown): boolean => v === "inventorypro" || v === "retailpro";

/** Business data + settings. Users, roles, sessions and passwords are deliberately not included. */
export async function buildBackup(): Promise<BackupFile> {
  const collections: BackupFile["collections"] = {};
  for (const name of COLLECTION_NAMES) {
    const { rows } = await query<{ data: { id: string } }>("select data from app_records where collection = $1 order by seq desc", [name]);
    collections[name] = rows.map((r) => r.data);
  }
  const documents: BackupFile["documents"] = {};
  const docs = await query<{ key: DocumentKey; data: Record<string, unknown> }>("select key, data from app_documents");
  for (const d of docs.rows) if ((DOCUMENT_KEYS as readonly string[]).includes(d.key)) documents[d.key] = d.data;
  const counters: Record<string, number> = {};
  const c = await query<{ name: string; value: string }>("select name, value::text from app_counters");
  for (const r of c.rows) counters[r.name] = Number(r.value);
  return { app: "inventorypro", version: 2, exportedAt: new Date().toISOString(), collections, documents, counters };
}

export function parseBackup(input: unknown): BackupFile {
  if (!isObj(input) || !isValidAppMarker(input.app) || input.version !== 2 || !isObj(input.collections) || !isObj(input.documents)) {
    throw new ApiError(400, "bad_backup", "That doesn't look like a valid backup file.");
  }
  const collections: BackupFile["collections"] = {};
  for (const name of COLLECTION_NAMES) {
    const list = (input.collections as Record<string, unknown>)[name];
    if (list === undefined) continue;
    if (!Array.isArray(list) || list.some((x) => !isObj(x) || typeof x.id !== "string" || !x.id)) throw new ApiError(400, "bad_backup", `The "${name}" list in the backup is malformed.`);
    collections[name] = list as { id: string }[];
  }
  const documents: BackupFile["documents"] = {};
  for (const key of DOCUMENT_KEYS) {
    const doc = (input.documents as Record<string, unknown>)[key];
    if (doc === undefined) continue;
    if (!isObj(doc)) throw new ApiError(400, "bad_backup", `The "${key}" document in the backup is malformed.`);
    documents[key] = doc;
  }
  const counters: Record<string, number> = {};
  if (isObj(input.counters)) for (const [k, v] of Object.entries(input.counters)) if (k in COUNTER_START && Number.isFinite(Number(v))) counters[k] = Number(v);
  return { app: "inventorypro", version: 2, exportedAt: String(input.exportedAt ?? ""), collections, documents, counters };
}

/** Replaces all business data with the backup's contents. */
export async function restoreBackup(client: PoolClient, backup: BackupFile, actor: string | null) {
  await client.query("delete from app_records where collection = any($1::text[])", [[...COLLECTION_NAMES]]);
  await client.query("delete from app_documents where key = any($1::text[])", [[...DOCUMENT_KEYS]]);
  for (const name of COLLECTION_NAMES) {
    await insertRecords(client, name, backup.collections[name] ?? [], actor);
  }
  for (const key of DOCUMENT_KEYS) {
    const doc = backup.documents[key];
    if (doc) await client.query("insert into app_documents (key, data, updated_by) values ($1,$2::jsonb,$3)", [key, JSON.stringify(doc), actor]);
    await bumpRev(client, key);
  }
  for (const [name, start] of Object.entries(COUNTER_START)) {
    await client.query("insert into app_counters (name, value) values ($1,$2) on conflict (name) do update set value = excluded.value", [name, backup.counters[name] ?? start]);
  }
}

/** Turns the old browser-storage keys (retailpro:*) into a backup so existing data can move to the database. */
export function legacyToBackup(keys: Record<string, string>): BackupFile {
  const read = (k: string): unknown => {
    if (!(k in keys)) return undefined;
    try {
      return JSON.parse(keys[k]);
    } catch {
      return undefined;
    }
  };
  const list = (k: string) => {
    const v = read(k);
    return Array.isArray(v) ? (v as { id: string }[]).filter((x) => isObj(x) && typeof x.id === "string") : undefined;
  };
  const doc = (k: string) => {
    const v = read(k);
    return isObj(v) ? v : undefined;
  };
  const num = (k: string) => {
    const n = Number(keys[k]);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const collections: BackupFile["collections"] = {
    products: list("retailpro:products:v1"),
    orders: list("retailpro:orders:v1"),
    suppliers: list("retailpro:suppliers:v1"),
    purchase_orders: list("retailpro:purchase-orders:v1"),
    returns: list("retailpro:returns:v1"),
    warranties: list("retailpro:warranty:v1"),
  };
  for (const k of Object.keys(collections) as CollectionName[]) if (!collections[k]) delete collections[k];

  const documents: BackupFile["documents"] = {
    settings: doc("retailpro:settings:v1"),
    catalog: doc("retailpro:catalog:v1"),
    settlements: doc("retailpro:settlements:v1"),
    notifications_data: doc("retailpro:notifications:v1"),
    notifications_settings: doc("retailpro:notification-settings:v1"),
  };
  for (const k of Object.keys(documents) as DocumentKey[]) if (!documents[k]) delete documents[k];

  const counters: Record<string, number> = {};
  const map: [string, string][] = [
    ["order", "retailpro:orders:counter:v1"],
    ["po", "retailpro:purchase-orders:counter:v1"],
    ["return", "retailpro:returns:counter:v1"],
    ["warranty", "retailpro:warranty:counter:v1"],
    ["claim", "retailpro:warranty:claim-counter:v1"],
  ];
  for (const [name, key] of map) {
    const n = num(key);
    if (n) counters[name] = n;
  }
  return { app: "inventorypro", version: 2, exportedAt: new Date().toISOString(), collections, documents, counters };
}
