import { query } from "@/server/db";
import { ApiError, json, readJson, route, str } from "@/server/http";
import { requireAuth } from "@/server/auth";
import { sendMail } from "@/server/mail";

export const dynamic = "force-dynamic";

interface LowStockPayload {
  notificationId: string;
  status: "replenish" | "critical" | "out_of_stock";
  productName: string;
  sku: string;
  color: string;
  size: string;
  quantityOnHand: number;
  thresholdValue: number | null;
  suggestedAction: string;
  suggestedQty?: number;
}

const STATUS_LABEL: Record<LowStockPayload["status"], string> = { replenish: "Replenish", critical: "Critical", out_of_stock: "Out of Stock" };
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function parseBody(b: Record<string, unknown>): LowStockPayload {
  const status = b.status;
  if (status !== "replenish" && status !== "critical" && status !== "out_of_stock") throw new ApiError(400, "invalid", "Not a low-stock status.");
  const notificationId = str(b.notificationId, 80);
  if (!notificationId) throw new ApiError(400, "invalid", "notificationId is required.");
  return {
    notificationId,
    status,
    productName: str(b.productName, 200),
    sku: str(b.sku, 100),
    color: str(b.color, 60),
    size: str(b.size, 60),
    quantityOnHand: Number(b.quantityOnHand) || 0,
    thresholdValue: b.thresholdValue === null || b.thresholdValue === undefined ? null : Number(b.thresholdValue),
    suggestedAction: str(b.suggestedAction, 300),
    suggestedQty: b.suggestedQty === undefined || b.suggestedQty === null ? undefined : Number(b.suggestedQty),
  };
}

/**
 * POST /api/notifications/email — called by the browser the moment the inventory board opens a new
 * Replenish / Critical / Out of stock item. This route is the single source of truth for whether an email
 * actually goes out: it re-checks Settings → Notifications → "Low stock alerts" itself (client doesn't decide),
 * resolves recipients from the selected roles' own account emails, and sends at most once per notification
 * (a database uniqueness check, so several open browser tabs can never double-send).
 */
export const POST = route(async (req) => {
  await requireAuth(req); // any signed-in user may trigger this; the settings check below is what actually gates it
  const input = parseBody(await readJson(req));

  const settingsRow = await query<{ pref: { enabled: boolean; email: boolean; roleIds: string[] } | null }>(
    "select data->'notifications'->'events'->'lowStock' as pref from app_documents where key = 'settings'"
  );
  const pref = settingsRow.rows[0]?.pref;
  if (!pref?.enabled || !pref.email) return json({ sent: false, reason: "disabled" });
  const roleIds = Array.isArray(pref.roleIds) ? pref.roleIds : [];
  if (!roleIds.length) return json({ sent: false, reason: "no_recipients" });

  const { rows: users } = await query<{ email: string }>("select email from app_users where status = 'active' and role_id = any($1::text[])", [roleIds]);
  const recipients = [...new Set(users.map((u) => u.email.trim()).filter(isEmail))];
  if (!recipients.length) return json({ sent: false, reason: "no_recipients" });

  // Claim this notification id; if another request already claimed it, we're done — no duplicate email.
  const claimed = await query("insert into app_sent_notification_emails (notification_id) values ($1) on conflict do nothing returning notification_id", [input.notificationId]);
  if (!claimed.rows.length) return json({ sent: false, reason: "duplicate" });

  const label = STATUS_LABEL[input.status];
  const variant = [input.color, input.size].filter(Boolean).join(" / ");
  const origin = req.nextUrl.origin;
  const link = `${origin}/notifications/${encodeURIComponent(input.notificationId)}`;
  const subject = `[RetailPro] ${label}: ${input.productName}${variant ? ` (${variant})` : ""} — ${input.quantityOnHand} left`;
  const text = [
    `${label} stock alert`,
    ``,
    `Product: ${input.productName}`,
    variant ? `Variant: ${variant}` : null,
    `SKU: ${input.sku}`,
    `Available now: ${input.quantityOnHand}${input.thresholdValue !== null ? ` (threshold ${input.thresholdValue})` : ""}`,
    input.suggestedAction ? `Suggested action: ${input.suggestedAction}${input.suggestedQty ? ` (qty ${input.suggestedQty})` : ""}` : null,
    ``,
    `Open in RetailPro: ${link}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f2937;line-height:1.6">
      <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:${input.status === "out_of_stock" ? "#dc2626" : input.status === "critical" ? "#d97706" : "#2563eb"}">${label} stock alert</p>
      <table style="border-collapse:collapse">
        <tr><td style="color:#6b7280;padding-right:12px">Product</td><td><b>${escapeHtml(input.productName)}</b></td></tr>
        ${variant ? `<tr><td style="color:#6b7280;padding-right:12px">Variant</td><td>${escapeHtml(variant)}</td></tr>` : ""}
        <tr><td style="color:#6b7280;padding-right:12px">SKU</td><td>${escapeHtml(input.sku)}</td></tr>
        <tr><td style="color:#6b7280;padding-right:12px">Available now</td><td><b>${input.quantityOnHand}</b>${input.thresholdValue !== null ? ` <span style="color:#6b7280">(threshold ${input.thresholdValue})</span>` : ""}</td></tr>
        ${input.suggestedAction ? `<tr><td style="color:#6b7280;padding-right:12px">Suggested action</td><td>${escapeHtml(input.suggestedAction)}${input.suggestedQty ? ` (qty ${input.suggestedQty})` : ""}</td></tr>` : ""}
      </table>
      <p style="margin:16px 0 0"><a href="${link}" style="color:#2563eb">Open in RetailPro →</a></p>
    </div>`;

  const result = await sendMail({ to: recipients, subject, html, text });
  if (!result.ok) {
    // Let a later, genuinely new notification retry — a failed send (bad credentials, Gmail down) shouldn't
    // burn the one-time claim forever.
    await query("delete from app_sent_notification_emails where notification_id = $1", [input.notificationId]);
    return json({ sent: false, reason: "mail_error", detail: result.error });
  }
  return json({ sent: true, recipients: recipients.length });
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
