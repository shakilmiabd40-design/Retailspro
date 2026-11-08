import { requireAuth, roleHas } from "@/server/auth";
import { query } from "@/server/db";
import { ApiError, json, readJson, route } from "@/server/http";
import { writeAudit } from "@/server/audit";
import type { AdSpendEntry, AdSpendInput } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";

const PLATFORMS = ["meta", "facebook", "instagram", "google", "tiktok", "other"] as const;

export const GET = route(async (req) => {
  const auth = await requireAuth(req, { passive: true });
  // Financial ad spend visibility: requires accounting or superAdmin
  const canSeeFinancials = auth.role.locked || roleHas(auth.role, "accounting", "view") || roleHas(auth.role, "reports", "financial");
  if (!canSeeFinancials) {
    throw new ApiError(403, "forbidden", "You do not have access to marketing ad spend.");
  }

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const platform = sp.get("platform");

  const where: string[] = [];
  const params: unknown[] = [];
  if (from) {
    params.push(from);
    where.push(`spend_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`spend_date <= $${params.length}`);
  }
  if (platform && platform !== "all") {
    params.push(platform);
    where.push(`platform = $${params.length}`);
  }

  const whereClause = where.length ? `where ${where.join(" and ")}` : "";
  const { rows } = await query<{
    id: string;
    spend_date: string;
    platform: string;
    campaign_id: string;
    campaign_name: string;
    ad_set_name: string;
    ad_name: string;
    spend: string;
    currency: string;
    created_at: string;
    updated_at: string;
  }>(
    `select id::text, spend_date::text, platform, campaign_id, campaign_name, ad_set_name, ad_name, spend::text, currency, created_at, updated_at
     from app_ad_spend
     ${whereClause}
     order by spend_date desc, campaign_name asc`,
    params
  );

  const entries: AdSpendEntry[] = rows.map((r) => ({
    id: r.id,
    spendDate: r.spend_date,
    platform: r.platform as any,
    campaignId: r.campaign_id,
    campaignName: r.campaign_name,
    adSetName: r.ad_set_name,
    adName: r.ad_name,
    spend: Number(r.spend),
    currency: r.currency,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return json({ entries });
});

export const POST = route(async (req) => {
  const auth = await requireAuth(req);
  const canEdit = auth.role.locked || roleHas(auth.role, "accounting", "create") || roleHas(auth.role, "accounting", "edit");
  if (!canEdit) throw new ApiError(403, "forbidden", "You do not have permission to record ad spend.");

  const body = await readJson<{ entry?: AdSpendInput; entries?: AdSpendInput[] }>(req);
  const rawList: AdSpendInput[] = body.entries ?? (body.entry ? [body.entry] : []);
  if (!rawList.length) throw new ApiError(400, "invalid_input", "Provide at least one ad spend entry.");

  const saved: AdSpendEntry[] = [];
  for (const item of rawList) {
    if (!item.spendDate || !/^\d{4}-\d{2}-\d{2}$/.test(item.spendDate)) {
      throw new ApiError(422, "invalid_field", "spendDate must be YYYY-MM-DD.");
    }
    const platform = (item.platform || "meta").toLowerCase();
    if (!PLATFORMS.includes(platform as any)) {
      throw new ApiError(422, "invalid_field", `platform must be one of: ${PLATFORMS.join(", ")}`);
    }
    const campaignName = (item.campaignName || "").trim();
    if (!campaignName) throw new ApiError(422, "invalid_field", "campaignName is required.");
    const spend = Math.max(0, Number(item.spend) || 0);

    const { rows } = await query<{
      id: string;
      spend_date: string;
      platform: string;
      campaign_id: string;
      campaign_name: string;
      ad_set_name: string;
      ad_name: string;
      spend: string;
      currency: string;
      created_at: string;
      updated_at: string;
    }>(
      `insert into app_ad_spend (spend_date, platform, campaign_id, campaign_name, ad_set_name, ad_name, spend, currency)
       values ($1::date, $2, $3, $4, $5, $6, $7, $8)
       on conflict (spend_date, lower(platform), lower(campaign_name), lower(ad_name))
       do update set spend = excluded.spend, campaign_id = excluded.campaign_id, ad_set_name = excluded.ad_set_name, updated_at = now()
       returning id::text, spend_date::text, platform, campaign_id, campaign_name, ad_set_name, ad_name, spend::text, currency, created_at, updated_at`,
      [
        item.spendDate,
        platform,
        item.campaignId?.trim() ?? "",
        campaignName,
        item.adSetName?.trim() ?? "",
        item.adName?.trim() ?? "",
        spend,
        item.currency?.trim() || "BDT",
      ]
    );

    const r = rows[0];
    saved.push({
      id: r.id,
      spendDate: r.spend_date,
      platform: r.platform as any,
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
      adSetName: r.ad_set_name,
      adName: r.ad_name,
      spend: Number(r.spend),
      currency: r.currency,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }

  await writeAudit(req, {
    userId: auth.user.id,
    userName: auth.user.name,
    module: "Accounting",
    action: "create",
    entity: "Marketing Ad Spend",
    summary: `Saved ${saved.length} ad spend record(s)`,
    after: { count: saved.length },
  });

  return json({ ok: true, saved });
});

export const DELETE = route(async (req) => {
  const auth = await requireAuth(req);
  const canDelete = auth.role.locked || roleHas(auth.role, "accounting", "delete");
  if (!canDelete) throw new ApiError(403, "forbidden", "You do not have permission to delete ad spend.");

  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new ApiError(400, "invalid_id", "ID is required.");

  await query("delete from app_ad_spend where id = $1::bigint", [id]);
  await writeAudit(req, {
    userId: auth.user.id,
    userName: auth.user.name,
    module: "Accounting",
    action: "delete",
    entity: "Marketing Ad Spend",
    summary: `Deleted ad spend record #${id}`,
  });

  return json({ ok: true });
});
