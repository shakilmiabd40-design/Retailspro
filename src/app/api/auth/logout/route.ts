import { NextResponse } from "next/server";
import { clearSessionCookie, destroySession, requireAuth } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  try {
    const auth = await requireAuth(req, { allowMustReset: true, passive: true });
    await writeAudit(req, { userId: auth.user.id, userName: auth.user.name, module: "Security", action: "security", entity: `User ${auth.user.name}`, summary: "Signed out" });
  } catch {
    /* already signed out — still clear the cookie */
  }
  await destroySession(req);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
});
