import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { priceListAction } from "@/app/actions/admin";
import { PageHead } from "@/components/admin-ui";
import { Flash } from "@/components/store-chrome";
import { db } from "@/db";
import { companies, priceBreaks, priceLists } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";

export const metadata = { title: "Price lists" };

export default async function PriceLists({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const lists = await db.select().from(priceLists);
  const nBreaks = await db.select({ id: priceBreaks.priceListId, n: count() }).from(priceBreaks).groupBy(priceBreaks.priceListId);
  const nCos = await db.select({ id: companies.priceListId, n: count() }).from(companies).groupBy(companies.priceListId);
  return (
    <>
      <PageHead title="Wholesale price lists" sub="A list adjusts every wholesale base price by a percentage; volume breaks set fixed prices at quantities and override the adjustment." />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="panel">
          <table className="table">
            <thead><tr><th>Name</th><th className="text-right">Adjustment</th><th className="text-right">Volume breaks</th><th className="text-right">Accounts</th></tr></thead>
            <tbody>{lists.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/admin/price-lists/${l.id}`} className="link">{l.name}</Link>{l.isDefault && <span className="ml-2 text-xs text-muted">default</span>}</td>
                <td className="num text-right">{l.adjustmentBps / 100}%</td>
                <td className="num text-right">{nBreaks.find((b) => b.id === l.id)?.n ?? 0}</td>
                <td className="num text-right">{nCos.find((c) => c.id === l.id)?.n ?? 0}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <form action={priceListAction} className="panel h-fit space-y-3 p-4">
          <input type="hidden" name="op" value="create" />
          <h2 className="font-semibold">New price list</h2>
          <div><label htmlFor="name" className="label">Name</label><input id="name" name="name" required className="field" placeholder="HORECA Gold" /></div>
          <div><label htmlFor="adjustment" className="label">Adjustment %</label><input id="adjustment" name="adjustment" defaultValue="0" inputMode="decimal" className="field num" /><p className="hint">−5 means 5% below wholesale base.</p></div>
          <button className="btn-primary w-full">Create</button>
        </form>
      </div>
    </>
  );
}
