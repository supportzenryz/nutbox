// GST engine. Pure functions — no DB. All amounts in integer paise, rates in basis points.
//
// Retail (B2C) prices are GST-inclusive (MRP rules): taxable = net × 10000 / (10000 + rate).
// Wholesale (B2B) prices are GST-exclusive: tax = taxable × rate / 10000.
// Intra-state supply → CGST + SGST (split evenly, odd paisa to SGST); inter-state → IGST.
// Shipping is a composite supply taxed at the principal (highest line) rate.

export type PriceMode = "INCLUSIVE" | "EXCLUSIVE";

export type TaxLineInput = {
  key: string;
  qty: number;
  unitPricePaise: number;
  gstRateBps: number;
};

export type TaxLineResult = TaxLineInput & {
  grossPaise: number;
  discountPaise: number;
  taxablePaise: number;
  taxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};

export type TaxResult = {
  lines: TaxLineResult[];
  shipping: { chargePaise: number; taxablePaise: number; taxPaise: number; rateBps: number };
  itemsGrossPaise: number;
  discountPaise: number;
  shippingPaise: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalPaise: number;
};

/** Split `amount` across `weights` proportionally; parts sum exactly to `amount` (largest remainder). */
export function allocate(amount: number, weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (amount <= 0 || total <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / total);
  const parts = raw.map(Math.floor);
  let left = amount - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k++, left--) parts[order[k % order.length].i]++;
  return parts;
}

function taxOn(net: number, rateBps: number, mode: PriceMode) {
  if (mode === "INCLUSIVE") {
    const taxable = Math.round((net * 10000) / (10000 + rateBps));
    return { taxable, tax: net - taxable };
  }
  return { taxable: net, tax: Math.round((net * rateBps) / 10000) };
}

function split(tax: number, intraState: boolean) {
  if (!intraState) return { cgst: 0, sgst: 0, igst: tax };
  const cgst = Math.floor(tax / 2);
  return { cgst, sgst: tax - cgst, igst: 0 };
}

export function computeOrderTax(input: {
  lines: TaxLineInput[];
  mode: PriceMode;
  intraState: boolean;
  discountPaise?: number;
  shippingPaise?: number;
}): TaxResult {
  const { lines, mode, intraState } = input;
  for (const l of lines) {
    if (!Number.isInteger(l.qty) || l.qty <= 0) throw new Error(`Invalid quantity for ${l.key}`);
    if (!Number.isInteger(l.unitPricePaise) || l.unitPricePaise < 0) throw new Error(`Invalid price for ${l.key}`);
  }
  const grosses = lines.map((l) => l.qty * l.unitPricePaise);
  const itemsGross = grosses.reduce((a, b) => a + b, 0);
  const discount = Math.min(Math.max(0, Math.round(input.discountPaise ?? 0)), itemsGross);
  const discounts = allocate(discount, grosses);

  const outLines: TaxLineResult[] = lines.map((l, i) => {
    const net = grosses[i] - discounts[i];
    const { taxable, tax } = taxOn(net, l.gstRateBps, mode);
    const s = split(tax, intraState);
    return {
      ...l,
      grossPaise: grosses[i],
      discountPaise: discounts[i],
      taxablePaise: taxable,
      taxPaise: tax,
      cgstPaise: s.cgst,
      sgstPaise: s.sgst,
      igstPaise: s.igst,
      totalPaise: taxable + tax,
    };
  });

  const shipRate = lines.reduce((m, l) => Math.max(m, l.gstRateBps), 0);
  const shipCharge = Math.max(0, Math.round(input.shippingPaise ?? 0));
  const ship = taxOn(shipCharge, shipRate, mode);
  const shipSplit = split(ship.tax, intraState);

  const sum = (f: (l: TaxLineResult) => number) => outLines.reduce((a, l) => a + f(l), 0);
  const taxable = sum((l) => l.taxablePaise) + ship.taxable;
  const cgst = sum((l) => l.cgstPaise) + shipSplit.cgst;
  const sgst = sum((l) => l.sgstPaise) + shipSplit.sgst;
  const igst = sum((l) => l.igstPaise) + shipSplit.igst;

  return {
    lines: outLines,
    shipping: { chargePaise: shipCharge, taxablePaise: ship.taxable, taxPaise: ship.tax, rateBps: shipRate },
    itemsGrossPaise: itemsGross,
    discountPaise: discount,
    shippingPaise: shipCharge,
    taxablePaise: taxable,
    cgstPaise: cgst,
    sgstPaise: sgst,
    igstPaise: igst,
    totalPaise: taxable + cgst + sgst + igst,
  };
}

/** Indian financial year code for a date, e.g. 31 Oct 2026 → "2627" (FY 2026-27). */
export function financialYearCode(d: Date): string {
  // FY runs 1 April – 31 March, India time.
  const ist = new Date(d.getTime() + 330 * 60_000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${String(start % 100).padStart(2, "0")}${String((start + 1) % 100).padStart(2, "0")}`;
}

export function formatInvoiceNo(prefix: string, fy: string, seq: number): string {
  const no = `${prefix}/${fy}/${String(seq).padStart(5, "0")}`;
  if (no.length > 16) throw new Error("GST invoice numbers may not exceed 16 characters");
  return no;
}

/** E-way bill needed for inter-state movement of consignments above ₹50,000 (incl. tax). */
export function needsEwayBill(totalPaise: number, supplyType: "INTRA" | "INTER"): boolean {
  return supplyType === "INTER" && totalPaise > 50_000_00;
}
