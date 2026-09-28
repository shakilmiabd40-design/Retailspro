import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { ApiError } from "@/server/http";
import { apiRoute, ok } from "@/server/publicapi/http";
import { deliverDue } from "@/server/publicapi/webhooks";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Retry runner for failed webhook deliveries. Call it every minute or so from any scheduler
 * (cron-job.org, GitHub Actions, Vercel Cron on a paid plan…) with  Authorization: Bearer <CRON_SECRET>.
 * Retries also happen opportunistically whenever the shop is busy, so this is a safety net.
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) throw new ApiError(503, "not_configured", "Set CRON_SECRET in the environment to enable this endpoint.");
  const given = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new ApiError(401, "unauthorized", "Bad cron secret.");
  return ok(await deliverDue(50));
}
export const GET = apiRoute(run);
export const POST = apiRoute(run);
