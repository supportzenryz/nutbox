import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { placeRetailOrderAction } from "@/app/actions/shop";
import { AddressFields } from "@/components/address-fields";
import { OrderSummary } from "@/components/order-summary";
import { Flash } from "@/components/store-chrome";
import { db } from "@/db";
import { addresses } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { readCart, readCoupon } from "@/lib/cart";
import { rupees } from "@/lib/format";
import { buildCheckout } from "@/lib/orders";
import { demoPaymentsEnabled, razorpayEnabled } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Checkout" };

export default async function Checkout({ searchParams }: { searchParams: Promise<{ error?: string; state?: string }> }) {
  const sp = await searchParams;
  const u = await requireUser("/checkout");
  const items = await readCart("RETAIL");
  if (!items.length) redirect("/cart");
  const [addr] = await db.select().from(addresses).where(eq(addresses.userId, u.id)).orderBy(desc(addresses.isDefault));
  const stateCode = sp.state ?? addr?.stateCode;
  const sum = await buildCheckout(db, { channel: "RETAIL", items, couponCode: await readCoupon("RETAIL"), shipStateCode: stateCode });
  if (sum.problems.length) redirect("/cart");
  const codOk = sum.tax.totalPaise <= sum.settings.codLimitPaise;
  const online = razorpayEnabled() || demoPaymentsEnabled();

  return (
    <div className="shell py-8">
      <h1 className="text-3xl font-semibold">Checkout</h1>
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_360px]">
        <form action={placeRetailOrderAction} className="space-y-8">
          <Flash sp={sp} />
          <section>
            <h2 className="text-lg font-semibold">Delivery address</h2>
            <p className="mb-4 text-sm text-muted">GST is charged by delivery state, so the total can change slightly if you ship to another state.</p>
            <AddressFields d={addr ? { ...addr } : { name: u.name, phone: u.phone ?? "" }} />
            {!addr && (
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" name="saveAddress" defaultChecked className="h-4 w-4 accent-pista" /> Save this address for next time
              </label>
            )}
          </section>

          <section>
            <h2 className="text-lg font-semibold">Payment</h2>
            <div className="mt-3 space-y-2">
              {online && (
                <label className="panel flex cursor-pointer items-start gap-3 p-4 has-[:checked]:border-pista">
                  <input type="radio" name="paymentMethod" value="RAZORPAY" defaultChecked className="mt-1 accent-pista" />
                  <span>
                    <span className="font-medium">UPI, card or netbanking</span>
                    <span className="block text-sm text-muted">
                      {razorpayEnabled() ? "Secure payment by Razorpay on the next screen." : "Demo mode: no gateway keys set, so you'll confirm a simulated payment."}
                    </span>
                  </span>
                </label>
              )}
              <label className={`panel flex items-start gap-3 p-4 has-[:checked]:border-pista ${codOk ? "cursor-pointer" : "opacity-60"}`}>
                <input type="radio" name="paymentMethod" value="COD" disabled={!codOk} defaultChecked={!online} className="mt-1 accent-pista" />
                <span>
                  <span className="font-medium">Cash on delivery</span>
                  <span className="block text-sm text-muted">
                    {codOk ? "Pay in cash or UPI when it arrives. No extra fee." : `Available on orders up to ${rupees(sum.settings.codLimitPaise)}.`}
                  </span>
                </span>
              </label>
            </div>
          </section>

          <section>
            <label htmlFor="note" className="label">Delivery note <span className="font-normal text-muted">(optional)</span></label>
            <input id="note" name="note" maxLength={200} className="field" placeholder="E.g. leave with the security desk" />
          </section>

          <button className="btn-primary w-full py-3 text-base sm:w-auto sm:px-10">Place order · {rupees(sum.tax.totalPaise)}</button>
          <p className="text-xs text-muted">
            By placing this order you agree to our <Link href="/policies" className="link">terms, shipping and returns policy</Link>. We use your details only to deliver this order unless you opted in to offers.
          </p>
        </form>

        <aside className="panel h-fit p-5">
          <h2 className="mb-3 font-semibold">{sum.lines.length} item{sum.lines.length > 1 ? "s" : ""}</h2>
          <ul className="mb-4 space-y-2 text-sm">
            {sum.lines.map((l) => (
              <li key={l.variantId} className="flex justify-between gap-3">
                <span>{l.productName} <span className="text-muted">{l.title} × {l.qty}</span></span>
                <span className="num">{rupees(l.qty * l.unitPricePaise)}</span>
              </li>
            ))}
          </ul>
          <OrderSummary tax={sum.tax} channel="RETAIL" intraState={sum.intraState} coupon={sum.coupon?.code} />
        </aside>
      </div>
    </div>
  );
}
