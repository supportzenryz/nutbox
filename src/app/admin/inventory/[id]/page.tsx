import { asc, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { adjustLotAction, receiveStockAction, thresholdAction } from "@/app/actions/admin";
import { PageHead } from "@/components/admin-ui";
import { Status } from "@/components/status";
import { Flash } from "@/components/store-chrome";
import { db } from "@/db";
import { inventoryItems, inventoryLevels, lots, orders, products, stockMovements, variantComponents, variants } from "@/db/schema";
import { dateIN, orderNo, rupees, weight } from "@/lib/format";
import { variantAvailability } from "@/lib/inventory";

export const metadata = { title: "Stock pool" };

const REASON_LABEL: Record<string, string> = { RECEIPT: "Received", RESERVE: "Reserved", RELEASE: "Released", SALE: "Shipped", RETURN: "Returned", ADJUSTMENT: "Count correction", WASTAGE: "Wastage" };

export default async function StockPool({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
  if (!item) notFound();
  const [[level], lotRows, ledger, comps] = await Promise.all([
    db.select().from(inventoryLevels).where(eq(inventoryLevels.itemId, id)),
    db.select().from(lots).where(eq(lots.itemId, id)).orderBy(asc(lots.expiresOn)),
    db.select().from(stockMovements).where(eq(stockMovements.itemId, id)).orderBy(desc(stockMovements.createdAt)).limit(60),
    db
      .select({ v: variants, p: products, requiredQty: variantComponents.requiredQty })
      .from(variantComponents)
      .innerJoin(variants, eq(variants.id, variantComponents.variantId))
      .innerJoin(products, eq(products.id, variants.productId))
      .where(eq(variantComponents.inventoryItemId, id))
      .orderBy(asc(variants.netGrams)),
  ]);
  const sellable = await variantAvailability(db, comps.map((c) => c.v.id));
  const onHand = level?.onHand ?? 0;
  const reserved = level?.reserved ?? 0;
  const g = item.uom === "GRAM";
  const fmt = (q: number) => (g ? weight(q) : `${q} units`);
  const orderNumbers = new Map<string, number>();
  const refOrderIds = ledger.filter((l) => l.refType === "ORDER" && l.refId).map((l) => l.refId!);
  if (refOrderIds.length) {
    for (const o of await db.select({ id: orders.id, number: orders.number }).from(orders).where(inArray(orders.id, [...new Set(refOrderIds)]))) orderNumbers.set(o.id, o.number);
  }
  const liveLots = lotRows.filter((l) => l.qtyOnHand > 0);
  const today = new Date();
  const suggestedLot = `${item.sku.split("-")[0].slice(0, 4)}-${String(today.getFullYear()).slice(2)}${String(today.getMonth() + 1).padStart(2, "0")}-${String.fromCharCode(65 + (lotRows.length % 26))}`;

  return (
    <>
      <Link href="/admin/inventory" className="text-sm text-muted hover:text-ink">Inventory</Link>
      <PageHead title={item.name} sub={`${item.sku} · counted in ${g ? "grams" : "units"}`} />
      <Flash sp={sp} />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="panel p-4"><p className="text-sm text-muted">On hand</p><p className="num mt-1 text-2xl font-semibold">{fmt(onHand)}</p></div>
        <div className="panel p-4"><p className="text-sm text-muted">Reserved for open orders</p><p className="num mt-1 text-2xl font-semibold">{fmt(reserved)}</p></div>
        <div className={`panel p-4 ${onHand - reserved < item.lowStockThreshold ? "border-danger/50" : ""}`}>
          <p className="text-sm text-muted">Available to sell</p>
          <p className="num mt-1 text-2xl font-semibold">{fmt(onHand - reserved)}</p>
          <form action={thresholdAction} className="mt-2 flex items-center gap-2 text-xs text-muted">
            <input type="hidden" name="itemId" value={id} />
            <label htmlFor="threshold">Alert below</label>
            <input id="threshold" name="threshold" defaultValue={g ? item.lowStockThreshold / 1000 : item.lowStockThreshold} className="field num w-16 py-0.5 text-xs" />
            <span>{g ? "kg" : "units"}</span>
            <button className="underline">Save</button>
          </form>
        </div>
      </div>

      <section className="panel mt-6">
        <h2 className="px-4 pt-4 font-semibold">Packs that draw from this pool</h2>
        <table className="table mt-2">
          <thead><tr><th>Pack</th><th>Channel</th><th className="text-right">Uses per unit</th><th className="text-right">Can still sell</th><th className="text-right">Price</th></tr></thead>
          <tbody>
            {comps.map(({ v, p, requiredQty }) => (
              <tr key={v.id}>
                <td><Link href={`/admin/products/${p.id}`} className="link">{p.name}</Link> <span className="text-muted">{v.title}</span></td>
                <td className="space-x-1">{v.soldRetail && <Status value="RETAIL" />}{v.soldWholesale && <Status value="WHOLESALE" />}</td>
                <td className="num text-right">{fmt(requiredQty)}</td>
                <td className="num text-right font-semibold">{sellable.get(v.id) ?? 0}</td>
                <td className="num text-right">{v.soldRetail ? rupees(v.retailPricePaise) : `${rupees(v.wholesaleBasePaise)} + GST`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="panel overflow-x-auto">
          <h2 className="px-4 pt-4 font-semibold">Lots (picked first-expiry-first-out)</h2>
          <table className="table mt-2 min-w-[640px]">
            <thead><tr><th>Lot</th><th>Received</th><th>Best before</th><th className="text-right">Qty</th><th className="text-right">Cost/kg</th><th>Correct or write off</th></tr></thead>
            <tbody>
              {lotRows.map((l) => {
                const soon = l.expiresOn.getTime() < Date.now() + 45 * 86400000;
                return (
                  <tr key={l.id} className={l.qtyOnHand ? "" : "text-muted"}>
                    <td className="font-medium">{l.lotNo}<span className="block text-xs font-normal text-muted">{l.supplier}</span></td>
                    <td>{dateIN(l.receivedAt)}</td>
                    <td className={soon && l.qtyOnHand ? "font-medium text-danger" : ""}>{dateIN(l.expiresOn)}</td>
                    <td className="num text-right">{fmt(l.qtyOnHand)}</td>
                    <td className="num text-right">{l.costPaisePerKg ? rupees(l.costPaisePerKg) : "—"}</td>
                    <td>
                      <form action={adjustLotAction} className="flex flex-wrap items-center gap-1">
                        <input type="hidden" name="itemId" value={id} />
                        <input type="hidden" name="lotId" value={l.id} />
                        <label className="sr-only" htmlFor={`d-${l.id}`}>Change in {g ? "kg" : "units"}</label>
                        <input id={`d-${l.id}`} name="delta" placeholder={g ? "± kg" : "± units"} inputMode="decimal" className="field num w-20 py-1 text-xs" required />
                        <select name="reason" className="field w-auto py-1 text-xs" aria-label="Reason">
                          <option value="ADJUSTMENT">Count</option>
                          <option value="WASTAGE">Wastage</option>
                        </select>
                        <input name="note" placeholder="Note" aria-label="Note" className="field w-28 py-1 text-xs" required />
                        <button className="btn-ghost btn-sm">Save</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!liveLots.length && <p className="px-4 pb-4 text-sm text-muted">No stock on hand. Receive a lot to start selling.</p>}
        </section>

        <form action={receiveStockAction} className="panel h-fit space-y-3 p-4">
          <input type="hidden" name="itemId" value={id} />
          <h2 className="font-semibold">Receive stock</h2>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="qty" className="label">Quantity ({g ? "kg" : "units"})</label><input id="qty" name="qty" required inputMode="decimal" className="field num" /></div>
            <div><label htmlFor="lotNo" className="label">Lot no.</label><input id="lotNo" name="lotNo" required defaultValue={suggestedLot} className="field uppercase" /></div>
          </div>
          <div><label htmlFor="expiresOn" className="label">Best before</label><input id="expiresOn" name="expiresOn" type="date" required className="field" /></div>
          <div><label htmlFor="supplier" className="label">Supplier</label><input id="supplier" name="supplier" className="field" /></div>
          <div><label htmlFor="costPerKg" className="label">Landed cost per kg (₹)</label><input id="costPerKg" name="costPerKg" inputMode="decimal" className="field num" /></div>
          <button className="btn-primary w-full">Add to stock</button>
          <p className="text-xs text-muted">Goes straight into the shared pool — both channels can sell it immediately.</p>
        </form>
      </div>

      <section className="panel mt-6 overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">Ledger</h2>
        <p className="px-4 text-xs text-muted">Every change to this pool, newest first. Entries are never edited.</p>
        <table className="table mt-2 min-w-[720px]">
          <thead><tr><th>When</th><th>What</th><th>Reference</th><th className="text-right">On hand ±</th><th className="text-right">Reserved ±</th><th className="text-right">On hand after</th><th>By</th></tr></thead>
          <tbody>
            {ledger.map((m) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap text-xs text-muted">{dateIN(m.createdAt, true)}</td>
                <td>{REASON_LABEL[m.reason]}{m.note && <span className="block text-xs text-muted">{m.note}</span>}</td>
                <td className="text-sm">
                  {m.refType === "ORDER" && m.refId ? <Link className="link" href={`/admin/orders/${m.refId}`}>{orderNo(orderNumbers.get(m.refId) ?? 0)}</Link> : m.lotId ? `Lot ${lotRows.find((l) => l.id === m.lotId)?.lotNo ?? ""}` : "—"}
                </td>
                <td className={`num text-right ${m.deltaOnHand < 0 ? "text-danger" : m.deltaOnHand > 0 ? "text-pista" : "text-muted"}`}>{m.deltaOnHand ? `${m.deltaOnHand > 0 ? "+" : "−"}${fmt(Math.abs(m.deltaOnHand))}` : "—"}</td>
                <td className="num text-right text-muted">{m.deltaReserved ? `${m.deltaReserved > 0 ? "+" : "−"}${fmt(Math.abs(m.deltaReserved))}` : "—"}</td>
                <td className="num text-right">{fmt(m.onHandAfter)}</td>
                <td className="text-xs text-muted">{m.actor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
