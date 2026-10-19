import "server-only";
import { query } from "../db";

/**
 * Steadfast courier API. Steadfast now serves their API from their "Packzy" merchant platform:
 *   Base URL: https://portal.packzy.com/api/v1   (GET /ping → {"message":"pong","service":"steadfast-api"})
 *   POST /create_order   — place a parcel (auth: api-key / secret-key headers; the old name was /place_order)
 *   GET  /get_balance    — authenticated account balance (what their own WordPress plugin uses to test a connection)
 *   GET  /status_by_cid/{id} — a consignment's current status
 *
 * The auth header for the secret is `secret-key` — NOT `Api-Secret`. With it missing, the API answers
 * 401 {"message":"Unauthorized Access (missing API credentials)"} even when the key itself is right.
 * (Header names are case-insensitive; the name itself is not.)
 *
 * Credentials are entered under Settings → Courier & Settlement → Steadfast API and stored in the settings
 * document; they are masked before the settings ever reach a browser (see src/server/redact.ts).
 * STEADFAST_API_KEY / STEADFAST_API_SECRET / STEADFAST_BASE_URL in the environment work as a fallback.
 *
 * The base URL is the FULL prefix including /api/v1 — endpoint paths are appended to it as-is.
 * Verify the endpoint paths and field names against the docs in your Steadfast merchant dashboard.
 */

export interface SteadfastCredentials {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

const DEFAULT_BASE_URL = "https://portal.packzy.com/api/v1";
const TIMEOUT_MS = 10_000;

/** Reads the saved credentials from the settings document (env fallback). Null when nothing is set. */
export async function getSteadfastCredentials(): Promise<SteadfastCredentials | null> {
  const { rows } = await query<{ cf: { apiKey?: string; apiSecret?: string; baseUrl?: string } | null }>(
    "select data->'courier'->'steadfast' as cf from app_documents where key = 'settings'"
  );
  const cf = rows[0]?.cf;
  const apiKey = (cf?.apiKey ?? "").trim() || process.env.STEADFAST_API_KEY?.trim() || "";
  const apiSecret = (cf?.apiSecret ?? "").trim() || process.env.STEADFAST_API_SECRET?.trim() || "";
  const baseUrl = ((cf?.baseUrl ?? "").trim() || process.env.STEADFAST_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret, baseUrl };
}

export const steadfastConfigured = async () => (await getSteadfastCredentials()) !== null;

type CallResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** One authenticated call against the Steadfast API. Never throws — always returns a result. */
async function call<T>(path: string, init?: RequestInit): Promise<CallResult<T>> {
  const creds = await getSteadfastCredentials();
  if (!creds) return { ok: false, error: "Steadfast isn't configured yet — enter the API key and secret under Settings → Courier & Settlement." };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${creds.baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "api-key": creds.apiKey,
        "secret-key": creds.apiSecret,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const data = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) return { ok: false, error: `Steadfast ${res.status}: ${JSON.stringify(data).slice(0, 300)}` };
    // Steadfast reports validation problems with HTTP 200 and {"status":400,"errors":{field:[…]}} —
    // treat those as failures too, with the per-field messages spelled out (otherwise a payload
    // rejection surfaces later as the misleading "didn't return a consignment id").
    const bodyStatus = Number((data as { status?: unknown }).status);
    if (Number.isFinite(bodyStatus) && bodyStatus >= 400) {
      const errs = (data as { errors?: Record<string, unknown> }).errors;
      const detail =
        errs && typeof errs === "object"
          ? Object.entries(errs).map(([f, v]) => `${f}: ${Array.isArray(v) ? v.join(" ") : String(v)}`).join(" | ")
          : data.message || JSON.stringify(data).slice(0, 300);
      return { ok: false, error: `Steadfast ${bodyStatus}: ${detail}` };
    }
    return { ok: true, data };
  } catch (err) {
    // Node's fetch hides the real problem (DNS, TLS, refused) inside `cause` — surface it, plus the
    // host we tried, so "fetch failed" never shows up on its own again.
    const e = err as Error & { cause?: { code?: string; message?: string } };
    const detail = e?.cause?.code || e?.cause?.message || e?.message || "network error";
    return { ok: false, error: `Couldn't reach Steadfast at ${creds.baseUrl} (${detail}).` };
  } finally {
    clearTimeout(timer);
  }
}

export interface SteadfastShipmentInput {
  /** Our order number — Steadfast uses the invoice to recognise retries. */
  invoice: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  /** Cash to collect on delivery. */
  cod_amount: number;
  package_description: string;
  special_instruction?: string;
}

export type SteadfastShipmentResult =
  | { ok: true; consignmentId: number; trackingCode: string }
  | { ok: false; error: string };

/**
 * Places a parcel order in Steadfast.
 *
 * Only the fields Steadfast's own WordPress plugin sends (plus the two optional description fields)
 * are sent. Notably we do NOT send `delivery_type`: the API validates it as an INTEGER — the old
 * "Home Delivery" string gets 400 {"errors":{"delivery_type":["The delivery type must be an integer."]}}.
 * It is optional (verified against the live API) and no integer-to-name mapping is documented, so we
 * let Steadfast apply its server-side default — exactly what every parcel their official plugin books does.
 * `payment_type` is likewise unvalidated/ignored there; cod_amount > 0 is what makes it COD.
 */
export async function createSteadfastShipment(input: SteadfastShipmentInput): Promise<SteadfastShipmentResult> {
  const r = await call<Record<string, unknown>>("/create_order", {
    method: "POST",
    body: JSON.stringify({ ...input }),
  });
  if (!r.ok) return r;
  // Be liberal about the response shape: success is {"status":200,"consignment":{"consignment_id":…}}
  // (their WordPress plugin reads consignment.consignment_id), while the old API used top-level
  // consignment_id / tracking_code — take whichever looks like an id and never lose the raw payload.
  const d = r.data as {
    consignment_id?: number; id?: number; consignmentId?: number;
    tracking_code?: string; trackingCode?: string;
    consignment?: { consignment_id?: number; id?: number; consignmentId?: number; tracking_code?: string; trackingCode?: string };
    message?: string;
  };
  const c = d.consignment;
  const consignmentId = d.consignment_id ?? d.id ?? d.consignmentId ?? c?.consignment_id ?? c?.id ?? c?.consignmentId;
  if (typeof consignmentId !== "number" && typeof consignmentId !== "string") {
    return { ok: false, error: `Steadfast didn't return a consignment id. Response: ${JSON.stringify(r.data).slice(0, 250)}` };
  }
  return { ok: true, consignmentId: Number(consignmentId), trackingCode: d.tracking_code ?? d.trackingCode ?? c?.tracking_code ?? c?.trackingCode ?? "" };
}

/**
 * Credentials + connectivity check — authenticated GET /get_balance.
 * The old /ping endpoint needs no credentials at all, so it answered "pong" even with a wrong
 * key/secret and could never fail a broken configuration; /get_balance fails exactly like a real
 * order would. (It's also what Steadfast's own plugin uses as its connection test.)
 */
export async function pingSteadfast(): Promise<CallResult<{ message?: string; current_balance?: number | string }>> {
  const r = await call<{ message?: string; current_balance?: number | string }>("/get_balance");
  if (!r.ok) return r;
  const balance = r.data?.current_balance;
  return {
    ok: true,
    data: { ...r.data, message: balance !== undefined && balance !== null ? `balance ৳${balance}` : "credentials OK" },
  };
}

export interface SteadfastConsignment {
  status?: string;
  [k: string]: unknown;
}

/** Fetches a consignment's current state from Steadfast (GET /status_by_cid/{id}). */
export async function getSteadfastConsignment(consignmentId: number | string): Promise<CallResult<{ consignment?: SteadfastConsignment }>> {
  return call<{ consignment?: SteadfastConsignment }>(`/status_by_cid/${encodeURIComponent(String(consignmentId))}`);
}

/** Tells Steadfast the parcel outcome (see their docs for the exact status strings). */
export async function updateSteadfastStatus(consignmentId: number | string, status: string): Promise<CallResult<unknown>> {
  return call(`/status_update/${encodeURIComponent(String(consignmentId))}`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}
