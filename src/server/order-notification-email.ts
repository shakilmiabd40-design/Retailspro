import "server-only";
import { query } from "@/server/db";
import { sendMail } from "@/server/mail";
import { getShopName } from "@/server/shop";
import type { Order } from "@/lib/orders/types";

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Send an order-created email once, using the same role routing and settings gate as stock alerts. */
export async function sendNewOrderNotificationEmail(order: Order): Promise<void> {
  const notificationId = `new_order:${order.id}`;
  const settings = await query<{ pref: { enabled?: boolean; email?: boolean; roleIds?: string[] } | null }>(
    "select data->'notifications'->'events'->'newOrder' as pref from app_documents where key = 'settings'"
  );
  const pref = settings.rows[0]?.pref;
  if (!pref?.enabled || !pref.email || !pref.roleIds?.length) {
    console.info("[notifications] new-order email skipped", {
      orderId: order.id,
      reason: !pref?.enabled ? "event_disabled" : !pref.email ? "email_channel_disabled" : "no_roles_selected",
    });
    return;
  }
  const users = await query<{ email: string }>("select email from app_users where status = 'active' and role_id = any($1::text[])", [pref.roleIds]);
  const recipients = [...new Set(users.rows.map((u) => u.email.trim()).filter(isEmail))];
  if (!recipients.length) {
    console.info("[notifications] new-order email skipped", { orderId: order.id, reason: "no_active_recipient_emails" });
    return;
  }

  const claim = await query("insert into app_sent_notification_emails (notification_id) values ($1) on conflict do nothing returning notification_id", [notificationId]);
  if (!claim.rows.length) {
    console.info("[notifications] new-order email skipped", { orderId: order.id, reason: "already_sent" });
    return;
  }

  const shopName = await getShopName();
  const itemLines = order.items.map((item) => `${item.qty} × ${item.productName}${item.color || item.size ? ` (${[item.color, item.size].filter(Boolean).join(" / ")})` : ""}`).join("\n");
  const origin = process.env.NEXT_PUBLIC_APP_URL || "";
  const link = `${origin}/orders/${encodeURIComponent(order.id)}`;
  const text = [`New order ${order.orderNumber}`, `Customer: ${order.customerName}`, `Phone: ${order.phone}`, `Address: ${order.address}`, `Items:`, itemLines, link ? `Open order: ${link}` : ""].filter(Boolean).join("\n");
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937"><h2>New order ${escapeHtml(order.orderNumber)}</h2><p><b>Customer:</b> ${escapeHtml(order.customerName)}<br><b>Phone:</b> ${escapeHtml(order.phone)}<br><b>Address:</b> ${escapeHtml(order.address)}</p><ul>${order.items.map((item) => `<li>${item.qty} × ${escapeHtml(item.productName)}${item.color || item.size ? ` (${escapeHtml([item.color, item.size].filter(Boolean).join(" / "))})` : ""}</li>`).join("")}</ul>${link ? `<p><a href="${escapeHtml(link)}">Open order</a></p>` : ""}</div>`;
  const sent = await sendMail({ to: recipients, subject: `[${shopName}] New order ${order.orderNumber}`, html, text, fromName: shopName });
  if (!sent.ok) {
    await query("delete from app_sent_notification_emails where notification_id = $1", [notificationId]);
    console.warn("[notifications] new-order email failed", sent.error);
  }
}
