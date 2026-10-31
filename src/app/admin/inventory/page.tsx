import { asc, count, eq, gt, sql } from "drizzle-orm";
import Link from "next/link";
import { PageHead } from "@/components/admin-ui";
import { db } from "@/db";
import { inventoryItems, inventoryLevels, lots, variantComponents } from "@/db/schema";
import { dateIN, rupees, weight } from "@/lib/format";

export const metadata = { title: "Inventory" };

export default async function Inventory({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const sp = await searchParams;
  const rows = await db
    .select({
      id: inventoryItems.id,
      sku: inventoryItems.sku,
      name: inventoryItems.name,
      uom: inventoryItems.uom,
      threshold: inventoryItems.lowStockThreshold,
      onHand: sql<number>`coalesce(sum(${inventoryLevels.onHand}), 0)::int`,
      reserved: sql<number>`coalesce(sum(${inventoryLevels.reserved}), 0)::int`,
    })
    .from(inventoryItems)
    .leftJoin(inventoryLevels, eq(inventoryLevels.itemId, inventoryItems.id))
    .groupBy(inventoryItems.id)
    .orderBy(asc(inventoryItems.name));
  const lotStats = await db
    .select({ itemId: lots.itemId, n: count(), nextExpiry: sql<Date>`min(${lots.expiresOn})`, value: sql<number>`coalesce(sum(${lots.qtyOnHand}::bigint * ${lots.costPaisePerKg} / 1000), 0)::bigint` })
    .from(lots)
    .where(gt(lots.qtyOnHand, 0))
    .groupBy(lots.itemId);
  const draws = await db.select({ itemId: variantComponents.inventoryItemId, n: count() }).from(variantComponents).groupBy(variantComponents.inventoryItemId);
  const list = rows
    .map((r) => ({ ...r, free: r.onHand - r.reserved, lots: lotStats.find((l) => l.itemId === r.id), packs: draws.find((d) => d.itemId === r.id)?.n ?? 0 }))
    .filter((r) => sp.filter !== "low" || r.free < r.threshold);
  const totalValue = lotStats.reduce((a, l) => a + Number(l.value), 0);
  const totalKg = rows.reduce((a, r) => a + (r.uom === "GRAM" ? r.onHand : 0), 0);
  const fmt = (q: number, uom: string) => (uom === "GRAM" ? weight(q) : `${q} units`);

  return (
    <>
      <PageHead title="Inventory" sub={`${weight(totalKg)} on hand across ${rows.length} stock pools · stock value at cost ${rupees(totalValue)}`}>
        <Link href="/admin/inventory" className={`btn-sm ${sp.filter ? "btn-ghost" : "btn-primary"}`}>All pools</Link>
        <Link href="/admin/inventory?filter=low" className={`btn-sm ${sp.filter ? "btn-primary" : "btn-ghost"}`}>Below alert level</Link>
      </PageHead>
      <p className="mb-4 max-w-3xl text-sm text-muted">
        Each pool is one physical stock, counted in grams. Retail pouches, wholesale bags and gift boxes all reserve from the same pool, so the numbers below are the single source of truth for both channels.
      </p>
      <div className="panel overflow-x-auto">
        <table className="table min-w-[860px]">
          <thead>
            <tr><th>Stock pool</th><th className="text-right">On hand</th><th className="text-right">Reserved</th><th className="text-right">Available</th><th>Lots</th><th>Next expiry</th><th className="text-right">Packs drawing</th></tr>
          </thead>
          <tbody>
            {list.map((r) => {
              const low = r.free < r.threshold;
              return (
                <tr key={r.id} className="hover:bg-paper">
                  <td><Link href={`/admin/inventory/${r.id}`} className="link">{r.name}</Link><span className="block text-xs text-muted">{r.sku}</span></td>
                  <td className="num text-right">{fmt(r.onHand, r.uom)}</td>
                  <td className="num text-right text-muted">{r.reserved ? fmt(r.reserved, r.uom) : "—"}</td>
                  <td className={`num text-right font-semibold ${low ? "text-danger" : ""}`}>
                    {fmt(r.free, r.uom)}
                    {low && <span className="block text-[11px] font-normal">below {fmt(r.threshold, r.uom)}</span>}
                  </td>
                  <td className="num">{r.lots?.n ?? 0}</td>
                  <td className={r.lots?.nextExpiry && new Date(r.lots.nextExpiry).getTime() < Date.now() + 45 * 86400000 ? "font-medium text-danger" : ""}>{r.lots ? dateIN(r.lots.nextExpiry) : "—"}</td>
                  <td className="num text-right">{r.packs}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
