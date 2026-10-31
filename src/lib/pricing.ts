// Channel pricing. Pure functions.
// Wholesale follows Shopify B2B catalog semantics: a fixed volume break with minQty ≤ qty
// beats the price list's percentage adjustment on the wholesale base price.

export type PriceBreakRow = { minQty: number; unitPricePaise: number };

export function wholesaleUnitPrice(args: {
  basePaise: number;
  adjustmentBps: number;
  breaks: PriceBreakRow[];
  qty: number;
}): { unitPricePaise: number; source: "BREAK" | "LIST" } {
  const eligible = args.breaks.filter((b) => b.minQty <= args.qty).sort((a, b) => b.minQty - a.minQty);
  if (eligible.length) return { unitPricePaise: eligible[0].unitPricePaise, source: "BREAK" };
  return { unitPricePaise: Math.round((args.basePaise * (10000 + args.adjustmentBps)) / 10000), source: "LIST" };
}

/** Price tiers to display on the quick-order table: list price, then each break. */
export function priceLadder(args: { basePaise: number; adjustmentBps: number; breaks: PriceBreakRow[]; minQty: number }) {
  const base = wholesaleUnitPrice({ ...args, qty: args.minQty, breaks: args.breaks.filter((b) => b.minQty <= args.minQty) });
  const rows = [{ minQty: args.minQty, unitPricePaise: base.unitPricePaise }];
  for (const b of [...args.breaks].sort((a, b) => a.minQty - b.minQty)) {
    if (b.minQty > args.minQty) rows.push(b);
  }
  return rows;
}

export function checkWholesaleQty(qty: number, minQty: number, step: number): string | null {
  if (!Number.isInteger(qty) || qty <= 0) return "Enter a whole number.";
  if (qty < minQty) return `Minimum order is ${minQty}.`;
  if ((qty - minQty) % step !== 0) return `Order in steps of ${step} (${minQty}, ${minQty + step}, ${minQty + 2 * step}…).`;
  return null;
}

/** Snap a requested quantity to the nearest valid wholesale quantity (never below the minimum). */
export function snapWholesaleQty(qty: number, minQty: number, step: number): number {
  if (qty <= minQty) return minQty;
  return minQty + Math.round((qty - minQty) / step) * step;
}

export const RETAIL_MAX_PER_LINE = 10;

export function pricePerKg(pricePaise: number, grams: number): number {
  return grams > 0 ? Math.round((pricePaise * 1000) / grams) : 0;
}
