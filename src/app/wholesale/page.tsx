import { and, asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { quickOrderAction } from "@/app/actions/shop";
import { Packshot } from "@/components/packshot";
import { Status } from "@/components/status";
import { Flash } from "@/components/store-chrome";
import { db } from "@/db";
import { categories, priceBreaks, products, variants } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { readCart } from "@/lib/cart";
import { rupees } from "@/lib/format";
import { variantAvailability } from "@/lib/inventory";
import { priceLadder } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wholesale" };

const TERMS: Record<string, string> = { PREPAID: "Prepaid", NET_7: "Net 7 days", NET_15: "Net 15 days", NET_30: "Net 30 days" };

function Landing({ status, sp }: { status?: string; sp: { error?: string; ok?: string } }) {
  return (
    <div className="shell py-10">
      <Flash sp={sp} />
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_380px]">
        <div>
          <h1 className="text-4xl font-semibold leading-tight">Wholesale nuts and dry fruits for kitchens, sweet shops and stores.</h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            The same graded stock as our retail packs, in 1, 5, 10 and 25 kg packs. Order from one sheet, see your price at every quantity, and get a GST invoice with input tax credit.
          </p>
          {status === "PENDING" ? (
            <div className="mt-6 max-w-xl rounded border border-saffron/50 bg-saffron-soft p-4">
              <p className="font-semibold">Your application is being reviewed.</p>
              <p className="mt-1 text-sm text-muted">We verify your GSTIN and business details, usually within one working day. You can keep shopping retail meanwhile.</p>
            </div>
          ) : status === "REJECTED" || status === "SUSPENDED" ? (
            <div className="mt-6 max-w-xl rounded border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
              Your wholesale account isn't active. Write to us and we'll look into it.
            </div>
          ) : (
            <Link href="/wholesale/apply" className="btn-primary mt-6">Apply with your GSTIN</Link>
          )}
          <ul className="mt-10 grid max-w-2xl gap-6 sm:grid-cols-3">
            {[
              ["Volume pricing", "Prices drop at set quantities. You see every break before you order."],
              ["Credit terms", "Net 7, 15 or 30 days with a credit limit once you've ordered with us."],
              ["Request a quote", "Send the sheet as a quote. We confirm price and stock before you commit."],
            ].map(([t, d]) => (
              <li key={t}>
                <p className="font-semibold">{t}</p>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </li>
            ))}
          </ul>
        </div>
        <Packshot kind="sack" tone="#B98A5E" mark="NONPAREIL" sub="25 KG · USA" className="w-full rounded border border-line" title="25 kg almond bag" />
      </div>
    </div>
  );
}

export default async function Wholesale({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; cat?: string }> }) {
  const sp = await searchParams;
  const u = await currentUser();
  if (!u?.company || u.company.status !== "APPROVED") return <Landing status={u?.company?.status} sp={sp} />;

  const rows = await db
    .select({ v: variants, p: products, c: categories })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(variants.soldWholesale, true), eq(variants.isActive, true), eq(products.isActive, true)))
    .orderBy(asc(categories.sortOrder), asc(products.name), asc(variants.netGrams));
  const ids = rows.map((r) => r.v.id);
  const [avail, breaks, cart, s] = await Promise.all([
    variantAvailability(db, ids),
    u.priceList && ids.length ? db.select().from(priceBreaks).where(and(eq(priceBreaks.priceListId, u.priceList.id), inArray(priceBreaks.variantId, ids))) : Promise.resolve([]),
    readCart("WHOLESALE"),
    getSettings(),
  ]);
  const inCart = new Map(cart.map((i) => [i.v, i.q]));
  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.p.id, [...(groups.get(r.p.id) ?? []), r]);
  const adj = u.priceList?.adjustmentBps ?? 0;

  return (
    <div className="shell py-8">
      <Flash sp={sp} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Quick order</h1>
          <p className="mt-1 text-sm text-muted">
            {u.company.legalName} · GSTIN {u.company.gstin ?? "not registered"} · <Status value="APPROVED" label={u.priceList?.name ?? "Standard"} />{" "}
            · Terms: {TERMS[u.company.paymentTerms]}
          </p>
        </div>
        <p className="text-sm text-muted">Prices exclude 5% GST. Minimum order {rupees(s.wholesaleMinOrderPaise)}.</p>
      </div>

      <form action={quickOrderAction} className="mt-6">
        <div className="panel overflow-x-auto">
          <table className="table min-w-[760px]">
            <thead className="bg-paper">
              <tr>
                <th>Product</th>
                <th>Pack</th>
                <th>Price per pack (excl. GST)</th>
                <th className="text-right">In stock</th>
                <th className="w-36 text-right">Quantity</th>
              </tr>
            </thead>
            {[...groups.values()].map((g) => (
              <tbody key={g[0].p.id} className="border-t-2 border-line">
                {g.map(({ v, p }, i) => {
                  const ladder = priceLadder({ basePaise: v.wholesaleBasePaise, adjustmentBps: adj, breaks: breaks.filter((b) => b.variantId === v.id), minQty: v.wholesaleMinQty });
                  const a = avail.get(v.id) ?? 0;
                  return (
                    <tr key={v.id}>
                      {i === 0 && (
                        <td rowSpan={g.length} className="w-64">
                          <Link href={`/p/${p.slug}`} className="font-semibold hover:text-pista">{p.name}</Link>
                          <p className="text-xs text-muted">
                            {p.grade && <span className="stamp mr-1 text-sm text-pista">{p.grade.split(" ")[0]}</span>}
                            {p.origin} · HSN {p.hsnCode}
                          </p>
                        </td>
                      )}
                      <td>
                        <p className="font-medium">{v.title}</p>
                        <p className="text-xs text-muted">
                          Min {v.wholesaleMinQty}
                          {v.wholesaleStep > 1 ? `, in steps of ${v.wholesaleStep}` : ""}
                        </p>
                      </td>
                      <td>
                        <ul className="num space-y-0.5">
                          {ladder.map((r, k) => (
                            <li key={r.minQty} className={k === 0 ? "font-semibold" : "text-muted"}>
                              {rupees(r.unitPricePaise)}
                              <span className="ml-1 text-xs">{k === 0 ? `· ${rupees(Math.round((r.unitPricePaise * 1000) / v.netGrams))}/kg` : `at ${r.minQty}+`}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="num text-right">{a > 0 ? (a > 999 ? "999+" : a) : <span className="text-danger">Out</span>}</td>
                      <td className="text-right">
                        <label className="sr-only" htmlFor={`qty_${v.id}`}>Quantity of {p.name} {v.title}</label>
                        <input
                          id={`qty_${v.id}`}
                          name={`qty_${v.id}`}
                          type="number"
                          min={v.wholesaleMinQty}
                          step={v.wholesaleStep}
                          defaultValue={inCart.get(v.id) ?? ""}
                          disabled={a <= 0}
                          placeholder="0"
                          className="field num w-24 text-right"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
        <div className="sticky bottom-0 mt-4 flex items-center justify-end gap-3 border-t border-line bg-paper/95 py-3 backdrop-blur">
          <p className="text-sm text-muted">Quantities already in your cart are pre-filled.</p>
          <button className="btn-primary px-6">Review order</button>
        </div>
      </form>
    </div>
  );
}
