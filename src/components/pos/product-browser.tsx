"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { LayoutGrid, List, Minus, Package, Plus, ScanBarcode, Search } from "lucide-react";
import clsx from "clsx";
import type { Product, Variant } from "@/lib/products/types";
import { availableStock } from "@/lib/products/utils";
import type { SaleDraft } from "@/lib/pos/types";
import { availableToAdd } from "@/lib/pos/use-cart";
import { useToast } from "@/components/toast";
import { Chip, PosModal, PrimaryBtn, GhostBtn, money } from "./ui";

export type BrowserView = "grid" | "list";

interface Props {
  products: Product[];
  draft: SaleDraft;
  scanEnabled: boolean;
  beepOnScan: boolean;
  /** Keys typed with nothing focused are routed to the search box (so a scanner works without clicking). */
  captureKeys: boolean;
  view: BrowserView;
  onViewChange: (v: BrowserView) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  onAdd: (product: Product, variant: Variant, qty: number) => void;
}

const activeVariants = (p: Product) => p.variants.filter((v) => v.status === "active");

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1100;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
    osc.onended = () => ctx.close();
  } catch {
    /* no audio — fine */
  }
}

export function ProductBrowser({ products, draft, scanEnabled, beepOnScan, captureKeys, view, onViewChange, searchRef, onAdd }: Props) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("All");
  const [picker, setPicker] = useState<Product | null>(null);
  const [limit, setLimit] = useState(48);

  const sellable = useMemo(() => products.filter((p) => p.status === "active" && activeVariants(p).length > 0), [products]);
  const categories = useMemo(() => ["All", ...[...new Set(sellable.map((p) => p.category).filter(Boolean))].sort()], [sellable]);
  const index = useMemo(
    () =>
      new Map(
        sellable.map((p) => [p.id, [p.name, p.sku, p.brand, p.category, p.barcode, ...activeVariants(p).flatMap((v) => [v.sku, v.barcode])].filter(Boolean).join(" ").toLowerCase()] as const)
      ),
    [sellable]
  );

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sellable.filter((p) => (category === "All" || p.category === category) && (!s || (index.get(p.id) ?? "").includes(s)));
  }, [sellable, q, category, index]);

  // Scanner keystrokes with nothing focused → the search box.
  useEffect(() => {
    if (!captureKeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      const el = document.activeElement;
      if (el && el !== document.body && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [captureKeys, searchRef]);

  const totalAvail = (p: Product) => activeVariants(p).reduce((s, v) => s + Math.max(0, availableStock(v) - (draft.lines.find((l) => l.variantId === v.id)?.qty ?? 0)), 0);

  const addQuick = (p: Product, v: Variant) => {
    if (availableToAdd(draft, v) < 1) {
      toast(`${p.name} (${v.color}/${v.size}) — no more available`, "error");
      return false;
    }
    onAdd(p, v, 1);
    return true;
  };

  const open = (p: Product) => {
    const vs = activeVariants(p);
    if (vs.length === 1) addQuick(p, vs[0]);
    else setPicker(p);
  };

  const onEnter = () => {
    const s = q.trim().toLowerCase();
    if (!s) return;
    if (scanEnabled) {
      for (const p of sellable) {
        const v = activeVariants(p).find((x) => x.barcode?.toLowerCase() === s || x.sku.toLowerCase() === s);
        if (v) {
          if (addQuick(p, v) && beepOnScan) beep();
          setQ("");
          return;
        }
      }
      const byProduct = sellable.find((p) => p.barcode?.toLowerCase() === s || p.sku.toLowerCase() === s);
      if (byProduct) {
        open(byProduct);
        setQ("");
        return;
      }
    }
    if (results.length === 1) {
      open(results[0]);
      setQ("");
    } else if (results.length === 0) toast("No product matches that", "error");
  };

  const priceLabel = (p: Product) => {
    const prices = activeVariants(p).map((v) => v.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    return lo === hi ? money(lo) : `${money(lo)} – ${money(hi)}`;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-faint)" }} />
          <input
            ref={searchRef}
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(48);
            }}
            onKeyDown={(e) => e.key === "Enter" && onEnter()}
            placeholder={scanEnabled ? "Scan barcode or search name / SKU…  (F2)" : "Search name / SKU…  (F2)"}
            className="focus-ring w-full rounded-xl border py-2.5 pl-9 pr-9 text-[14px]"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
            aria-label="Search products"
          />
          {scanEnabled && <ScanBarcode size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-faint)" }} />}
        </div>
        <div className="flex rounded-xl border p-0.5" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          {(["grid", "list"] as const).map((v) => (
            <button
              key={v}
              onClick={() => onViewChange(v)}
              aria-label={`${v} view`}
              aria-pressed={view === v}
              className="focus-ring rounded-lg p-2"
              style={{ background: view === v ? "var(--brand-soft)" : "transparent", color: view === v ? "var(--brand-strong)" : "var(--text-faint)" }}
            >
              {v === "grid" ? <LayoutGrid size={15} /> : <List size={15} />}
            </button>
          ))}
        </div>
      </div>

      {categories.length > 2 && (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>
      )}

      {/* Below lg the cart sits underneath, so before a search only ~2 products are visible (the rest scroll);
          once you type, every match is shown in a taller scroller. From lg up the list fills the column. */}
      <div
        className={clsx(
          "min-h-0 overflow-y-auto pr-1 lg:max-h-none lg:flex-1",
          q.trim() ? "max-h-[60vh]" : view === "grid" ? "max-h-[214px]" : "max-h-[150px]"
        )}
      >
        {results.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-1 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            <Package size={22} />
            {sellable.length === 0 ? "No active products yet — add some under Products." : "No products match."}
          </div>
        ) : view === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4">
            {results.slice(0, limit).map((p) => {
              const avail = totalAvail(p);
              return (
                <button
                  key={p.id}
                  disabled={avail < 1}
                  onClick={() => open(p)}
                  className={clsx("focus-ring card flex flex-col overflow-hidden text-left transition-shadow hover:shadow-md", avail < 1 && "cursor-not-allowed opacity-50")}
                >
                  <div className="flex h-24 items-center justify-center" style={{ background: "var(--surface-2)" }}>
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Package size={26} style={{ color: "var(--text-faint)" }} />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-2.5">
                    <p className="line-clamp-2 text-[12.5px] font-semibold leading-snug" style={{ color: "var(--text)" }}>
                      {p.name}
                    </p>
                    <p className="text-[13px] font-bold" style={{ color: "var(--brand-strong)" }}>
                      {priceLabel(p)}
                    </p>
                    <p className="text-[11.5px]" style={{ color: avail < 1 ? "var(--red)" : avail <= 3 ? "var(--amber, #b45309)" : "var(--text-muted)" }}>
                      {avail < 1 ? "Out of stock" : `Available: ${avail}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="card divide-y" style={{ borderColor: "var(--border-soft)" }}>
            {results.slice(0, limit).map((p) => {
              const avail = totalAvail(p);
              return (
                <button
                  key={p.id}
                  disabled={avail < 1}
                  onClick={() => open(p)}
                  className="focus-ring flex w-full items-center gap-3 px-3 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ borderColor: "var(--border-soft)" }}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: "var(--surface-2)" }}>
                    {p.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Package size={16} style={{ color: "var(--text-faint)" }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                      {p.name}
                    </p>
                    <p className="truncate text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                      {p.sku} · {p.category}
                    </p>
                  </div>
                  <span className="text-[12px]" style={{ color: avail < 1 ? "var(--red)" : "var(--text-muted)" }}>
                    {avail < 1 ? "Out of stock" : `Available: ${avail}`}
                  </span>
                  <span className="w-28 text-right text-[13px] font-bold" style={{ color: "var(--brand-strong)" }}>
                    {priceLabel(p)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {results.length > limit && (
          <div className="py-3 text-center">
            <GhostBtn onClick={() => setLimit((l) => l + 48)} className="mx-auto">
              Show more ({results.length - limit} left)
            </GhostBtn>
          </div>
        )}
      </div>

      {picker && (
        <VariantPicker
          product={picker}
          draft={draft}
          onClose={() => {
            setPicker(null);
            searchRef.current?.focus();
          }}
          onAdd={(v, qty) => {
            onAdd(picker, v, qty);
            setPicker(null);
            searchRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

/** Color → Size → Qty. Sizes with nothing left are shown but can't be picked. */
function VariantPicker({ product, draft, onClose, onAdd }: { product: Product; draft: SaleDraft; onClose: () => void; onAdd: (v: Variant, qty: number) => void }) {
  const variants = activeVariants(product);
  const colors = useMemo(() => [...new Set(variants.map((v) => v.color))], [variants]);
  const left = (v: Variant) => availableToAdd(draft, v);
  const colorHasStock = (c: string) => variants.some((v) => v.color === c && left(v) > 0);

  const [color, setColor] = useState<string>(() => (colors.length === 1 ? colors[0] : (colors.find(colorHasStock) ?? colors[0])));
  const sizes = variants.filter((v) => v.color === color);
  const [variantId, setVariantId] = useState<string | null>(() => {
    const first = sizes.filter((v) => left(v) > 0);
    return first.length === 1 ? first[0].id : null;
  });
  const [qty, setQty] = useState(1);

  const chosen = variants.find((v) => v.id === variantId && v.color === color) ?? null;
  const max = chosen ? left(chosen) : 0;
  const q = Math.min(Math.max(1, qty), Math.max(1, max));

  return (
    <PosModal
      open
      title={product.name}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn disabled={!chosen || max < 1} onClick={() => chosen && onAdd(chosen, q)}>
            Add to cart
          </PrimaryBtn>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (chosen && max >= 1) onAdd(chosen, q);
        }}
        className="space-y-4"
      >
        <div>
          <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
            1 · Color
          </p>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => (
              <Chip
                key={c}
                active={c === color}
                disabled={!colorHasStock(c)}
                onClick={() => {
                  setColor(c);
                  setVariantId(null);
                  setQty(1);
                }}
              >
                {c}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
            2 · Size
          </p>
          <div className="flex flex-wrap gap-2">
            {sizes.map((v) => (
              <Chip
                key={v.id}
                active={v.id === variantId}
                disabled={left(v) < 1}
                title={left(v) < 1 ? "Out of stock" : `${left(v)} available`}
                onClick={() => {
                  setVariantId(v.id);
                  setQty(1);
                }}
              >
                {v.size}{" "}
                <span className="ml-1 text-[11px] opacity-70">{left(v) < 1 ? "out" : `(${left(v)} left)`}</span>
              </Chip>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border px-3 py-2.5" style={{ borderColor: "var(--border-soft)", background: "var(--surface-2)" }}>
          <div>
            <p className="text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
              3 · Qty
            </p>
            <p className="text-[12px]" style={{ color: chosen && max < 1 ? "var(--red)" : "var(--text-faint)" }}>
              {chosen ? `Available: ${max}` : "Pick a size"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="Less" disabled={!chosen || q <= 1} onClick={() => setQty(q - 1)} className="focus-ring rounded-lg border p-1.5 disabled:opacity-40" style={{ borderColor: "var(--border)" }}>
              <Minus size={14} />
            </button>
            <span className="w-9 text-center text-[14px] font-semibold tabular-nums" style={{ color: "var(--text)" }}>
              {q}
            </span>
            <button type="button" aria-label="More" disabled={!chosen || q >= max} onClick={() => setQty(q + 1)} className="focus-ring rounded-lg border p-1.5 disabled:opacity-40" style={{ borderColor: "var(--border)" }}>
              <Plus size={14} />
            </button>
          </div>
        </div>
        {chosen && (
          <p className="text-right text-[13px]" style={{ color: "var(--text-muted)" }}>
            {q} × {money(chosen.price)} = <b style={{ color: "var(--text)" }}>{money(chosen.price * q)}</b>
          </p>
        )}
        <button type="submit" className="hidden" />
      </form>
    </PosModal>
  );
}
