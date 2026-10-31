import { and, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { orderLines, orders } from "@/db/schema";

/** Invoices issued in a month (IST), grouped the way GSTR-1 wants them. */
export async function gstReport(month: string) {
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1) - 330 * 60_000);
  const end = new Date(Date.UTC(y, m, 1) - 330 * 60_000);
  const inv = await db
    .select()
    .from(orders)
    .where(and(isNotNull(orders.invoiceNo), gte(orders.invoicedAt, start), lt(orders.invoicedAt, end), inArray(orders.status, ["OPEN", "ARCHIVED", "CANCELLED"])))
    .orderBy(orders.invoicedAt);
  const lines = inv.length ? await db.select().from(orderLines).where(inArray(orderLines.orderId, inv.map((o) => o.id))) : [];
  const b2b = inv.filter((o) => o.buyerGstin);
  const b2c = inv.filter((o) => !o.buyerGstin);
  const b2cByState = new Map<string, { state: string; supply: string; taxable: number; cgst: number; sgst: number; igst: number; n: number }>();
  for (const o of b2c) {
    const k = o.shipStateCode;
    const cur = b2cByState.get(k) ?? { state: k, supply: o.supplyType, taxable: 0, cgst: 0, sgst: 0, igst: 0, n: 0 };
    cur.taxable += o.taxablePaise; cur.cgst += o.cgstPaise; cur.sgst += o.sgstPaise; cur.igst += o.igstPaise; cur.n++;
    b2cByState.set(k, cur);
  }
  const hsn = new Map<string, { hsn: string; rate: number; qtyKg: number; taxable: number; tax: number }>();
  for (const l of lines) {
    const k = `${l.hsnCode}@${l.gstRateBps}`;
    const cur = hsn.get(k) ?? { hsn: l.hsnCode, rate: l.gstRateBps, qtyKg: 0, taxable: 0, tax: 0 };
    cur.qtyKg += (l.netGrams * l.qty) / 1000; cur.taxable += l.taxablePaise; cur.tax += l.taxPaise;
    hsn.set(k, cur);
  }
  const sum = (xs: typeof inv) => xs.reduce((a, o) => ({ taxable: a.taxable + o.taxablePaise, tax: a.tax + o.cgstPaise + o.sgstPaise + o.igstPaise, total: a.total + o.totalPaise }), { taxable: 0, tax: 0, total: 0 });
  return { start, end, b2b, b2cStates: [...b2cByState.values()], hsn: [...hsn.values()], totals: { b2b: sum(b2b), b2c: sum(b2c) } };
}

export const currentMonth = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 7);
