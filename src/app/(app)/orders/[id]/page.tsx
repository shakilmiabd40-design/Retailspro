"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, RefreshCcw, Ban, Printer, PackageCheck, Pencil, Trash2, Image as ImageIcon } from "lucide-react";
import { useOrders } from "@/lib/orders/store";
import { useProducts } from "@/lib/products/store";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { OrderStatusBadge } from "@/components/orders/status-badge";
import { OrderTimeline } from "@/components/orders/order-timeline";
import { CancelOrderModal } from "@/components/orders/cancel-order-modal";
import { UpdateStatusModal } from "@/components/orders/update-status-modal";
import { formatTaka } from "@/lib/products/utils";
import {
  actualCourierCost,
  canCancelOrder,
  cancelReasonLabel,
  collectedAmount,
  courierLoss,
  courierProfit,
  expectedCod,
  formatOrderDate,
  isFinalStatus,
  ORDER_STATUS_LABELS,
  productSubtotal,
  totalDiscount,
} from "@/lib/orders/utils";

export default function OrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { getOrder, hydrated, markReturnReceived, deleteOrder } = useOrders();
  const { getProduct } = useProducts();
  const showToast = useToast();
  const order = getOrder(params.id);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [confirmReturn, setConfirmReturn] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!hydrated) {
    return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  }

  if (!order) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          Order not found
        </p>
        <Link href="/orders" className="focus-ring mt-1 flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium text-white" style={{ background: "var(--brand)" }}>
          <ArrowLeft size={14} />
          Back to Orders
        </Link>
      </div>
    );
  }

  function handlePrintInvoice() {
    if (!order) return;
    router.push(`/orders/${order.id}/invoice`);
  }

  const cost = actualCourierCost(order);
  const profit = courierProfit(order);
  const loss = courierLoss(order);
  const showReturnReceivedButton =
    (order.status === "partial_delivered" || order.status === "refuse_return") &&
    order.returnInfo.returnRequired &&
    !order.returnInfo.returnReceived;

  return (
    <>
      <button onClick={() => router.back()} className="focus-ring flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        <ArrowLeft size={14} />
        Back
      </button>

      {/* Header */}
      <div className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[19px] font-semibold" style={{ color: "var(--text)" }}>
              #{order.orderNumber}
            </h1>
            <OrderStatusBadge status={order.status} />
            {order.source === "pos" && order.posInvoiceId && (
              <Link href={`/pos/sales/${order.posInvoiceId}`} className="rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold" style={{ background: "var(--brand-soft)", color: "var(--brand-strong)" }}>
                POS · {order.posInvoiceNumber}
              </Link>
            )}
          </div>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--text-muted)" }}>
            Created {formatOrderDate(order.createdAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isFinalStatus(order.status) && (
            <button
              onClick={() => setStatusOpen(true)}
              className="focus-ring flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-white"
              style={{ background: "var(--brand)" }}
            >
              <RefreshCcw size={14} />
              Update Status
            </button>
          )}
          {canCancelOrder(order.status) && (
            <button
              onClick={() => setCancelOpen(true)}
              className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
              style={{ borderColor: "var(--border)", color: "var(--red)" }}
            >
              <Ban size={14} />
              Cancel Order
            </button>
          )}
          <Link
            href={`/orders/${order.id}/edit`}
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            <Pencil size={14} />
            Edit Order
          </Link>
          <button
            onClick={handlePrintInvoice}
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--text)" }}
          >
            <Printer size={14} />
            Print Invoice
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--red)" }}
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {/* Customer Information */}
          <section className="card p-5">
            <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              Customer Information
            </p>
            <div className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
              <Info label="Name" value={order.customerName} />
              <Info label="Phone" value={order.phone} />
              {order.altPhone && <Info label="Alternative Phone" value={order.altPhone} />}
              {order.district && <Info label="District" value={order.district} />}
              {order.area && <Info label="Area" value={order.area} />}
              <Info label="Address" value={order.address} full />
              {order.notes && <Info label="Notes" value={order.notes} full />}
            </div>
          </section>

          {/* Order Items */}
          <section className="card p-5">
            <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              Order Items
            </p>
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
              <table className="w-full min-w-[520px] border-collapse text-left text-[12.5px]">
                <thead>
                  <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 font-medium">Size / Color</th>
                    <th className="px-3 py-2 font-medium">Qty</th>
                    <th className="px-3 py-2 font-medium">Price</th>
                    <th className="px-3 py-2 font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((i) => {
                    const product = getProduct(i.productId);
                    return (
                      <tr key={i.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2.5">
                            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: "var(--surface-2)" }}>
                              <ImageIcon size={14} style={{ color: "var(--text-faint)" }} />
                              {product?.imageUrl && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={product.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
                              )}
                            </span>
                            <span className="font-medium" style={{ color: "var(--text)" }}>
                              {i.productName}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                          {i.color} / {i.size}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                          {i.qty}
                        </td>
                        <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                          {formatTaka(i.price, 2)}
                        </td>
                        <td className="px-3 py-2 font-medium" style={{ color: "var(--text)" }}>
                          {formatTaka(i.price * i.qty - i.discount, 2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Courier Information */}
          <section className="card p-5">
            <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              Courier Information
            </p>
            {order.courier.company ? (
              <div className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
                <Info label="Courier Company" value={order.courier.company} />
                <Info label="Tracking ID" value={order.courier.trackingId} />
                {order.courier.dispatchDate && <Info label="Dispatch Date" value={new Date(order.courier.dispatchDate).toLocaleDateString()} />}
                <Info label="Forward Cost" value={formatTaka(order.courier.forwardCost, 2)} />
                <Info label="Return Cost" value={formatTaka(order.courier.returnCost, 2)} />
                <Info label="Other Cost" value={formatTaka(order.courier.otherCost, 2)} />
                <Info label="Total Courier Cost" value={formatTaka(cost, 2)} />
              </div>
            ) : (
              <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                Not dispatched yet.
              </p>
            )}
          </section>

          {/* Delivery Result */}
          {(order.status === "delivered" || order.status === "partial_delivered" || order.status === "refuse_return") && (
            <section className="card p-5">
              <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                Delivery Result
              </p>
              <div className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
                <Info label="Delivery Status" value={ORDER_STATUS_LABELS[order.status]} />
                <Info label="Customer Paid" value={formatTaka(order.delivery.customerPaid, 2)} />
                <Info label="Courier Cost" value={formatTaka(cost, 2)} />
                <Info label="Courier Recovery" value={formatTaka(order.delivery.customerPaid, 2)} />
                {profit > 0 && <Info label="Courier Profit" value={formatTaka(profit, 2)} accent="var(--green)" />}
                {loss > 0 && <Info label="Courier Loss" value={formatTaka(loss, 2)} accent="var(--red)" />}
                {order.delivery.settlementStatus && <Info label="Settlement Status" value={order.delivery.settlementStatus === "settled" ? "Settled" : "Pending"} />}
              </div>
            </section>
          )}

          {/* Return Information */}
          {order.returnInfo.returnRequired && (
            <section className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                  Return Information
                </p>
                {showReturnReceivedButton && (
                  <button
                    onClick={() => setConfirmReturn(true)}
                    className="focus-ring flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold text-white"
                    style={{ background: "var(--brand)" }}
                  >
                    <PackageCheck size={13} />
                    Mark Return Received
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
                <Info label="Return Required" value="Yes" />
                <Info label="Return Received" value={order.returnInfo.returnReceived ? "Yes" : "No — still with courier"} accent={order.returnInfo.returnReceived ? "var(--green)" : "var(--brand)"} />
                {order.returnInfo.returnDate && <Info label="Return Date" value={new Date(order.returnInfo.returnDate).toLocaleDateString()} />}
              </div>
            </section>
          )}

          {/* Cancellation Information */}
          {order.status === "cancelled" && (
            <section className="card p-5">
              <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                Cancellation Information
              </p>
              <div className="grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
                {order.cancellation.cancelledAt && <Info label="Cancelled Date" value={formatOrderDate(order.cancellation.cancelledAt)} />}
                {order.cancellation.cancelledBy && <Info label="Cancelled By" value={order.cancellation.cancelledBy} />}
                {order.cancellation.reason && <Info label="Cancel Reason" value={cancelReasonLabel(order.cancellation.reason)} />}
                {order.cancellation.notes && <Info label="Notes" value={order.cancellation.notes} full />}
              </div>
            </section>
          )}

          {/* Activity */}
          <section className="card p-5">
            <p className="mb-4 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              Activity
            </p>
            <OrderTimeline activity={order.activity} />
          </section>
        </div>

        {/* Order Summary sidebar */}
        <div className="space-y-5">
          <section className="card p-5">
            <p className="mb-3 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              Order Summary
            </p>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <span style={{ color: "var(--text-muted)" }}>Subtotal</span>
                <span style={{ color: "var(--text)" }}>{formatTaka(productSubtotal(order), 2)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-muted)" }}>Discount</span>
                <span style={{ color: "var(--text)" }}>- {formatTaka(totalDiscount(order), 2)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--text-muted)" }}>Delivery Charge</span>
                <span style={{ color: "var(--text)" }}>+ {formatTaka(order.deliveryCharge, 2)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-[14px] font-semibold" style={{ borderColor: "var(--border)" }}>
                <span style={{ color: "var(--text)" }}>Expected COD</span>
                <span style={{ color: "var(--brand)" }}>{formatTaka(expectedCod(order), 2)}</span>
              </div>
              {order.status !== "pending" && order.status !== "processing" && order.status !== "in_transit" && (
                <div className="flex justify-between text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                  <span>Collected Amount</span>
                  <span>{formatTaka(collectedAmount(order), 2)}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      <CancelOrderModal order={order} open={cancelOpen} onClose={() => setCancelOpen(false)} />
      <UpdateStatusModal order={order} open={statusOpen} onClose={() => setStatusOpen(false)} />
      <ConfirmDialog
        open={confirmDelete}
        title={`Delete order #${order.orderNumber}`}
        message="This permanently removes the order. Reserved stock is released, sold stock is put back, and any warranties for it are voided. This can't be undone."
        confirmLabel="Delete Order"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          const result = deleteOrder(order.id);
          setConfirmDelete(false);
          if (!result.ok) {
            showToast(result.error, "error");
            return;
          }
          showToast(`Order #${order.orderNumber} deleted`);
          router.push("/orders");
        }}
      />
      <ConfirmDialog
        open={confirmReturn}
        title="Mark return received"
        message="Confirms the parcel is physically back. Reserved stock for this order will be released back to available stock."
        confirmLabel="Confirm"
        danger={false}
        onCancel={() => setConfirmReturn(false)}
        onConfirm={() => {
          markReturnReceived(order.id);
          showToast("Return received — stock restored");
          setConfirmReturn(false);
        }}
      />
    </>
  );
}

function Info({ label, value, full, accent }: { label: string; value: string; full?: boolean; accent?: string }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
        {label}
      </p>
      <p className="mt-0.5" style={{ color: accent ?? "var(--text)" }}>
        {value}
      </p>
    </div>
  );
}
