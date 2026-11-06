import "server-only";
import { query } from "../db";
import { readCourierPaidAmount, readLatestRiderTrackingMessage } from "./steadfast-status";

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

let _cachedCreds: { creds: SteadfastCredentials | null; at: number } | null = null;
const CREDS_TTL_MS = 60_000;

export async function getSteadfastCredentials(): Promise<SteadfastCredentials | null> {
  const now = Date.now();
  if (_cachedCreds && now - _cachedCreds.at < CREDS_TTL_MS) {
    return _cachedCreds.creds;
  }
  try {
    const { rows } = await query<{ cf: { apiKey?: string; apiSecret?: string; baseUrl?: string } | null }>(
      "select data->'courier'->'steadfast' as cf from app_documents where key = 'settings'"
    );
    const cf = rows[0]?.cf;
    const apiKey = (cf?.apiKey ?? "").trim() || process.env.STEADFAST_API_KEY?.trim() || "";
    const apiSecret = (cf?.apiSecret ?? "").trim() || process.env.STEADFAST_API_SECRET?.trim() || "";
    const baseUrl = ((cf?.baseUrl ?? "").trim() || process.env.STEADFAST_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
    if (!apiKey || !apiSecret) {
      _cachedCreds = { creds: null, at: now };
      return null;
    }
    const creds = { apiKey, apiSecret, baseUrl };
    _cachedCreds = { creds, at: now };
    return creds;
  } catch {
    if (_cachedCreds) return _cachedCreds.creds;
    return null;
  }
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

import { normalizePhoneForCourier } from "@/lib/utils/phone";

export async function createSteadfastShipment(input: SteadfastShipmentInput): Promise<SteadfastShipmentResult> {
  const normalized = {
    ...input,
    recipient_phone: normalizePhoneForCourier(input.recipient_phone) || input.recipient_phone,
  };
  const r = await call<Record<string, unknown>>("/create_order", {
    method: "POST",
    body: JSON.stringify(normalized),
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

function reportedStatus(raw: Record<string, unknown>, consignment: Record<string, unknown>): string {
  const value = consignment.delivery_status ?? consignment.status ?? raw.delivery_status ?? (typeof raw.status === "string" ? raw.status : undefined);
  return typeof value === "string" || typeof value === "number" ? String(value) : "Unknown";
}

/** Fetches a consignment's current state from Steadfast (GET /status_by_cid/{id}). */
export async function getSteadfastConsignment(consignmentId: number | string): Promise<CallResult<SteadfastConsignment>> {
  const res = await call<Record<string, unknown>>(`/status_by_cid/${encodeURIComponent(String(consignmentId))}`);
  if (!res.ok) return res;

  // Steadfast status_by_cid response structure can be flat or nested under "consignment"
  const raw = res.data as Record<string, unknown>;
  const consignmentObj = ((raw.consignment as Record<string, unknown>) || raw) as Record<string, unknown>;

  const cod = readCourierPaidAmount(raw, consignmentObj);

  return {
    ok: true,
    data: {
      ...consignmentObj,
      ...raw,
      // Normalise COD fields without labelling them `collected_amount`: a later rider note may
      // contain the actual amount collected and must be allowed to override this COD value.
      // Status lookup responses commonly use { status: 200, delivery_status: "pending" }.
      // Prefer the courier status field so the HTTP code is never mistaken for parcel status.
      status: reportedStatus(raw, consignmentObj),
      delivery_charge: Number(consignmentObj.delivery_charge ?? raw.delivery_charge ?? 0),
      ...(cod !== null ? { cod_amount: cod, codAmount: cod } : {}),
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
  const cod = readCourierPaidAmount(raw, consignmentObj);
  return {
    ok: true,
    data: {
      ...consignmentObj,
      ...raw,
      // Do not turn a COD value into a `collected_amount`; rider-note collection can override COD.
      status: reportedStatus(raw, consignmentObj),
      delivery_charge: Number(consignmentObj.delivery_charge ?? raw.delivery_charge ?? 0),
      ...(cod !== null ? { cod_amount: cod, codAmount: cod } : {}),
    },
  };
}

/** Loads tracking history and returns its newest rider-note message, if one is present. */
export async function getSteadfastRiderNoteByInvoice(invoice: string): Promise<CallResult<string | null>> {
  const res = await call<Record<string, unknown>>(`/trackings_by_invoice/${encodeURIComponent(invoice)}`);
  if (!res.ok) return res;
  return { ok: true, data: readLatestRiderTrackingMessage(res.data) };
}
