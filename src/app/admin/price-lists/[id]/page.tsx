import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { priceListAction } from "@/app/actions/admin";
import { PageHead } from "@/components/admin-ui";
import { Flash } from "@/components/store-chrome";
import { db } from "@/db";
import { priceBreaks, priceLists, products, variants } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { rupees } from "@/lib/format";
import { wholesaleUnitPrice } from "@/lib/pricing";

export const metadata = { title: "Price list" };

export default async function PriceList({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [[list], rows, breaks] = await Promise.all([
    db.select().from(priceLists).where(eq(priceLists.id, id)),
    db.select({ v: variants, p: products }).from(variants).innerJoin(products, eq(products.id, variants.productId)).where(and(eq(variants.soldWholesale, true), eq(variants.isActive, true))).orderBy(asc(products.name), asc(variants.netGrams)),
    db.select().from(priceBreaks).where(eq(priceBreaks.priceListId, id)).orderBy(asc(priceBreaks.minQty)),
  ]);
  if (!list) notFound();
  return (
    <>
      <Link href="/admin/price-lists" className="text-sm text-muted hover:text-ink">Price lists</Link>
      <PageHead title={list.name} sub="Prices exclude GST.">
        <form action={priceListAction} className="flex items-end gap-2">
          <input type="hidden" name="priceListId" value={id} /><input type="hidden" name="op" value="adjust" />
          <div><label htmlFor="adjustment" className="label">Adjustment %</label><input id="adjustment" name="adjustment" defaultValue={list.adjustmentBps / 100} className="field num w-24" /></div>
          <button className="btn-ghost">Save</button>
        </form>
      </PageHead>
      <Flash sp={sp} />
      <div className="panel overflow-x-auto">
        <table className="table min-w-[900px]">
          <thead><tr><th>Pack</th><th className="text-right">Base</th><th className="text-right">List price at MOQ</th><th>Volume breaks</th><th>Add or change a break</th></tr></thead>
          <tbody>{rows.map(({ v, p }) => {
            const vb = breaks.filter((b) => b.variantId === v.id);
            const listPrice = wholesaleUnitPrice({ basePaise: v.wholesaleBasePaise, adjustmentBps: list.adjustmentBps, breaks: [], qty: v.wholesaleMinQty });
            return (
              <tr key={v.id}>
                <td>{p.name}<span className="block text-xs text-muted">{v.title} · MOQ {v.wholesaleMinQty}</span></td>
                <td className="num text-right">{rupees(v.wholesaleBasePaise)}</td>
                <td className="num text-right font-medium">{rupees(listPrice.unitPricePaise)}</td>
                <td>
                  <ul className="space-y-1">{vb.map((b) => (
                    <li key={b.id} className="flex items-center gap-2 text-sm">
                      <span className="num">{b.minQty}+ → {rupees(b.unitPricePaise)}</span>
                      <form action={priceListAction}><input type="hidden" name="priceListId" value={id} /><input type="hidden" name="op" value="deleteBreak" /><input type="hidden" name="breakId" value={b.id} /><button className="text-xs text-muted underline hover:text-danger">remove</button></form>
                    </li>
                  ))}</ul>
                </td>
                <td>
                  <form action={priceListAction} className="flex items-center gap-1">
                    <input type="hidden" name="priceListId" value={id} /><input type="hidden" name="op" value="addBreak" /><input type="hidden" name="variantId" value={v.id} />
                    <input name="minQty" placeholder="Qty" aria-label="Minimum quantity" inputMode="numeric" className="field num w-16 py-1 text-xs" />
                    <input name="price" placeholder="₹ each" aria-label="Unit price" inputMode="decimal" className="field num w-24 py-1 text-xs" />
                    <button className="btn-ghost btn-sm">Set</button>
                  </form>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </>
  );
}
