"use client";

import { Copy } from "lucide-react";
import { useToast } from "@/components/toast";
import { orderInfoText } from "@/lib/orders/utils";
import { posInvoiceInfoText } from "@/lib/pos/utils";
import type { Order } from "@/lib/orders/types";
import type { PosInvoice } from "@/lib/pos/types";

function CopyInfoButton({ text, label, compact }: { text: string; label: string; compact?: boolean }) {
  const showToast = useToast();

  async function copyInfo() {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied details for ${label}`);
    } catch {
      showToast("Couldn't copy. Please try again.", "error");
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={copyInfo}
        className="focus-ring rounded-md p-1.5 transition-colors hover:bg-[var(--surface-2)]"
        style={{ color: "var(--text-faint)" }}
        aria-label={`Copy info for ${label}`}
        title="Copy info"
      >
        <Copy size={16} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={copyInfo}
      className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
      style={{ borderColor: "var(--border)", color: "var(--text)" }}
      title="Copy name, phone, address, SKU and COD"
    >
      <Copy size={14} />
      Copy Info
    </button>
  );
}

/** Copies the courier-ready order summary in one click. */
export function CopyOrderInfoButton({ order, compact = false }: { order: Order; compact?: boolean }) {
  return <CopyInfoButton text={orderInfoText(order)} label={`#${order.orderNumber}`} compact={compact} />;
}

/** Copies the same summary for a POS delivery sale, which also carries its own order. */
export function CopyPosInvoiceInfoButton({ invoice, compact = false }: { invoice: PosInvoice; compact?: boolean }) {
  return <CopyInfoButton text={posInvoiceInfoText(invoice)} label={invoice.invoiceNumber} compact={compact} />;
}
