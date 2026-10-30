import "server-only";
import { query } from "@/server/db";
import { ApiError, json, readJson, route, str } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { createSteadfastShipment, getSteadfastConsignment, pingSteadfast, steadfastConfigured } from "@/server/courier/steadfast";
import type { Order } from "@/lib/orders/types";

export const dynamic = "force-dynamic";

interface Consignment {
  consignmentId: number;
  trackingCode: string;
}

/**
 * One order = one Steadfast consignment. Requests for the same invoice are queued here so a
 * double-click (or a client retry) can't place the parcel twice; the DB check below covers
 * repeat requests made later on.
 */
const inFlight = new Map<string, Promise<Consignment>>();

/** Returns the consignment already booked for this order, if there is one. */
async function existingConsignment(invoice: string): Promise<Consignment | null> {
  const { rows } = await query<{ data: Order }>(
    `select data from app_records
      where collection = 'orders' and data->>'orderNumber' = $1
      limit 1`,
    [invoice]
  );
  const courier = rows[0]?.data?.courier;
  const trackingId = (courier?.trackingId ?? "").trim();
  if (!trackingId) return null;

  // Steadfast consignment ids are numeric. Anything else was typed by staff for another
  // courier and must not block a real Steadfast booking.
  const company = (courier?.company ?? "").trim().toLowerCase();
  const isSteadfast = !company || company.includes("steadfast");
  if (!isSteadfast || !/^\d+$/.test(trackingId)) return null;

  return { consignmentId: Number(trackingId), trackingCode: trackingId };
}

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

  const existing = await existingConsignment(invoice);
  if (existing) return json({ ...existing, reused: true });

  const running = inFlight.get(invoice);
  if (running) return json({ ...(await running), reused: true });

  const creation = (async (): Promise<Consignment> => {
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
    return { consignmentId: result.consignmentId, trackingCode: result.trackingCode };
  })();

  inFlight.set(invoice, creation);
  try {
    return json({ ...(await creation), reused: false });
  } finally {
    inFlight.delete(invoice);
  }
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
