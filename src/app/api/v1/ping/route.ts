import { apiRoute, ok } from "@/server/publicapi/http";
import { authenticateApiKey } from "@/server/publicapi/apikeys";

export const dynamic = "force-dynamic";

/** GET /api/v1/ping — checks that your key works and shows what it may do. */
export const GET = apiRoute(async (req) => {
  const key = await authenticateApiKey(req, null);
  return ok({ status: "ok", key_name: key.name, scopes: key.scopes, server_time: new Date().toISOString() });
});
