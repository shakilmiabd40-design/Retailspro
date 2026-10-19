import crypto from "node:crypto";
import { query } from "@/server/db";
import { requireAuth, SESSION_COOKIE } from "@/server/auth";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

/** Called by the browser while the person is actually using the app — resets the inactivity timer. */
export const POST = route(async (req) => {
  await requireAuth(req, { allowMustReset: true, passive: true });
  const token = req.cookies.get(SESSION_COOKIE)?.value ?? "";
  await query("update app_sessions set last_seen_at = now() where token_hash = $1", [crypto.createHash("sha256").update(token).digest("hex")]);
  return json({ ok: true });
});
