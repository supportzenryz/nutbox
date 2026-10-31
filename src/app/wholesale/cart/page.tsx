import Link from "next/link";
import { couponAction, placeWholesaleOrderAction, updateCartAction } from "@/app/actions/shop";
import { AddressFields } from "@/components/address-fields";
import { OrderSummary } from "@/components/order-summary";
import { Flash } from "@/components/store-chrome";
import { db } from "@/db";
import { requireWholesale } from "@/lib/auth";
import { readCart, readCoupon } from "@/lib/cart";
import { rupees, weight } from "@/lib/format";
import { buildCheckout } from "@/lib/orders";
import { razorpayEnabled } from "@/lib/razorpay";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wholesale order" };

export default async function WholesaleCart({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const u = await requireWholesale();
  const c = u.company;
  const coupon = await readCoupon("WHOLESALE");
  const sum = await buildCheckout(db, {
    channel: "WHOLESALE",
    items: await readCart("WHOLESALE"),
    priceList: u.priceList ? { id: u.priceList.id, adjustmentBps: u.priceList.adjustmentBps } : null,
    couponCode: coupon,
    shipStateCode: c.stateCode,
  });
  const blocked = sum.lines.some((l) => l.problem);
  const belowMin = sum.tax.taxablePaise < sum.settings.wholesaleMinOrderPaise;
  const onTerms = c.paymentTerms !== "PREPAID";

  return (
    <div className="shell py-8">
      <h1 className="text-3xl font-semibold">Review wholesale order</h1>
      <div className="mt-4 max-w-3xl"><Flash sp={sp} /></div>
      {!sum.lines.length ? (
        <div className="panel mt-6 p-8 text-center">
          <p className="font-semibold">No packs added yet.</p>
          <Link href="/wholesale" className="btn-primary mt-4">Open quick order</Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="space-y-8">
            <div className="panel overflow-x-auto">
              <table className="table">
                <thead>
                  <tr><th>Item</th><th className="text-right">Rate</th><th className="w-40 text-right">Qty</th><th className="text-right">Amount</th></tr>
                </thead>
                <tbody>
                  {sum.lines.map((l) => (
                    <tr key={l.variantId}>
                      <td>
                        <p className="font-medium">{l.productName}</p>
                        <p className="text-xs text-muted">{l.title} · {weight(l.netGrams * l.qty)} · HSN {l.hsnCode}</p>
                        {l.problem && <p className="mt-1 text-xs font-medium text-danger">{l.problem}</p>}
                      </td>
                      <td className="num text-right">{rupees(l.unitPricePaise)}</td>
                      <td className="text-right">
                        <form action={updateCartAction} className="flex justify-end gap-1">
                          <input type="hidden" name="channel" value="WHOLESALE" />
                          <input type="hidden" name="variantId" value={l.variantId} />
                          <label className="sr-only" htmlFor={`q-${l.variantId}`}>Quantity</label>
                          <input id={`q-${l.variantId}`} name="qty" type="number" min={l.minQty} step={l.step} defaultValue={l.qty} className="field num w-20 py-1 text-right" />
                          <button className="btn-ghost btn-sm">Set</button>
                        </form>
                        <form action={updateCartAction}>
                          <input type="hidden" name="channel" value="WHOLESALE" />
                          <input type="hidden" name="variantId" value={l.variantId} />
                          <button name="qty" value="0" className="mt-1 text-xs text-muted underline hover:text-danger">Remove</button>
                        </form>
                      </td>
                      <td className="num text-right">{rupees(l.qty * l.unitPricePaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <form action={placeWholesaleOrderAction} id="ws-checkout" className="space-y-6">
              <section>
                <h2 className="text-lg font-semibold">Deliver to</h2>
                <p className="mb-4 text-sm text-muted">Tax is charged as {sum.intraState ? "CGST + SGST" : "IGST"} based on your registered state. To ship to another state, contact us so the invoice is correct.</p>
                <AddressFields d={{ name: c.legalName, phone: c.phone, line1: c.addressLine, city: c.city, stateCode: c.stateCode, pincode: c.pincode }} lockState />
              </section>
              <section>
                <h2 className="text-lg font-semibold">How you'll pay</h2>
                <div className="mt-3 space-y-2">
                  {onTerms && (
                    <label className="panel flex cursor-pointer items-start gap-3 p-4 has-[:checked]:border-pista">
                      <input type="radio" name="paymentMethod" value="NET_TERMS" defaultChecked className="mt-1 accent-pista" />
                      <span><span className="font-medium">On credit ({c.paymentTerms.replace("NET_", "Net ")} days)</span><span className="block text-sm text-muted">Credit limit {rupees(c.creditLimitPaise)}. We invoice when it ships.</span></span>
                    </label>
                  )}
                  <label className="panel flex cursor-pointer items-start gap-3 p-4 has-[:checked]:border-pista">
                    <input type="radio" name="paymentMethod" value="BANK_TRANSFER" defaultChecked={!onTerms} className="mt-1 accent-pista" />
                    <span><span className="font-medium">Bank transfer (NEFT / RTGS)</span><span className="block text-sm text-muted">We ship once the transfer reaches us.</span></span>
                  </label>
                  {razorpayEnabled() && (
                    <label className="panel flex cursor-pointer items-start gap-3 p-4 has-[:checked]:border-pista">
                      <input type="radio" name="paymentMethod" value="RAZORPAY" className="mt-1 accent-pista" />
                      <span><span className="font-medium">UPI or netbanking now</span></span>
                    </label>
                  )}
                </div>
              </section>
              <div>
                <label htmlFor="note" className="label">Note for our team <span className="font-normal text-muted">(optional)</span></label>
                <textarea id="note" name="note" maxLength={500} rows={2} className="field" placeholder="Delivery window, packing needs, a target price for the quote…" />
              </div>
            </form>
          </div>

          <aside className="panel h-fit p-5 lg:sticky lg:top-4">
            <OrderSummary tax={sum.tax} channel="WHOLESALE" intraState={sum.intraState} coupon={sum.coupon?.code} />
            <p className="mt-2 text-xs text-muted">{weight(sum.totalGrams)} net · freight on {weight(sum.shipGrams)} shipping weight</p>
            {belowMin && <p className="mt-3 rounded bg-saffron-soft px-3 py-2 text-sm">Add {rupees(sum.settings.wholesaleMinOrderPaise - sum.tax.taxablePaise)} more (before GST) to reach the wholesale minimum.</p>}
            <form action={couponAction} className="mt-4 flex gap-2">
              <input type="hidden" name="channel" value="WHOLESALE" />
              <label htmlFor="code" className="sr-only">Coupon code</label>
              <input id="code" name="code" defaultValue={coupon ?? ""} placeholder="Trade code" className="field uppercase" />
              <button className="btn-ghost">Apply</button>
            </form>
            {coupon && sum.couponProblem && <p className="mt-2 text-sm text-danger">{sum.couponProblem}</p>}
            <div className="mt-5 space-y-2">
              <button form="ws-checkout" name="mode" value="order" disabled={blocked || belowMin} className="btn-primary w-full">Place order · {rupees(sum.tax.totalPaise)}</button>
              <button form="ws-checkout" name="mode" value="quote" disabled={blocked || belowMin} className="btn-ghost w-full">Request a quote instead</button>
              <p className="text-xs text-muted">A quote holds no stock and charges nothing. We reply with confirmed prices within one working day.</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
