import Link from "next/link";
import { ChevronRight, Image as ImageIcon } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { ProductSalesRow } from "@/lib/types";

export function ProductSalesTable({ data }: { data: ProductSalesRow[] }) {
  return (
    <div className="card p-5">
      <div className="mb-4">
        <p className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          Product Sales
        </p>
        <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
          Top products by units ordered · excl. cancelled &amp; refused
        </p>
      </div>

      {data.length === 0 ? (
        <p className="py-10 text-center text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          No product sales yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>
                <th className="pb-2 font-medium">Item</th>
                <th className="pb-2 font-medium">Stock</th>
                <th className="pb-2 font-medium">Old Price</th>
                <th className="pb-2 font-medium">Discount</th>
                <th className="pb-2 font-medium">Price</th>
                <th className="pb-2 font-medium">Items Sold</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                  <td className="py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: "var(--surface-2)" }}>
                        <ImageIcon size={14} style={{ color: "var(--text-faint)" }} />
                        {p.imageUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.imageUrl}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                          />
                        )}
                      </span>
                      <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                        {p.name}
                        {!p.exists && (
                          <span className="ml-1.5 text-[11px] font-normal" style={{ color: "var(--text-faint)" }}>
                            (deleted)
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
                    {p.stock ?? "—"}
                  </td>
                  <td className="py-2.5 text-[13px]" style={{ color: "var(--text-faint)" }}>
                    {p.oldPrice !== null ? <span className="line-through">{formatCurrency(p.oldPrice, { decimals: 2 })}</span> : "—"}
                  </td>
                  <td className="py-2.5 text-[13px] font-medium" style={{ color: p.discountPct ? "var(--green)" : "var(--text-faint)" }}>
                    {p.discountPct ? `${p.discountPct}%` : "—"}
                  </td>
                  <td className="py-2.5 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                    {p.exists ? formatCurrency(p.salePrice, { decimals: 2 }) : "—"}
                  </td>
                  <td className="py-2.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
                    {p.itemsSold}
                  </td>
                  <td className="py-2.5 text-right">
                    {p.exists && (
                      <Link href={`/products/${p.id}`} aria-label={`View ${p.name}`} className="focus-ring inline-flex rounded-md p-1" style={{ color: "var(--text-faint)" }}>
                        <ChevronRight size={15} />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
