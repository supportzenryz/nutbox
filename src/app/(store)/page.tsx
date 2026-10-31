import { eq, sql } from "drizzle-orm";
import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { Packshot } from "@/components/packshot";
import { db } from "@/db";
import { inventoryItems, inventoryLevels, variants } from "@/db/schema";
import { listCategories, listRetailProducts } from "@/lib/catalog";
import { dateIN, rupees } from "@/lib/format";
import { pricePerKg } from "@/lib/pricing";

export const dynamic = "force-dynamic";

async function rateBoard() {
  const products = await listRetailProducts();
  const stock = await db
    .select({ productId: inventoryItems.productId, free: sql<number>`sum(${inventoryLevels.onHand} - ${inventoryLevels.reserved})::int`, low: inventoryItems.lowStockThreshold })
    .from(inventoryLevels)
    .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryLevels.itemId))
    .groupBy(inventoryItems.productId, inventoryItems.lowStockThreshold);
  const ws = await db
    .select({ productId: variants.productId, perKg: sql<number>`min(${variants.wholesaleBasePaise}::bigint * 1000 / ${variants.netGrams})::int` })
    .from(variants)
    .where(eq(variants.soldWholesale, true))
    .groupBy(variants.productId);
  return products
    .filter((p) => p.categorySlug !== "gift-boxes")
    .map((p) => {
      const s = stock.find((x) => x.productId === p.id);
      const kg = p.variants.find((v) => v.netGrams === 1000) ?? p.variants[p.variants.length - 1];
      return {
        ...p,
        retailPerKg: pricePerKg(kg.retailPricePaise, kg.netGrams),
        wholesalePerKg: ws.find((w) => w.productId === p.id)?.perKg ?? null,
        status: !s || s.free <= 0 ? "out" : s.free < s.low ? "low" : "ok",
      };
    });
}

export default async function Home() {
  const [rows, cats, featured] = await Promise.all([rateBoard(), listCategories(), listRetailProducts({ featured: true })]);
  return (
    <>
      <section className="border-b border-line bg-card">
        <div className="shell grid gap-10 py-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:py-14">
          <div className="flex flex-col justify-center">
            <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">Nuts and dry fruits, sold by grade.</h1>
            <p className="mt-4 max-w-md text-lg text-muted">
              Every pack says what's inside: W240 or W320, California or Mamra, where it was grown and when the lot expires. Retail pouches and 25 kg wholesale bags come from the same fresh stock.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/shop" className="btn-primary">
                Shop retail packs
              </Link>
              <Link href="/wholesale" className="btn-ghost">
                Wholesale prices
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded border-2 border-pista-deep bg-pista-deep text-pista-soft">
            <div className="flex items-end justify-between gap-4 px-4 pb-2 pt-4 sm:px-5">
              <p className="stamp text-3xl text-white sm:text-4xl">TODAY'S RATES</p>
              <p className="text-xs text-pista-kernel">{dateIN(new Date())} · ₹ per kg</p>
            </div>
            <div className="max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-pista-deep text-left text-xs text-pista-kernel">
                  <tr>
                    <th className="px-4 py-2 font-medium sm:px-5">Item & grade</th>
                    <th className="hidden px-2 py-2 font-medium sm:table-cell">Origin</th>
                    <th className="px-2 py-2 text-right font-medium">Retail</th>
                    <th className="px-4 py-2 text-right font-medium sm:px-5">Wholesale*</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-white/10 hover:bg-white/5">
                      <td className="px-4 py-2 sm:px-5">
                        <Link href={`/p/${r.slug}`} className="text-white hover:underline">
                          {r.variety}
                        </Link>{" "}
                        {r.grade && <span className="stamp ml-1 text-base text-saffron">{r.grade}</span>}
                        {r.status !== "ok" && (
                          <span className={`ml-2 text-[11px] ${r.status === "out" ? "text-[#F4A598]" : "text-saffron"}`}>{r.status === "out" ? "sold out" : "low stock"}</span>
                        )}
                      </td>
                      <td className="hidden px-2 py-2 text-pista-soft/80 sm:table-cell">{r.origin}</td>
                      <td className="num px-2 py-2 text-right text-white">{rupees(r.retailPerKg)}</td>
                      <td className="num px-4 py-2 text-right text-pista-kernel sm:px-5">{r.wholesalePerKg ? rupees(r.wholesalePerKg) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-white/10 px-4 py-2 text-[11px] text-pista-soft/70 sm:px-5">
              Retail incl. 5% GST, best per-kg pack. *Wholesale list price excl. GST for approved business accounts; volume breaks lower it further.
            </p>
          </div>
        </div>
      </section>

      <section className="shell py-12">
        <h2 className="text-2xl font-semibold">Shop by aisle</h2>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {cats.map((c) => (
            <Link key={c.id} href={`/shop?category=${c.slug}`} className="panel p-4 transition-colors hover:border-pista">
              <p className="font-semibold">{c.name}</p>
              <p className="mt-1 text-xs leading-snug text-muted">{c.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="shell pb-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-2xl font-semibold">Most ordered this month</h2>
          <Link href="/shop" className="link text-sm">
            See all products
          </Link>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-5">
          {featured.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </div>
      </section>

      <section className="shell py-12">
        <div className="grid items-center gap-8 rounded border border-jute/30 bg-jute-soft p-6 sm:p-8 md:grid-cols-[1fr_220px]">
          <div>
            <h2 className="text-2xl font-semibold">Running a sweet shop, bakery or kitchen?</h2>
            <p className="mt-2 max-w-xl text-muted">
              Open a wholesale account with your GSTIN for 5, 10 and 25 kg packs, volume pricing, tax invoices with input credit, and 15–30 day credit terms once you're set up.
            </p>
            <Link href="/wholesale/apply" className="btn-primary mt-5">
              Apply for a wholesale account
            </Link>
          </div>
          <Packshot kind="sack" tone="#D9BE8F" mark="W240" sub="25 KG · INDIA" className="hidden w-full rounded md:block" title="25 kg cashew bag" />
        </div>
      </section>
    </>
  );
}
