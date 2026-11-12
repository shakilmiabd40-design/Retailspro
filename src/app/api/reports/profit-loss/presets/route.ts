import { normalisePreset, type PnlPreset } from "@/lib/reports/profit-loss";
import { requireAuth, roleHas } from "@/server/auth";
import { canRead, COLLECTION_ACCESS } from "@/server/collections";
import { ApiError, json, route } from "@/server/http";
import { deletePreset, loadPresets, savePreset } from "@/server/reports/profit-loss-presets";

export const dynamic = "force-dynamic";

/** Only a role that may change financial settings can save a layout for everyone. */
function canManagePresets(role: Awaited<ReturnType<typeof requireAuth>>["role"]): boolean {
  return role.locked || roleHas(role, "reports", "financial") || roleHas(role, "accounting", "view");
}

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  if (!canRead(auth.role, COLLECTION_ACCESS.journal_entries)) throw new ApiError(403, "forbidden", "You do not have access to profit and loss figures.");
  return json({ presets: await loadPresets(), canManage: canManagePresets(auth.role) });
});

export const POST = route(async (req) => {
  const auth = await requireAuth(req);
  if (!canManagePresets(auth.role)) throw new ApiError(403, "forbidden", "You do not have permission to change report layouts.");
  const body = (await req.json().catch(() => null)) as { preset?: Partial<PnlPreset>; deleteId?: string } | null;
  if (!body) throw new ApiError(400, "bad_json", "Send the preset to save.");
  if (typeof body.deleteId === "string") {
    return json({ presets: await deletePreset(body.deleteId) });
  }
  if (!body.preset) throw new ApiError(400, "bad_json", "Send the preset to save.");
  return json({ presets: await savePreset(normalisePreset(body.preset)) });
});
