import "server-only";
import { query } from "../db";

/**
 * Steadfast courier API. Steadfast now serves their API from their "Packzy" merchant platform:
 *   Base URL: https://portal.packzy.com/api/v1   (GET /ping → {"message":"pong","service":"steadfast-api"})
 *   POST /create_order   — place a parcel
 *   GET  /get_balance    — authenticated account balance
 *   GET  /status_by_cid/{id} — a consignment's current status
 */

export interface SteadfastCredentials {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
}

const DEFAULT_BASE_URL = "https://portal.packzy.com/api/v1";
const TIMEOUT_MS = 10_000;

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
    const e = err as Error & { cause?: { code?: string; message?: string } };
    const detail = e?.cause?.code || e?.cause?.message || e?.message || "network error";
    return { ok: false, error: `Couldn't reach Steadfast at ${creds.baseUrl} (${detail}).` };
  } finally {
    clearTimeout(timer);
  }
}

export interface SteadfastShipmentInput {
  invoice: string;
  recipient_name: string;
  recipient_phone: string;
  recipient_address: string;
  cod_amount: number;
  package_description: string;
  special_instruction?: string;
}

export type SteadfastShipmentResult =
  | { ok: true; consignmentId: number; trackingCode: string }
  | { ok: false; error: string };

export async function createSteadfastShipment(input: SteadfastShipmentInput): Promise<SteadfastShipmentResult> {
  const r = await call<Record<string, unknown>>("/create_order", {
    method: "POST",
    body: JSON.stringify({ ...input }),
  });
  if (!r.ok) return r;
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
  delivery_charge?: number;
  [k: string]: unknown;
}

/** Fetches a consignment's current state from Steadfast (GET /status_by_cid/{id}). */
export async function getSteadfastConsignment(consignmentId: number | string): Promise<CallResult<SteadfastConsignment>> {
  const res = await call<Record<string, unknown>>(`/status_by_cid/${encodeURIComponent(String(consignmentId))}`);
  if (!res.ok) return res;

  // Steadfast status_by_cid response structure can be flat or nested under "consignment"
  const raw = res.data as Record<string, unknown>;
  const consignmentObj = ((raw.consignment as Record<string, unknown>) || raw) as Record<string, unknown>;

  const cod =
    consignmentObj.cod_amount ??
    consignmentObj.codAmount ??
    consignmentObj.collected_amount ??
    consignmentObj.collectedAmount ??
    consignmentObj.paid_amount ??
    consignmentObj.paidAmount ??
    consignmentObj.amount ??
    consignmentObj.received_amount ??
    raw.cod_amount ??
    raw.codAmount ??
    raw.collected_amount ??
    raw.collectedAmount ??
    raw.paid_amount ??
    raw.paidAmount ??
    raw.amount ??
    raw.received_amount;

  return {
    ok: true,
    data: {
      status: String(consignmentObj.status ?? raw.status ?? "Unknown"),
      delivery_charge: Number(consignmentObj.delivery_charge ?? raw.delivery_charge ?? 0),
      cod_amount: cod !== undefined && cod !== null && cod !== "" ? Number(cod) || 0 : undefined,
      ...(cod !== undefined && cod !== null && cod !== "" ? { codAmount: Number(cod) || 0, collected_amount: Number(cod) || 0, paid_amount: Number(cod) || 0 } : {}),
      ...consignmentObj,
      ...raw,
    },
  };
}

export async function updateSteadfastStatus(consignmentId: number | string, status: string): Promise<CallResult<unknown>> {
  return call(`/status_update/${encodeURIComponent(String(consignmentId))}`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

/** Same shape as getSteadfastConsignment, looked up by the merchant invoice number instead of the consignment id. */
export async function getSteadfastConsignmentByInvoice(invoice: string): Promise<CallResult<SteadfastConsignment>> {
  const res = await call<Record<string, unknown>>(`/status_by_invoice/${encodeURIComponent(invoice)}`);
  if (!res.ok) return res;
  const raw = res.data as Record<string, unknown>;
  const consignmentObj = ((raw.consignment as Record<string, unknown>) || raw) as Record<string, unknown>;
  const cod =
    consignmentObj.cod_amount ??
    consignmentObj.codAmount ??
    consignmentObj.collected_amount ??
    consignmentObj.collectedAmount ??
    consignmentObj.paid_amount ??
    consignmentObj.paidAmount ??
    consignmentObj.amount ??
    consignmentObj.received_amount ??
    raw.cod_amount ??
    raw.codAmount ??
    raw.collected_amount ??
    raw.collectedAmount ??
    raw.paid_amount ??
    raw.paidAmount ??
    raw.amount ??
    raw.received_amount;
  return {
    ok: true,
    data: {
      status: String(consignmentObj.status ?? raw.status ?? "Unknown"),
      delivery_charge: Number(consignmentObj.delivery_charge ?? raw.delivery_charge ?? 0),
      cod_amount: cod !== undefined && cod !== null && cod !== "" ? Number(cod) || 0 : undefined,
      ...(cod !== undefined && cod !== null && cod !== "" ? { codAmount: Number(cod) || 0, collected_amount: Number(cod) || 0, paid_amount: Number(cod) || 0 } : {}),
      ...consignmentObj,
      ...raw,
    },
  };
}
