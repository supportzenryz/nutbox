import Link from "next/link";
import { couponAction, updateCartAction } from "@/app/actions/shop";
import { OrderSummary } from "@/components/order-summary";
import { Packshot } from "@/components/packshot";
import { Flash } from "@/components/store-chrome";
import { db } from "@/db";
import { readCart, readCoupon } from "@/lib/cart";
import { buildCheckout } from "@/lib/orders";
import { rupees } from "@/lib/format";
import { RETAIL_MAX_PER_LINE } from "@/lib/pricing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cart" };

export default async function CartPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const coupon = await readCoupon("RETAIL");
  const sum = await buildCheckout(db, { channel: "RETAIL", items: await readCart("RETAIL"), couponCode: coupon });
  const blocked = sum.lines.some((l) => l.problem);

  return (
    <div className="shell py-8">
      <h1 className="text-3xl font-semibold">Your cart</h1>
      <div className="mt-4 max-w-3xl">
        <Flash sp={sp} />
      </div>
      {!sum.lines.length ? (
        <div className="panel mt-6 p-8 text-center">
          <p className="font-semibold">Your cart is empty.</p>
          <Link href="/shop" className="btn-primary mt-4">Browse products</Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
          <ul className="divide-y divide-line border-y border-line">
            {sum.lines.map((l) => (
              <li key={l.variantId} className="flex gap-4 py-4">
                <Packshot kind={l.packType === "Gift box" ? "box" : "pouch"} tone={l.tone} mark={l.packType === "Gift box" ? "FESTIVE" : l.grade?.split(" ")[0] ?? "NUTBOX"} className="h-20 w-20 shrink-0 rounded border border-line" />
                <div className="min-w-0 flex-1">
                  <Link href={`/p/${l.productSlug}?v=${l.variantId}`} className="font-semibold hover:text-pista">{l.productName}</Link>
                  <p className="text-sm text-muted">{l.title} · {rupees(l.unitPricePaise)} each</p>
                  {l.problem && <p className="mt-1 text-sm font-medium text-danger">{l.problem}</p>}
                  <form action={updateCartAction} className="mt-2 flex items-center gap-2">
                    <input type="hidden" name="channel" value="RETAIL" />
                    <input type="hidden" name="variantId" value={l.variantId} />
                    <label className="sr-only" htmlFor={`q-${l.variantId}`}>Quantity</label>
                    <select id={`q-${l.variantId}`} name="qty" defaultValue={Math.min(l.qty, RETAIL_MAX_PER_LINE)} className="field w-20 py-1">
                      {Array.from({ length: RETAIL_MAX_PER_LINE }, (_, i) => i + 1).map((q) => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                    <button className="btn-ghost btn-sm">Update</button>
                    <button name="qty" value="0" className="text-sm text-muted underline hover:text-danger">Remove</button>
                  </form>
                </div>
                <p className="num font-semibold">{rupees(l.qty * l.unitPricePaise)}</p>
              </li>
            ))}
          </ul>

          <aside className="panel h-fit p-5">
            <OrderSummary tax={sum.tax} channel="RETAIL" intraState={sum.intraState} coupon={sum.coupon?.code} />
            {sum.freeShippingGapPaise > 0 && (
              <p className="mt-3 rounded bg-saffron-soft px-3 py-2 text-sm">Add {rupees(sum.freeShippingGapPaise)} more for free delivery.</p>
            )}
            <form action={couponAction} className="mt-4 flex gap-2">
              <input type="hidden" name="channel" value="RETAIL" />
              <label htmlFor="code" className="sr-only">Coupon code</label>
              <input id="code" name="code" defaultValue={coupon ?? ""} placeholder="Coupon code" className="field uppercase" />
              <button className="btn-ghost">Apply</button>
            </form>
            {coupon && sum.couponProblem && <p className="mt-2 text-sm text-danger">{sum.couponProblem}</p>}
            {coupon && sum.coupon && (
              <form action={couponAction} className="mt-1">
                <input type="hidden" name="channel" value="RETAIL" />
                <button name="remove" value="1" className="text-xs text-muted underline">Remove {coupon}</button>
              </form>
            )}
            <p className="mt-3 text-xs text-muted">Delivery tax is worked out from your delivery state at checkout.</p>
            {blocked ? (
              <p className="mt-4 text-sm font-medium text-danger">Fix the items marked above to continue.</p>
            ) : (
              <Link href="/checkout" className="btn-primary mt-4 w-full">Check out</Link>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
