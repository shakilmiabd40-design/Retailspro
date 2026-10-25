import "server-only";
import { ApiError, json, readJson, route, str } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { createSteadfastShipment, getSteadfastConsignment, pingSteadfast, steadfastConfigured } from "@/server/courier/steadfast";

export const dynamic = "force-dynamic";

/**
 * POST /api/courier/steadfast — creates a Steadfast consignment for an order being dispatched
 */
export const POST = route(async (req) => {
  await requireAuth(req);
  const b = await readJson(req);
  const invoice = str(b.invoice, 100);
  const phone = str(b.phone, 50);
  if (!invoice) throw new ApiError(400, "invalid", "invoice (order number) is required.");
  if (!phone) throw new ApiError(400, "invalid", "recipient phone is required.");

  const result = await createSteadfastShipment({
    invoice,
    recipient_name: str(b.recipientName, 200),
    recipient_phone: phone,
    recipient_address: str(b.address, 1000),
    cod_amount: Math.max(0, Number(b.codAmount) || 0),
    package_description: str(b.description, 500),
    special_instruction: str(b.specialInstruction, 500),
  });
  if (!result.ok) throw new ApiError(502, "steadfast_error", result.error);
  return json({ consignmentId: result.consignmentId, trackingCode: result.trackingCode });
});

/**
 * GET /api/courier/steadfast?id=<consignment_id> — the consignment's current status and delivery charge
 */
export const GET = route(async (req) => {
  await requireAuth(req);
  if (!(await steadfastConfigured())) {
    throw new ApiError(503, "not_configured", "Steadfast isn't configured — add the API key and secret under Settings → Courier & Settlement.");
  }
  if (req.nextUrl.searchParams.get("ping")) {
    const r = await pingSteadfast();
    if (!r.ok) throw new ApiError(502, "steadfast_error", r.error);
    return json({ pong: true, message: r.data.message ?? "pong" });
  }
  const id = str(req.nextUrl.searchParams.get("id"), 50);
  if (!id) throw new ApiError(400, "invalid", "id (consignment id) is required.");
  const r = await getSteadfastConsignment(id);
  if (!r.ok) throw new ApiError(502, "steadfast_error", r.error);

  return json({
    status: r.data.status || null,
    delivery_charge: r.data.delivery_charge || 0,
    consignment: r.data,
  });
});
