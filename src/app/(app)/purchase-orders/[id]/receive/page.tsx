"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { usePurchaseOrders } from "@/lib/purchase-orders/store";
import { useSuppliers } from "@/lib/suppliers/store";
import { useToast } from "@/components/toast";
import { useSettings } from "@/lib/settings/store";
import { canReceivePo } from "@/lib/purchase-orders/utils";

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };

export default function ReceiveStockPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getPo, hydrated, receiveStock } = usePurchaseOrders();
  const { getSupplier } = useSuppliers();
  const showToast = useToast();
  const { settings } = useSettings();
  const { preventOverReceive, unitCostEditableAtReceiving } = settings.purchase;
  const po = getPo(params.id);

  const [qtyNow, setQtyNow] = useState<Record<string, number>>({});
  const [costNow, setCostNow] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");

  if (!hydrated) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  if (!po) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Purchase order not found</p>
        <Link href="/purchase-orders" className="focus-ring mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white" style={{ background: "var(--brand)" }}>
          <ArrowLeft size={14} />
          Back to Purchase Orders
        </Link>
      </div>
    );
  }

  if (!canReceivePo(po)) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>Nothing left to receive</p>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>This PO is either fully received, cancelled, or still a draft awaiting approval.</p>
        <Link href={`/purchase-orders/${po.id}`} className="focus-ring mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white" style={{ background: "var(--brand)" }}>
          <ArrowLeft size={14} />
          Back to PO
        </Link>
      </div>
    );
  }

  const supplier = getSupplier(po.supplierId);
  const remainingItems = po.items.filter((i) => i.qtyReceived < i.qtyOrdered);

  function submit(final: boolean) {
    if (!po) return;
    const lines = remainingItems
      .map((i) => ({ variantId: i.variantId, qty: qtyNow[i.id] ?? 0, unitCost: costNow[i.id] ?? i.unitCost }))
      .filter((l) => l.qty > 0);
    if (!lines.length) {
      showToast("Enter a quantity for at least one item", "error");
      return;
    }
    for (const i of remainingItems) {
      const qty = qtyNow[i.id] ?? 0;
      const remaining = i.qtyOrdered - i.qtyReceived;
      if (preventOverReceive && qty > remaining) {
        showToast(`Can't receive more than the remaining ${remaining} for ${i.productName} (${i.color}/${i.size})`, "error");
        return;
      }
    }
    receiveStock(po.id, lines, note || (final ? "Final receiving" : "Partial receiving"));
    showToast("Stock received — inventory updated");
    router.push(`/purchase-orders/${po.id}`);
  }

  return (
    <>
      <Link href={`/purchase-orders/${po.id}`} className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back to PO
      </Link>

      <div>
        <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
          Receive Stock — #{po.poNumber}
        </h1>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          {supplier?.name ?? "Unknown Supplier"} · Enter what actually arrived; inventory updates immediately.
        </p>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[12.5px]">
            <thead>
              <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Qty Ordered</th>
                <th className="px-3 py-2 font-medium">Previously Received</th>
                <th className="px-3 py-2 font-medium">Qty Receiving Now</th>
                <th className="px-3 py-2 font-medium">Unit Cost</th>
              </tr>
            </thead>
            <tbody>
              {remainingItems.map((i) => {
                const remaining = i.qtyOrdered - i.qtyReceived;
                return (
                  <tr key={i.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>
                      {i.productName}
                      <span className="ml-1 font-normal" style={{ color: "var(--text-muted)" }}>({i.color}/{i.size})</span>
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{i.qtyOrdered}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{i.qtyReceived}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        max={preventOverReceive ? remaining : undefined}
                        value={qtyNow[i.id] ?? 0}
                        onChange={(e) => setQtyNow((prev) => ({ ...prev, [i.id]: Math.max(0, preventOverReceive ? Math.min(remaining, Number(e.target.value)) : Number(e.target.value)) }))}
                        className="focus-ring w-24 rounded-lg border px-2 py-1"
                        style={inputStyle}
                      />
                      <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-faint)" }}>/ {remaining} left</span>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={costNow[i.id] ?? i.unitCost}
                        disabled={!unitCostEditableAtReceiving}
                        onChange={(e) => setCostNow((prev) => ({ ...prev, [i.id]: Number(e.target.value) }))}
                        className="focus-ring w-24 rounded-lg border px-2 py-1"
                        style={inputStyle}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--border)" }}>
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Received at main warehouse" className="focus-ring w-full rounded-xl border px-3 py-2 text-[13px]" style={inputStyle} />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t p-4" style={{ borderColor: "var(--border)" }}>
          <button onClick={() => submit(false)} className="focus-ring rounded-xl border px-4 py-2 text-[13px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
            Save as Partial Receive
          </button>
          <button onClick={() => submit(true)} className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
            Confirm Receive
          </button>
        </div>
      </div>

      <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
        Unit costs entered here override the PO&apos;s line cost if they differ from the original invoice.
      </p>
    </>
  );
}
