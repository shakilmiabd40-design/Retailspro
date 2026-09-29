import { tx } from "@/server/db";
import { ApiError, json, readJson, route } from "@/server/http";
import { requireAuth, roleHas } from "@/server/auth";
import { canWrite, COLLECTION_ACCESS, DOCUMENT_ACCESS, isCollection, isDocument } from "@/server/collections";
import { validateOrder, validateProduct } from "@/server/validate";
import { canSeeProductCost, preserveProductCost } from "@/server/redact";
import { bumpRev } from "@/server/seed";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";
import { after } from "next/server";
import { deliverDue, enqueueEvents, orderEvents, productEvents, type DomainEvent } from "@/server/publicapi/webhooks";
import type { Order } from "@/lib/orders/types";
import type { Product } from "@/lib/products/types";

export const dynamic = "force-dynamic";

interface Upsert {
  id: string;
  data: Record<string, unknown>;
  baseVersion: number;
}
interface Body {
  collections?: Record<string, { upserts?: Upsert[]; deletes?: string[] }>;
  documents?: Record<string, { data: unknown; baseVersion: number; force?: boolean }>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Applies a batch of changes from one browser in a single transaction. A record is only updated if the
 * browser saw its latest version; otherwise the whole batch is rejected (409) and the browser reloads.
 */
export const POST = route(async (req) => {
  const auth = await requireAuth(req);
  const body = await readJson<Body>(req);
  const collections = body.collections ?? {};
  const documents = body.documents ?? {};

  for (const name of Object.keys(collections)) {
    if (!isCollection(name)) throw new ApiError(400, "unknown_collection", `Unknown collection: ${name}`);
    if (!canWrite(auth.role, COLLECTION_ACCESS[name])) throw new ApiError(403, "forbidden", `Your role can't change ${name.replace("_", " ")}.`, { name });
  }
  for (const key of Object.keys(documents)) {
    if (!isDocument(key)) throw new ApiError(400, "unknown_document", `Unknown document: ${key}`);
    if (!canWrite(auth.role, DOCUMENT_ACCESS[key])) throw new ApiError(403, "forbidden", `Your role can't change ${key.replace("_", " ")}.`, { name: key });
    if (!isObj(documents[key].data)) throw new ApiError(400, "invalid", `${key} must be an object.`);
  }

  const conflicts: string[] = [];
  const versions: Record<string, Record<string, number>> = {};
  const docVersions: Record<string, number> = {};
  const revs: Record<string, number> = {};
  const actor = auth.user.id;
  const seeProductCost = canSeeProductCost(auth.role);
  let queuedEvents = 0;

  await tx(async (client) => {
    // Webhooks: only do the extra "what was it before?" reads when someone is actually listening.
    // (Fenced with a savepoint: if `npm run db:setup` hasn't been re-run yet the table is missing, and saving must still work.)
    let listening = false;
    await client.query("savepoint webhook_probe");
    try {
      listening = (await client.query("select 1 from app_webhooks where active limit 1")).rows.length > 0;
      await client.query("release savepoint webhook_probe");
    } catch {
      await client.query("rollback to savepoint webhook_probe");
    }
    const events: DomainEvent[] = [];

    for (const [name, change] of Object.entries(collections)) {
      const upserts = change.upserts ?? [];
      const deletes = change.deletes ?? [];
      versions[name] = {};
      let touched = false;

      let before = new Map<string, unknown>();
      // Read the stored rows when webhooks are listening (to diff), and also for products when the caller
      // can't see cost — so the real cost can be preserved over whatever redacted value they send back.
      const needBefore = (name === "orders" && listening) || (name === "products" && (listening || !seeProductCost));
      if (needBefore) {
        const ids = [...upserts.map((u) => u?.id), ...deletes].filter((v): v is string => typeof v === "string");
        if (ids.length) {
          const r = await client.query<{ id: string; data: unknown }>("select id, data from app_records where collection = $1 and id = any($2::text[])", [name, ids]);
          before = new Map(r.rows.map((x) => [x.id, x.data]));
        }
      }

      // The record actually written (and diffed for webhooks) — cost preserved for non-financial callers.
      const effective = new Map<string, Record<string, unknown>>();

      // Newest-first lists: insert last item first so the first item gets the highest seq.
      for (const u of [...upserts].reverse()) {
        if (!u || typeof u.id !== "string" || !u.id || u.id.length > 120 || !isObj(u.data) || u.data.id !== u.id) throw new ApiError(400, "invalid", `Bad record in ${name}.`);
        const data = name === "products" && !seeProductCost ? (preserveProductCost(u.data, before.get(u.id)) as Record<string, unknown>) : u.data;
        // Re-check the invariants no legitimate screen ever violates, so a tampered/buggy client can't
        // persist values that would corrupt stock and money maths. Throws ApiError(422) → whole batch rolls back.
        if (name === "orders") validateOrder(data);
        else if (name === "products") validateProduct(data);
        effective.set(u.id, data);
        const payload = JSON.stringify(data);
        if (u.baseVersion === 0) {
          const r = await client.query("insert into app_records (collection, id, data, updated_by) values ($1,$2,$3::jsonb,$4) on conflict (collection, id) do nothing returning version", [name, u.id, payload, actor]);
          if (!r.rows.length) conflicts.push(`${name}/${u.id}`);
          else versions[name][u.id] = r.rows[0].version;
        } else {
          const r = await client.query(
            "update app_records set data = $3::jsonb, version = version + 1, updated_at = now(), updated_by = $4 where collection = $1 and id = $2 and version = $5 returning version",
            [name, u.id, payload, actor, u.baseVersion]
          );
          if (!r.rows.length) conflicts.push(`${name}/${u.id}`);
          else versions[name][u.id] = r.rows[0].version;
        }
        touched = true;
      }
      for (const id of deletes) {
        if (typeof id !== "string") continue;
        await client.query("delete from app_records where collection = $1 and id = $2", [name, id]);
        touched = true;
      }
      if (touched) revs[name] = await bumpRev(client, name);

      // A bug in event building must never stop a sale from being saved, so it is fenced off.
      if (listening && !conflicts.length) {
        try {
          if (name === "orders") for (const u of upserts) events.push(...orderEvents(before.get(u.id) as Order | undefined, (effective.get(u.id) ?? u.data) as unknown as Order));
          if (name === "products") {
            for (const u of upserts) events.push(...productEvents(before.get(u.id) as Product | undefined, (effective.get(u.id) ?? u.data) as unknown as Product));
            for (const id of deletes) if (typeof id === "string") events.push(...productEvents(before.get(id) as Product | undefined, null));
          }
        } catch (err) {
          console.error("[webhooks] couldn't build events", err);
        }
      }
    }

    for (const [key, change] of Object.entries(documents)) {
      const payload = JSON.stringify(change.data);

      if (key === "settings") {
        const { rows } = await client.query<{ data: Record<string, unknown> }>("select data from app_documents where key = 'settings' for update");
        const current = rows[0]?.data ?? {};
        const next = change.data as Record<string, unknown>;
        const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
        const curSecurity = { ...DEFAULT_SETTINGS.security, ...((current.security as object | undefined) ?? {}) };
        const nextSecurity = { ...DEFAULT_SETTINGS.security, ...((next.security as object | undefined) ?? {}) };
        if (changed(curSecurity, nextSecurity) && !roleHas(auth.role, "settings", "settings")) {
          throw new ApiError(403, "forbidden", "Only roles with Settings access can change security settings.", { name: key });
        }
        const curMaint = (current.company as { maintenanceMode?: boolean } | undefined)?.maintenanceMode ?? false;
        const nextMaint = (next.company as { maintenanceMode?: boolean } | undefined)?.maintenanceMode ?? curMaint;
        if (curMaint !== nextMaint && !auth.role.locked) throw new ApiError(403, "forbidden", "Only a Super Admin can change maintenance mode.", { name: key });
      }

      let r;
      if (change.force) {
        r = await client.query(
          `insert into app_documents (key, data, updated_by) values ($1,$2::jsonb,$3)
           on conflict (key) do update set data = excluded.data, version = app_documents.version + 1, updated_at = now(), updated_by = excluded.updated_by
           returning version`,
          [key, payload, actor]
        );
      } else if (change.baseVersion === 0) {
        r = await client.query("insert into app_documents (key, data, updated_by) values ($1,$2::jsonb,$3) on conflict (key) do nothing returning version", [key, payload, actor]);
      } else {
        r = await client.query("update app_documents set data = $2::jsonb, version = version + 1, updated_at = now(), updated_by = $3 where key = $1 and version = $4 returning version", [key, payload, actor, change.baseVersion]);
      }
      if (!r.rows.length) conflicts.push(`document/${key}`);
      else {
        docVersions[key] = r.rows[0].version;
        revs[key] = await bumpRev(client, key);
      }
    }

    if (conflicts.length) throw new ApiError(409, "conflict", "Someone else changed this data first.", { conflicts });

    if (events.length) {
      await client.query("savepoint webhook_outbox");
      try {
        queuedEvents = await enqueueEvents(client, events);
        await client.query("release savepoint webhook_outbox");
      } catch (err) {
        console.error("[webhooks] couldn't queue events", err);
        await client.query("rollback to savepoint webhook_outbox");
      }
    }
  });

  if (queuedEvents > 0) after(() => deliverDue().catch((e) => console.error("[webhooks] deliver failed", e)));

  return json({ ok: true, versions, documents: docVersions, revs });
});
