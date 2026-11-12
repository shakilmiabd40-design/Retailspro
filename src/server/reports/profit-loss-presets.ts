import "server-only";
import { DEFAULT_PRESET, normalisePreset, type PnlPreset } from "@/lib/reports/profit-loss";
import { query, tx } from "@/server/db";
import { RevisionCache, revisionKey } from "@/server/revision-cache";

/**
 * Saved Profit & Loss layouts.
 *
 * Stored in the `report_presets` document (no new table, no migration). A preset
 * says which lines to show, in which order, which periods to compare and which
 * breakdown to use — the same "copy a report definition" idea the big ERPs use.
 */

const DOCUMENT_KEY = "report_presets";

interface PresetsDocument {
  presets: PnlPreset[];
}

const presetsCache = new RevisionCache<PnlPreset[]>(4);

export async function loadPresets(): Promise<PnlPreset[]> {
  const rev = await revisionKey(["report_presets"]);
  return presetsCache.get(rev, async () => {
    const { rows } = await query<{ data: Partial<PresetsDocument> }>(
      "select data from app_documents where key = $1",
      [DOCUMENT_KEY],
    );
    const stored = rows[0]?.data?.presets;
    if (!Array.isArray(stored) || !stored.length) return [DEFAULT_PRESET];
    return stored.map((preset) => normalisePreset(preset));
  });
}

export async function savePreset(preset: PnlPreset): Promise<PnlPreset[]> {
  const normalised = normalisePreset(preset);
  const next = await tx(async (client) => {
    const { rows } = await client.query<{ data: Partial<PresetsDocument>; version: number }>(
      "select data, version from app_documents where key = $1 for update",
      [DOCUMENT_KEY],
    );
    const current = rows[0]?.data?.presets;
    const list = Array.isArray(current) ? current.map((p) => normalisePreset(p)) : [DEFAULT_PRESET];
    const merged = list.some((p) => p.id === normalised.id)
      ? list.map((p) => (p.id === normalised.id ? normalised : p))
      : [...list, normalised];
    const payload = JSON.stringify({ presets: merged });
    await client.query(
      `insert into app_documents (key, data, version, updated_at) values ($1, $2::jsonb, 1, now())
       on conflict (key) do update set data = excluded.data, version = app_documents.version + 1, updated_at = now()`,
      [DOCUMENT_KEY, payload],
    );
    await client.query(
      `insert into app_revs (name, rev) values ($1, 1) on conflict (name) do update set rev = app_revs.rev + 1`,
      [DOCUMENT_KEY],
    );
    return merged;
  });
  return next;
}

export async function deletePreset(id: string): Promise<PnlPreset[]> {
  const list = await loadPresets();
  const next = list.filter((preset) => preset.id !== id);
  const payload = JSON.stringify({ presets: next.length ? next : [DEFAULT_PRESET] });
  await tx(async (client) => {
    await client.query(
      `insert into app_documents (key, data, version, updated_at) values ($1, $2::jsonb, 1, now())
       on conflict (key) do update set data = excluded.data, version = app_documents.version + 1, updated_at = now()`,
      [DOCUMENT_KEY, payload],
    );
    await client.query(
      `insert into app_revs (name, rev) values ($1, 1) on conflict (name) do update set rev = app_revs.rev + 1`,
      [DOCUMENT_KEY],
    );
  });
  return next;
}
