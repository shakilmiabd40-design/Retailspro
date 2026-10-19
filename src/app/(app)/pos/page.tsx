"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, Banknote, CirclePause, Lock, PauseCircle, Plus, Settings2, ShoppingCart, Store, Truck } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { useOrders } from "@/lib/orders/store";
import { useSettings } from "@/lib/settings/store";
import { useAccess } from "@/lib/settings/access";
import { usePos } from "@/lib/pos/store";
import { useCart } from "@/lib/pos/use-cart";
import { usePref } from "@/lib/pos/use-pref";
import { computeTotals, customerDirectory } from "@/lib/pos/utils";
import type { PosSession, SaleType } from "@/lib/pos/types";
import { formatDateTime } from "@/lib/settings/runtime";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ProductBrowser, type BrowserView } from "@/components/pos/product-browser";
import { CartPanel, cartRows } from "@/components/pos/cart-panel";
import { CustomerBlock } from "@/components/pos/customer-block";
import { CheckoutModal } from "@/components/pos/checkout-modal";
import { HeldSalesModal, HoldSaleModal } from "@/components/pos/held-sales";
import { CashMovementModal, CloseSessionModal, OpenSessionFields } from "@/components/pos/session-modals";
import { GhostBtn, Loading, PrimaryBtn, money } from "@/components/pos/ui";

type Modal = "checkout" | "hold" | "held" | "close" | "cash" | "clear" | null;

export default function NewSalePage() {
  const { products } = useProducts();
  const { orders } = useOrders();
  const { settings } = useSettings();
  const { currentUser, can } = useAccess();
  const pos = usePos();
  const toast = useToast();
  const p = settings.pos;

  const cart = useCart({ userId: currentUser.id, userName: currentUser.name, policy: pos.discountPolicy });
  const { draft } = cart;
  const [view, setView] = usePref<BrowserView>("view", "grid");
  const [beepOn, setBeepOn] = usePref<boolean>("beep", true);
  const [modal, setModal] = useState<Modal>(null);
  const [checkoutType, setCheckoutType] = useState<SaleType>("walk_in");
  // The session being closed is kept here: once it closes, `mySession` is gone, but the dialog still has to show the result.
  const [closing, setClosing] = useState<PosSession | null>(null);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [openingCash, setOpeningCash] = useState("");
  const [openError, setOpenError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const resolved = useMemo(() => pos.resolveDraft(draft.lines), [pos, draft.lines]);
  const rows = useMemo(() => cartRows(draft.lines, resolved.lines, products), [draft.lines, resolved.lines, products]);
  const totals = useMemo(() => computeTotals(resolved.lines, draft.cartDiscount, p.vatPercent, 0), [resolved.lines, draft.cartDiscount, p.vatPercent]);
  const directory = useMemo(() => customerDirectory(pos.invoices, orders), [pos.invoices, orders]);

  const session = pos.mySession;
  const closeModal = useCallback(() => {
    setModal(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  }, []);
  const canCheckout = !!session && draft.lines.length > 0 && resolved.problems.length === 0 && totals.total >= 0;
  const openCheckout = useCallback((type: SaleType) => {
    setCheckoutType(type);
    setModal("checkout");
  }, []);

  // F2 → search, F8 → checkout
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal) return;
      if (e.key === "F2") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "F8" && canCheckout) {
        e.preventDefault();
        openCheckout("walk_in");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modal, canCheckout, openCheckout]);

  if (!pos.hydrated) return <Loading />;

  const openedToday = session ? new Date(session.openedAt).toDateString() === new Date().toDateString() : true;

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-8.5rem)] lg:min-h-[620px]">
      {/* top bar */}
      <div className="card flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Store size={17} style={{ color: "var(--brand)" }} />
          <span className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
            {settings.company.shopName}
          </span>
        </div>
        <span className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Cashier: <b style={{ color: "var(--text)" }}>{currentUser.name}</b>
        </span>
        <span className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium" style={{ background: session ? "var(--green-soft, rgba(22,163,74,0.12))" : "var(--red-soft, rgba(220,38,38,0.1))", color: session ? "var(--green)" : "var(--red)" }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
          {session ? `Session open · ${session.sessionNumber}` : "Session closed"}
        </span>
        {session && !openedToday && (
          <span className="text-[12px]" style={{ color: "var(--amber, #b45309)" }}>
            Opened {formatDateTime(session.openedAt)} — close it and start a fresh one.
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <GhostBtn disabled={!session || draft.lines.length === 0} onClick={() => setModal("hold")} title="Park this sale and serve someone else">
            <PauseCircle size={15} /> Hold
          </GhostBtn>
          <GhostBtn onClick={() => setModal("held")}>
            <CirclePause size={15} /> Held{pos.held.length > 0 && <span className="rounded-full px-1.5 text-[11px] font-bold text-white" style={{ background: "var(--brand)" }}>{pos.held.length}</span>}
          </GhostBtn>
          <GhostBtn disabled={draft.lines.length === 0} onClick={() => setModal("clear")}>
            <Plus size={15} /> New sale
          </GhostBtn>
          {session && (
            <>
              <GhostBtn onClick={() => setModal("cash")} title="Petty cash in / expense out">
                <ArrowDownUp size={15} /> Cash in/out
              </GhostBtn>
              <GhostBtn
                onClick={() => {
                  setClosing(session);
                  setModal("close");
                }}
              >
                <Lock size={15} /> Close session
              </GhostBtn>
            </>
          )}
          <div className="relative">
            <GhostBtn onClick={() => setPrefsOpen((o) => !o)} aria-expanded={prefsOpen} aria-label="POS settings">
              <Settings2 size={15} />
            </GhostBtn>
            {prefsOpen && (
              <div className="card absolute right-0 top-full z-30 mt-2 w-64 space-y-3 p-4 text-[13px] shadow-lg">
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                  This device
                </p>
                <label className="flex items-center justify-between gap-2" style={{ color: "var(--text)" }}>
                  Product view
                  <select value={view} onChange={(e) => setView(e.target.value as BrowserView)} className="focus-ring rounded-lg border px-2 py-1 text-[12.5px]" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                    <option value="grid">Grid</option>
                    <option value="list">List</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2" style={{ color: "var(--text)" }}>
                  Beep on scan
                  <input type="checkbox" checked={beepOn} onChange={(e) => setBeepOn(e.target.checked)} className="h-4 w-4" />
                </label>
                <p className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                  Barcode scan is {p.enableBarcodeScan ? "on" : "off"} · discount limit {pos.discountPolicy.cap === null ? "none" : `${pos.discountPolicy.cap}%`}
                </p>
                {can("settings", "view") && (
                  <Link href="/settings/pos" className="block text-[12.5px] underline" style={{ color: "var(--brand-strong)" }}>
                    All POS settings →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {!session ? (
        <div className="card mx-auto mt-6 w-full max-w-md space-y-4 p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "var(--brand-soft)", color: "var(--brand-strong)" }}>
              <Banknote size={22} />
            </div>
            <div>
              <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                Open a session to start selling
              </p>
              <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
                Sales, refunds and cash are counted against your drawer.
              </p>
            </div>
          </div>
          <OpenSessionFields
            cash={openingCash}
            setCash={setOpeningCash}
            error={openError}
            onEnter={() => {
              const res = pos.openSession(parseFloat(openingCash));
              if (!res.ok) return setOpenError(res.error);
              toast(`Session ${res.session.sessionNumber} opened`);
            }}
          />
          <PrimaryBtn
            className="w-full"
            onClick={() => {
              const res = pos.openSession(openingCash.trim() === "" ? NaN : parseFloat(openingCash));
              if (!res.ok) return setOpenError(res.error);
              toast(`Session ${res.session.sessionNumber} opened`);
            }}
          >
            Open session
          </PrimaryBtn>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section className="flex min-w-0 flex-col lg:min-h-0">
            <ProductBrowser
              products={products}
              draft={draft}
              scanEnabled={p.enableBarcodeScan}
              beepOnScan={beepOn}
              captureKeys={modal === null && p.enableBarcodeScan}
              view={view}
              onViewChange={setView}
              searchRef={searchRef}
              onAdd={cart.addVariant}
            />
          </section>

          <section className="card flex min-h-[420px] min-w-0 flex-col overflow-hidden lg:min-h-0">
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border-soft)" }}>
              <p className="flex items-center gap-2 text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                <ShoppingCart size={16} style={{ color: "var(--text-faint)" }} /> Cart
                <span className="text-[12px] font-normal" style={{ color: "var(--text-muted)" }}>
                  {totals.itemCount} item{totals.itemCount === 1 ? "" : "s"}
                </span>
              </p>
              {draft.lines.length > 0 && (
                <button onClick={() => setModal("clear")} className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  Clear
                </button>
              )}
            </div>
            <CartPanel
              rows={rows}
              totals={totals}
              cartDiscount={draft.cartDiscount}
              vatPercent={p.vatPercent}
              disabled={false}
              problems={resolved.problems}
              onQty={cart.setQty}
              onRemove={cart.remove}
              onLineDiscount={(id, t, v, base) => cart.commitDiscount({ kind: "line", variantId: id }, t, v, base)}
              onCartDiscount={(t, v, base) => cart.commitDiscount({ kind: "cart" }, t, v, base)}
            />
            <CustomerBlock customer={draft.customer} onChange={cart.setCustomer} directory={directory} requirePhone={p.requirePhoneForWarranty} />
            <div className="border-t p-3" style={{ borderColor: "var(--border-soft)" }}>
              <div className="grid grid-cols-2 gap-2">
                <PrimaryBtn className="py-2.5" disabled={!canCheckout} onClick={() => openCheckout("walk_in")}>
                  <span className="flex flex-col items-center gap-0.5">
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                      <Store size={15} /> Walk-in sale
                    </span>
                    <span className="flex items-center gap-1 text-[12px] font-normal opacity-90">
                      {money(totals.total)}
                      <span className="rounded px-1.5 py-0.5 text-[10.5px] font-medium" style={{ background: "rgba(255,255,255,0.22)" }}>F8</span>
                    </span>
                  </span>
                </PrimaryBtn>
                <button
                  disabled={!canCheckout}
                  onClick={() => openCheckout("delivery")}
                  className="focus-ring flex flex-col items-center justify-center gap-0.5 rounded-xl border py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: "var(--border)", color: "var(--text)" }}
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                    <Truck size={15} /> Delivery order
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    COD · to Orders
                  </span>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {modal === "checkout" && <CheckoutModal draft={draft} liveLines={resolved.lines} onCustomer={cart.setCustomer} onSaleSaved={cart.clear} onRestore={cart.replace} onClose={closeModal} initialSaleType={checkoutType} />}
      {modal === "hold" && (
        <HoldSaleModal
          onClose={closeModal}
          onHold={(name) => {
            const res = pos.holdSale(name, draft);
            if (!res.ok) return res.error;
            cart.clear();
            toast(`“${res.held.name}” is on hold`);
            closeModal();
            return null;
          }}
        />
      )}
      {modal === "held" && (
        <HeldSalesModal
          cartHasItems={draft.lines.length > 0}
          onClose={closeModal}
          onLoad={(h) => {
            cart.loadHeld(h);
            pos.removeHeld(h.id);
            closeModal();
          }}
        />
      )}
      {modal === "close" && closing && <CloseSessionModal session={closing} onClose={closeModal} />}
      {modal === "cash" && session && <CashMovementModal session={session} onClose={closeModal} />}
      <ConfirmDialog
        open={modal === "clear"}
        title="Clear the cart?"
        message="This removes every item from the current sale. Use Hold if you want to come back to it."
        confirmLabel="Clear cart"
        onConfirm={() => {
          cart.clear();
          closeModal();
        }}
        onCancel={closeModal}
      />
    </div>
  );
}
