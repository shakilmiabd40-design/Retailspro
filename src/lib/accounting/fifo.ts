import type { InventoryCostLayer } from "./gl-types";

export interface FifoConsumption {
  layers: InventoryCostLayer[];
  totalCost: number;
  unitCost: number;
  allocations: { layerId: string; qty: number; unitCost: number; totalCost: number }[];
  /** Quantity that had no historical receipt layer and was valued using the configured fallback. */
  estimatedQty: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Consume the oldest available cost layers first. Inputs are not mutated. */
export function consumeFifo(
  source: InventoryCostLayer[],
  qty: number,
  fallbackUnitCost = 0,
): FifoConsumption {
  if (!Number.isInteger(qty) || qty < 0) throw new Error("FIFO quantity must be a whole number of 0 or more.");
  if (!Number.isFinite(fallbackUnitCost) || fallbackUnitCost < 0) throw new Error("Fallback cost must be 0 or more.");

  const layers = source.map((layer) => ({ ...layer }));
  const ordered = layers
    .filter((layer) => layer.remainingQty > 0)
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
  let remaining = qty;
  let totalCost = 0;
  const allocations: FifoConsumption["allocations"] = [];

  for (const layer of ordered) {
    if (!remaining) break;
    const taken = Math.min(remaining, layer.remainingQty);
    const value = round2(taken * layer.unitCost);
    layer.remainingQty -= taken;
    remaining -= taken;
    totalCost += value;
    allocations.push({ layerId: layer.id, qty: taken, unitCost: layer.unitCost, totalCost: value });
  }

  const estimatedQty = remaining;
  if (remaining > 0) {
    const value = round2(remaining * fallbackUnitCost);
    totalCost += value;
    allocations.push({ layerId: "estimated-current-cost", qty: remaining, unitCost: fallbackUnitCost, totalCost: value });
  }

  totalCost = round2(totalCost);
  return { layers, totalCost, unitCost: qty ? round2(totalCost / qty) : 0, allocations, estimatedQty };
}

/** Allocate shared receipt freight across lines in proportion to the merchandise value. */
export function allocateLandedCost<T extends { qty: number; unitCost: number }>(lines: T[], freight: number): (T & { landedUnitCost: number; landedTotal: number })[] {
  if (!Number.isFinite(freight) || freight < 0) throw new Error("Freight must be 0 or more.");
  const subtotal = lines.reduce((sum, line) => sum + Math.max(0, line.qty * line.unitCost), 0);
  let allocated = 0;
  return lines.map((line, index) => {
    const share = subtotal > 0 ? (index === lines.length - 1 ? freight - allocated : round2(freight * (line.qty * line.unitCost) / subtotal)) : 0;
    allocated = round2(allocated + share);
    const landedTotal = round2(line.qty * line.unitCost + share);
    return { ...line, landedTotal, landedUnitCost: line.qty > 0 ? round2(landedTotal / line.qty) : line.unitCost };
  });
}
