import type { Order } from "@/lib/orders/types";
import { expectedCod } from "@/lib/orders/utils";

/**
 * Normalizes Bangladeshi phone numbers into international format without '+' or '00'.
 * e.g., '01712345678' -> '8801712345678'
 */
export function formatPhoneForWhatsApp(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "88" + cleaned;
  }
  return cleaned;
}

/**
 * Sends a raw WhatsApp message via the local whatsapp-bridge (port 3002).
 */
export async function sendWhatsAppMessage(phone: string, message: string): Promise<boolean> {
  const formattedPhone = formatPhoneForWhatsApp(phone);
  if (!formattedPhone) return false;

  try {
    const res = await fetch("http://localhost:3002/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: formattedPhone, message }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[WhatsApp] Bridge error:", text);
      return false;
    }

    console.log(`[WhatsApp] Message successfully sent to ${formattedPhone}`);
    return true;
  } catch (err) {
    console.error("[WhatsApp] Network error connecting to whatsapp-bridge on port 3002:", err);
    return false;
  }
}

/**
 * Automatically triggers status update messages based on order status changes.
 */
export async function handleOrderStatusWhatsAppNotification(prevOrder: Order | undefined | null, nextOrder: Order) {
  if (!nextOrder || !nextOrder.phone) return;

  const prevStatus = prevOrder?.status;
  const nextStatus = nextOrder.status;

  // Only trigger on status changes
  if (prevStatus === nextStatus) return;

  const customerName = nextOrder.customerName || "Customer";
  const orderNum = nextOrder.orderNumber;
  const cod = expectedCod(nextOrder);

  if (nextStatus === "processing" && prevStatus !== "processing") {
    const msg = `Dear ${customerName},\n\nYour order #${orderNum} (৳${cod}) has been confirmed and is now being packed!\n\nThank you for shopping with us.`;
    await sendWhatsAppMessage(nextOrder.phone, msg);
  } else if (nextStatus === "in_transit" && prevStatus !== "in_transit") {
    const courier = nextOrder.courier?.company || "Courier";
    const tracking = nextOrder.courier?.trackingId ? `\nTracking ID: ${nextOrder.courier.trackingId}` : "";
    const msg = `Dear ${customerName},\n\nGood news! Your order #${orderNum} has been handed over to ${courier}.${tracking}\n\nPlease keep ৳${cod} ready for Cash on Delivery.\n\nThank you!`;
    await sendWhatsAppMessage(nextOrder.phone, msg);
  } else if (nextStatus === "delivered" && prevStatus !== "delivered") {
    const msg = `Dear ${customerName},\n\nYour order #${orderNum} has been successfully delivered!\n\nThank you for choosing us. We hope to see you again soon!`;
    await sendWhatsAppMessage(nextOrder.phone, msg);
  }
}
