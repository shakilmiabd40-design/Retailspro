import { isDbConfigured, query } from "@/server/db";
import { json, route } from "@/server/http";

export const dynamic = "force-dynamic";

/** Public: is the database reachable / set up, and does the first admin still need creating? */
export const GET = route(async () => {
  if (!isDbConfigured()) return json({ configured: false, ready: false, needsSetup: false });
  try {
    const { rows } = await query<{ n: string }>("select count(*)::text as n from app_users");
    const brand = await query<{ name: string | null }>("select data->'company'->>'shopName' as name from app_documents where key = 'settings'");
    return json({ configured: true, ready: true, needsSetup: rows[0].n === "0", setupTokenRequired: !!process.env.SETUP_TOKEN, shopName: brand.rows[0]?.name ?? null });
  } catch (err) {
    const e = err as { code?: string; message?: string };
    if (e.code === "42P01") return json({ configured: true, ready: false, needsSetup: false, message: "The database tables don't exist yet. Run  npm run db:setup  once." });
    console.error("[auth/status]", e.code, e.message);
    return json({ configured: true, ready: false, needsSetup: false, unreachable: true, message: "Couldn't connect to the database. Check DATABASE_URL and the SSL settings." });
  }
});
