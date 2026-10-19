import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { tx } from "@/server/db";
import { ApiError, readJson, route, str } from "@/server/http";
import { createSession, hashPassword } from "@/server/auth";
import { writeAudit } from "@/server/audit";
import { ensurePresetRoles, seedSampleData } from "@/server/seed";
import { SUPER_ADMIN_ROLE_ID } from "@/lib/settings/permissions";
import { passwordProblems } from "@/lib/settings/security";
import { DEFAULT_SETTINGS } from "@/lib/settings/defaults";

export const dynamic = "force-dynamic";

/** One-time: creates the first Super Admin (and optionally loads sample data). Refuses once any user exists. */
export const POST = route(async (req) => {
  const body = await readJson<{ name?: string; email?: string; password?: string; sampleData?: boolean; setupToken?: string; shopName?: string }>(req);
  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const password = typeof body.password === "string" ? body.password : "";
  const shopName = str(body.shopName, 80);

  const required = process.env.SETUP_TOKEN;
  if (required) {
    const given = Buffer.from(str(body.setupToken, 200));
    const want = Buffer.from(required);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) throw new ApiError(403, "bad_setup_token", "The setup token is wrong.");
  }
  if (!name) throw new ApiError(400, "invalid", "Enter your name.");
  if (!shopName) throw new ApiError(400, "invalid", "Enter your shop or company name.");
  if (!email) throw new ApiError(400, "invalid", "Enter an email or username.");
  const problems = passwordProblems(password, DEFAULT_SETTINGS.security);
  if (problems.length) throw new ApiError(400, "weak_password", `Password needs: ${problems.join(", ").toLowerCase()}.`);

  const hash = await hashPassword(password);
  const id = crypto.randomUUID();

  await tx(async (client) => {
    await client.query("select pg_advisory_xact_lock(727201)");
    const { rows } = await client.query("select 1 from app_users limit 1");
    if (rows.length) throw new ApiError(409, "already_setup", "Setup has already been completed. Please sign in.");
    await ensurePresetRoles(client);
    await client.query(
      `insert into app_users (id, name, email, role_id, password_hash, must_reset_password)
       values ($1,$2,$3,$4,$5,false)`,
      [id, name, email, SUPER_ADMIN_ROLE_ID, hash]
    );
    // The shop name typed here becomes Settings → Company → Shop name (sidebar, sign-in page, invoices, emails…).
    await client.query(
      `insert into app_documents (key, data, updated_by) values ('settings', $1::jsonb, $2)
       on conflict (key) do update set data = jsonb_set(app_documents.data, '{company,shopName}', to_jsonb($3::text), true), version = app_documents.version + 1, updated_at = now()`,
      [JSON.stringify({ ...DEFAULT_SETTINGS, company: { ...DEFAULT_SETTINGS.company, shopName } }), id, shopName]
    );
    if (body.sampleData) await seedSampleData(client, id);
    await writeAudit(req, { userId: id, userName: name, module: "Security", action: "security", entity: `User ${name}`, summary: `Initial setup: created the first Super Admin${body.sampleData ? " and loaded sample data" : ""}` }, client);
  });

  const res = NextResponse.json({ ok: true });
  await createSession(req, res, id);
  return res;
});
