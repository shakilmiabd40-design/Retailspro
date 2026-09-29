"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Image as ImageIcon, Plus, X, Wand2, Trash2 } from "lucide-react";
import { useProducts } from "@/lib/products/store";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ProductStatusBadge } from "@/components/products/status-badges";
import { generateVariants, slugSku, formatTaka } from "@/lib/products/utils";
import { useSettings } from "@/lib/settings/store";
import { useAccess } from "@/lib/settings/access";
import { buildSku, productLevelTemplate } from "@/lib/settings/sku";
import { buildBarcode } from "@/lib/settings/barcode";
import { takeNumberOrFallback } from "@/lib/persist/numbers";
import type { Gender, Product, ProductStatus, Variant } from "@/lib/products/types";


function ChipInput({
  label,
  values,
  onChange,
  suggestions,
  placeholder,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  suggestions: string[];
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (values.some((v) => v.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, value]);
    setDraft("");
  }

  const remainingSuggestions = suggestions.filter((s) => !values.includes(s));

  return (
    <div>
      <label className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-xl border p-2"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        {values.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            }
          }}
          placeholder={placeholder}
          className="min-w-[120px] flex-1 bg-transparent px-1 py-1 text-[13px] outline-none"
          style={{ color: "var(--text)" }}
        />
      </div>
      {remainingSuggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {remainingSuggestions.slice(0, 8).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => commit(s)}
              className="focus-ring rounded-full border px-2.5 py-0.5 text-[11.5px]"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
        {required && <span style={{ color: "var(--red)" }}> *</span>}
      </span>
      {children}
    </label>
  );
}

const inputStyle = { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" };
const inputClass = "focus-ring w-full rounded-xl border px-3 py-2 text-[13px]";

export function ProductForm({ initialProduct }: { initialProduct?: Product }) {
  const isEdit = !!initialProduct;
  const router = useRouter();
  const { addProduct, updateProduct, catalog, addCatalogItem, products } = useProducts();
  const { settings } = useSettings();
  const { can } = useAccess();
  // Cost price is gated by products:financial on the server too (stripped from /api/load, preserved on save).
  // Hide the inputs for roles that can't see cost so they aren't shown a misleading, uneditable ৳0 field.
  const canSeeCost = can("products", "financial");
  const GENDERS = [...new Set([...settings.products.genders, ...(initialProduct?.gender ? [initialProduct.gender] : [])])];
  const showToast = useToast();

  const [name, setName] = useState(initialProduct?.name ?? "");
  const [sku, setSku] = useState(initialProduct?.sku ?? "");
  const [barcode, setBarcode] = useState(initialProduct?.barcode ?? "");
  const [brand, setBrand] = useState(initialProduct?.brand ?? "");
  const [category, setCategory] = useState(initialProduct?.category ?? "");
  const [description, setDescription] = useState(initialProduct?.description ?? "");
  const [status, setStatus] = useState<ProductStatus>(initialProduct?.status ?? "active");
  const [imageUrl, setImageUrl] = useState(initialProduct?.imageUrl ?? "");
  const [imageError, setImageError] = useState(false);

  const [costPrice, setCostPrice] = useState(initialProduct?.costPrice ?? 0);
  const [sellingPrice, setSellingPrice] = useState(initialProduct?.sellingPrice ?? 0);
  const [discountPrice, setDiscountPrice] = useState<number | undefined>(initialProduct?.discountPrice);

  const [gender, setGender] = useState<Gender | "">(initialProduct?.gender ?? "");
  const [shoeType, setShoeType] = useState(initialProduct?.shoeType ?? "");
  const [material, setMaterial] = useState(initialProduct?.material ?? "");
  const [colors, setColors] = useState<string[]>(initialProduct?.colors ?? []);
  const [sizes, setSizes] = useState<string[]>(initialProduct?.sizes ?? []);

  const [variants, setVariants] = useState<Variant[]>(initialProduct?.variants ?? []);
  const [removeVariant, setRemoveVariant] = useState<Variant | null>(null);

  const skuError = useMemo(() => {
    if (!sku.trim()) return "";
    const clash = products.find((p) => p.sku.toLowerCase() === sku.trim().toLowerCase() && p.id !== initialProduct?.id);
    return clash ? "This SKU is already used by another product." : "";
  }, [sku, products, initialProduct?.id]);

  /** Fills a blank barcode on every newly-generated variant, respecting Product Settings → SKU & Barcode. Leaves variants that already have a barcode (existing ones, or manual entries) untouched. */
  function withAutoBarcodes(list: Variant[]): Variant[] {
    if (!settings.products.barcodeAutoGenerate) return list;
    return list.map((v) => (v.barcode ? v : { ...v, barcode: buildBarcode(settings.products, takeNumberOrFallback("barcode"), v.sku) }));
  }

  function handleGenerateVariants() {
    if (!colors.length || !sizes.length) {
      showToast("Add at least one color and one size first", "error");
      return;
    }
    const next = withAutoBarcodes(generateVariants(colors, sizes, { sku, cost: costPrice, price: sellingPrice }, variants, settings.products.skuFormat));
    setVariants(next);
    showToast(`Generated ${next.length} variant${next.length > 1 ? "s" : ""}`);
  }

  function updateVariantField<K extends keyof Variant>(id: string, key: K, value: Variant[K]) {
    setVariants((prev) => prev.map((v) => (v.id === id ? { ...v, [key]: value } : v)));
  }

  function confirmRemoveVariant() {
    if (!removeVariant) return;
    setVariants((prev) => prev.filter((v) => v.id !== removeVariant.id));
    setColors((prev) => {
      const stillUsed = variants.some((v) => v.color === removeVariant.color && v.id !== removeVariant.id);
      return stillUsed ? prev : prev.filter((c) => c !== removeVariant.color) || prev;
    });
    setRemoveVariant(null);
    showToast("Variant removed");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) {
      showToast("Product name and SKU are required", "error");
      return;
    }
    if (skuError) {
      showToast(skuError, "error");
      return;
    }

    const finalVariants = withAutoBarcodes(
      variants.length
        ? variants
        : generateVariants(
            colors.length ? colors : ["Default"],
            sizes.length ? sizes : ["OS"],
            { sku, cost: costPrice, price: sellingPrice },
            [],
            settings.products.skuFormat
          )
    );

    if (brand && !catalog.brands.includes(brand)) addCatalogItem("brands", brand);
    if (category && !catalog.categories.includes(category)) addCatalogItem("categories", category);

    if (isEdit && initialProduct) {
      updateProduct(initialProduct.id, (p) => ({
        ...p,
        name,
        sku,
        barcode,
        brand,
        category,
        description,
        status,
        imageUrl,
        costPrice,
        sellingPrice,
        discountPrice,
        gender: gender || undefined,
        shoeType,
        material,
        colors,
        sizes,
        variants: finalVariants,
      }));
      showToast("Product updated");
      router.push(`/products/${initialProduct.id}`);
    } else {
      const id = crypto.randomUUID();
      const product: Product = {
        id,
        name,
        sku,
        barcode,
        brand,
        category,
        description,
        status,
        imageUrl,
        costPrice,
        sellingPrice,
        discountPrice,
        gender: gender || undefined,
        shoeType,
        material,
        colors,
        sizes,
        variants: finalVariants,
        createdAt: new Date().toISOString(),
      };
      addProduct(product);
      showToast("Product created");
      router.push(`/products/${id}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold" style={{ color: "var(--text)" }}>
            {isEdit ? "Edit Product" : "Add Product"}
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {isEdit ? `Editing ${initialProduct?.name}` : "Create a new shoe product with variants and stock."}
          </p>
        </div>
        <button
          type="submit"
          className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white"
          style={{ background: "var(--brand)" }}
        >
          {isEdit ? "Save Changes" : "Save Product"}
        </button>
      </div>

      {/* Basic Information */}
      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Basic Information
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Product Name" required>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                // Settings → Product: SKU auto-generation + template (product-level part).
                if (!isEdit && !sku && settings.products.skuAutoGenerate) {
                  const prefix = productLevelTemplate(settings.products.skuFormat);
                  setSku(buildSku(prefix, { brand, product: e.target.value }) || slugSku(e.target.value));
                }
              }}
              placeholder="e.g. Nike Air Max 270"
              className={inputClass}
              style={inputStyle}
            />
          </Field>
          <Field label="Product SKU / Code" required>
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              placeholder="e.g. NK-AM270"
              className={inputClass}
              style={inputStyle}
            />
            {skuError && (
              <p className="mt-1 text-[11.5px]" style={{ color: "var(--red)" }}>
                {skuError}
              </p>
            )}
          </Field>
          <Field label="Barcode">
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              placeholder="e.g. 8801234567890"
              className={inputClass}
              style={inputStyle}
            />
          </Field>
          <Field label="Brand">
            <input
              list="brand-suggestions"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g. Nike"
              className={inputClass}
              style={inputStyle}
            />
            <datalist id="brand-suggestions">
              {catalog.brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field label="Category">
            <input
              list="category-suggestions"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Sneakers"
              className={inputClass}
              style={inputStyle}
            />
            <datalist id="category-suggestions">
              {catalog.categories.filter((c) => settings.products.categoryMeta[c]?.status !== "inactive").map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Product Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductStatus)}
              className={inputClass}
              style={inputStyle}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="Short product description..."
            className={inputClass}
            style={inputStyle}
          />
        </Field>
      </section>

      {/* Product Image */}
      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Product Image
        </p>
        <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          Paste an image URL instead of uploading a file — one image is enough for inventory purposes.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div
            className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-xl border"
            style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
          >
            {imageUrl && !imageError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="Product preview"
                className="h-full w-full object-cover"
                onError={() => setImageError(true)}
                onLoad={() => setImageError(false)}
              />
            ) : (
              <ImageIcon size={26} style={{ color: "var(--text-faint)" }} />
            )}
          </div>
          <div className="flex-1 space-y-2">
            <Field label="Image URL">
              <input
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  setImageError(false);
                }}
                placeholder="https://example.com/shoe.jpg"
                className={inputClass}
                style={inputStyle}
              />
            </Field>
            {imageUrl && imageError && (
              <p className="text-[11.5px]" style={{ color: "var(--red)" }}>
                Couldn&apos;t load that image — double check the URL.
              </p>
            )}
            {imageUrl && (
              <button
                type="button"
                onClick={() => setImageUrl("")}
                className="text-[12px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Remove image
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Pricing
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {canSeeCost && (
            <Field label="Cost Price (৳)" required>
              <input
                type="number"
                min={0}
                value={costPrice}
                onChange={(e) => setCostPrice(Number(e.target.value))}
                className={inputClass}
                style={inputStyle}
              />
            </Field>
          )}
          <Field label="Selling Price (৳)" required>
            <input
              type="number"
              min={0}
              value={sellingPrice}
              onChange={(e) => setSellingPrice(Number(e.target.value))}
              className={inputClass}
              style={inputStyle}
            />
          </Field>
          <Field label="Discount Price (৳) — optional">
            <input
              type="number"
              min={0}
              value={discountPrice ?? ""}
              onChange={(e) => setDiscountPrice(e.target.value ? Number(e.target.value) : undefined)}
              className={inputClass}
              style={inputStyle}
            />
          </Field>
        </div>
      </section>

      {/* Shoe Attributes */}
      <section className="card space-y-4 p-5">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Shoe Attributes
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Gender">
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender | "")}
              className={inputClass}
              style={inputStyle}
            >
              <option value="">Select gender</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Shoe Type">
            <input
              value={shoeType}
              onChange={(e) => setShoeType(e.target.value)}
              placeholder="e.g. Running, Casual, Boots"
              list="shoe-type-suggestions"
              className={inputClass}
              style={inputStyle}
            />
            <datalist id="shoe-type-suggestions">
              {settings.products.shoeTypes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="Material — optional">
            <input
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder="e.g. Mesh / Synthetic"
              list="material-suggestions"
              className={inputClass}
              style={inputStyle}
            />
            <datalist id="material-suggestions">
              {settings.products.materials.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ChipInput
            label="Colors"
            values={colors}
            onChange={setColors}
            suggestions={catalog.colors}
            placeholder="Type a color and press Enter"
          />
          <ChipInput
            label="Sizes"
            values={sizes}
            onChange={setSizes}
            suggestions={catalog.sizes}
            placeholder="Type a size and press Enter"
          />
        </div>
      </section>

      {/* Variants */}
      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
              Product Variants
            </p>
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              Select colors and sizes above, then generate the variant matrix. Edit SKU, price or stock per variant.
            </p>
          </div>
          <button
            type="button"
            onClick={handleGenerateVariants}
            className="focus-ring flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium"
            style={{ borderColor: "var(--border)", color: "var(--brand)" }}
          >
            <Wand2 size={15} />
            Generate Variants
          </button>
        </div>

        {variants.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border)" }}>
            <table className="w-full min-w-[760px] border-collapse text-left text-[12.5px]">
              <thead>
                <tr style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                  <th className="px-3 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Barcode</th>
                  {canSeeCost && <th className="px-3 py-2 font-medium">Cost</th>}
                  <th className="px-3 py-2 font-medium">Price</th>
                  <th className="px-3 py-2 font-medium">Stock</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => (
                  <tr key={v.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: "var(--text)" }}>
                      {v.color} / {v.size}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={v.sku}
                        onChange={(e) => updateVariantField(v.id, "sku", e.target.value)}
                        className="w-32 rounded-lg border px-2 py-1"
                        style={inputStyle}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        value={v.barcode}
                        onChange={(e) => updateVariantField(v.id, "barcode", e.target.value)}
                        className="w-28 rounded-lg border px-2 py-1"
                        style={inputStyle}
                      />
                    </td>
                    {canSeeCost && (
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={0}
                          value={v.cost}
                          onChange={(e) => updateVariantField(v.id, "cost", Number(e.target.value))}
                          className="w-20 rounded-lg border px-2 py-1"
                          style={inputStyle}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={v.price}
                        onChange={(e) => updateVariantField(v.id, "price", Number(e.target.value))}
                        className="w-20 rounded-lg border px-2 py-1"
                        style={inputStyle}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        value={v.stock}
                        onChange={(e) => updateVariantField(v.id, "stock", Number(e.target.value))}
                        className="w-20 rounded-lg border px-2 py-1"
                        style={inputStyle}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={v.status}
                        onChange={(e) => updateVariantField(v.id, "status", e.target.value as ProductStatus)}
                        className="rounded-lg border px-2 py-1"
                        style={inputStyle}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => (v.stock > 0 ? setRemoveVariant(v) : setVariants((prev) => prev.filter((x) => x.id !== v.id)))}
                        className="focus-ring rounded-md p-1.5"
                        style={{ color: "var(--text-faint)" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-10"
            style={{ borderColor: "var(--border)" }}
          >
            <Plus size={20} style={{ color: "var(--text-faint)" }} />
            <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
              No variants yet — add colors and sizes, then click &quot;Generate Variants&quot;.
            </p>
          </div>
        )}
      </section>

      {/* Preview summary */}
      <section className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl"
            style={{ background: "var(--surface-2)" }}
          >
            {imageUrl && !imageError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <ImageIcon size={18} style={{ color: "var(--text-faint)" }} />
            )}
          </div>
          <div>
            <p className="text-[13.5px] font-medium" style={{ color: "var(--text)" }}>
              {name || "Untitled product"}
            </p>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              {sellingPrice ? formatTaka(sellingPrice, 2) : "—"} · {variants.length} variant
              {variants.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <ProductStatusBadge status={status} />
      </section>

      <ConfirmDialog
        open={!!removeVariant}
        title="Remove variant"
        message={`"${removeVariant?.color} / ${removeVariant?.size}" still has ${removeVariant?.stock} in stock. Removing it will discard that stock record. Continue?`}
        confirmLabel="Remove"
        onCancel={() => setRemoveVariant(null)}
        onConfirm={confirmRemoveVariant}
      />
    </form>
  );
}
