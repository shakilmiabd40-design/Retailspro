import type { Product } from "./types";
import { generateVariants } from "./utils";

function buildProduct(input: {
  id: string;
  name: string;
  sku: string;
  brand: string;
  category: string;
  gender: Product["gender"];
  shoeType: string;
  material?: string;
  costPrice: number;
  sellingPrice: number;
  discountPrice?: number;
  imageUrl?: string;
  colors: string[];
  sizes: string[];
  status: Product["status"];
  stockByColorSize?: Record<string, number>;
  createdAt: string;
}): Product {
  const variants = generateVariants(input.colors, input.sizes, {
    sku: input.sku,
    cost: input.costPrice,
    price: input.sellingPrice,
  });

  if (input.stockByColorSize) {
    for (const v of variants) {
      const key = `${v.color}/${v.size}`;
      if (key in input.stockByColorSize) v.stock = input.stockByColorSize[key];
    }
  }

  return {
    id: input.id,
    name: input.name,
    sku: input.sku,
    barcode: `${880000000000 + Math.floor(Math.random() * 999999)}`,
    brand: input.brand,
    category: input.category,
    description: "",
    status: input.status,
    imageUrl: input.imageUrl,
    costPrice: input.costPrice,
    sellingPrice: input.sellingPrice,
    discountPrice: input.discountPrice,
    gender: input.gender,
    shoeType: input.shoeType,
    material: input.material,
    colors: input.colors,
    sizes: input.sizes,
    variants,
    createdAt: input.createdAt,
  };
}

export const SEED_PRODUCTS: Product[] = [
  buildProduct({
    id: "p-nike-am270",
    name: "Nike Air Max 270",
    sku: "NK-AM270",
    brand: "Nike",
    category: "Sneakers",
    gender: "Men",
    shoeType: "Running",
    material: "Mesh / Synthetic",
    costPrice: 5500,
    sellingPrice: 7500,
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600",
    colors: ["Black", "White", "Red"],
    sizes: ["39", "40", "41", "42", "43"],
    status: "active",
    stockByColorSize: {
      "Black/39": 10, "Black/40": 12, "Black/41": 8, "Black/42": 5, "Black/43": 4,
      "White/39": 5, "White/40": 8, "White/41": 12, "White/42": 7, "White/43": 3,
      "Red/39": 0, "Red/40": 4, "Red/41": 6, "Red/42": 3, "Red/43": 2,
    },
    createdAt: "2026-07-12T10:00:00.000Z",
  }),
  buildProduct({
    id: "p-adidas-ultraboost",
    name: "Adidas Ultraboost 22",
    sku: "AD-UB22",
    brand: "Adidas",
    category: "Sneakers",
    gender: "Women",
    shoeType: "Running",
    material: "Primeknit",
    costPrice: 6200,
    sellingPrice: 8900,
    imageUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=600",
    colors: ["Black", "Grey"],
    sizes: ["36", "37", "38", "39"],
    status: "active",
    stockByColorSize: {
      "Black/36": 2, "Black/37": 1, "Black/38": 0, "Black/39": 3,
      "Grey/36": 14, "Grey/37": 18, "Grey/38": 9, "Grey/39": 6,
    },
    createdAt: "2026-08-01T10:00:00.000Z",
  }),
  buildProduct({
    id: "p-vans-oldskool",
    name: "Vans Old Skool",
    sku: "VN-OS",
    brand: "Vans",
    category: "Casual",
    gender: "Unisex",
    shoeType: "Skate",
    material: "Canvas / Suede",
    costPrice: 3200,
    sellingPrice: 4500,
    discountPrice: 3999,
    imageUrl: "https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77?w=600",
    colors: ["Black/White"],
    sizes: ["38", "39", "40", "41", "42"],
    status: "inactive",
    stockByColorSize: {
      "Black/White/38": 0, "Black/White/39": 0, "Black/White/40": 0,
      "Black/White/41": 0, "Black/White/42": 0,
    },
    createdAt: "2026-05-20T10:00:00.000Z",
  }),
  buildProduct({
    id: "p-puma-rsx",
    name: "Puma RS-X",
    sku: "PM-RSX",
    brand: "Puma",
    category: "Sneakers",
    gender: "Kids",
    shoeType: "Lifestyle",
    costPrice: 3800,
    sellingPrice: 5200,
    imageUrl: "https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=600",
    colors: ["Blue", "Yellow"],
    sizes: ["30", "31", "32"],
    status: "active",
    stockByColorSize: {
      "Blue/30": 20, "Blue/31": 22, "Blue/32": 15,
      "Yellow/30": 9, "Yellow/31": 11, "Yellow/32": 7,
    },
    createdAt: "2026-08-20T10:00:00.000Z",
  }),
];
