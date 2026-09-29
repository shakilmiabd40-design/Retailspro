export type ProductStatus = "active" | "inactive";
export type StockStatus = "in-stock" | "low-stock" | "out-of-stock";
export type Gender = "Men" | "Women" | "Unisex" | "Kids";

export interface Variant {
  id: string;
  color: string;
  size: string;
  sku: string;
  barcode: string;
  cost: number;
  price: number;
  stock: number;
  /** Units held against Pending/Processing/In Transit orders — not sellable
   * again until released (order cancelled) or returned (return received). */
  reserved: number;
  status: ProductStatus;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  brand: string;
  category: string;
  description?: string;
  status: ProductStatus;
  imageUrl?: string;
  costPrice: number;
  sellingPrice: number;
  discountPrice?: number;
  gender?: Gender;
  shoeType?: string;
  material?: string;
  colors: string[];
  sizes: string[];
  variants: Variant[];
  createdAt: string;
}

export type StockUpdateMode = "set" | "add" | "remove";
