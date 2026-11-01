import Link from "next/link";
import { notFound } from "next/navigation";
import { PayButton } from "@/components/pay-button";
import { PAYMENT_METHOD_LABEL, Status } from "@/components/status";
import { Flash } from "@/components/store-chrome";
import { UpiPay } from "@/components/upi-pay";
import { requireUser } from "@/lib/auth";
import { dateIN, orderNo, rupees, rupees2, weight } from "@/lib/format";
import { getOrderFull } from "@/lib/order-view";
import { getSettings } from "@/lib/settings";
import { stateName } from "@/lib/states";

export const dynamic = "force-dynamic";

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ placed?: string; error?: string; ok?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const u = await requireUser(`/account/orders/${id}`);
  const o = await getOrderFull(id);
  if (!o || o.userId !== u.id) notFound();
  const s = await getSettings();
  const awaitingPay = o.status === "OPEN" && o.paymentStatus === "PENDING";
  const needsOnlinePay = awaitingPay && o.paymentMethod === "RAZORPAY";
  const needsUpi = awaitingPay && o.paymentMethod === "UPI";
  const wholesale = o.channel === "WHOLESALE";

  return (
    <div className="shell max-w-4xl py-8">
      <Link href="/account" className="text-sm text-muted hover:text-ink">All orders</Link>
      <div className="mt-4"><Flash sp={sp} /></div>
      {sp.placed && !sp.ok && !sp.error && (
        <div role="status" className="mt-4 rounded border border-pista/20 bg-pista-soft p-4">
          <p className="font-semibold text-pista-deep">
            {o.status === "QUOTE" ? "Quote request sent." : needsOnlinePay || (needsUpi && !o.upiRef) ? "Order created — complete payment to confirm it." : "Order placed. Thank you!"}
          </p>
          <p className="mt-1 text-sm text-pista-deep/80">
            {o.status === "QUOTE"
              ? "Our team will review prices and stock and confirm within one working day. Nothing is charged until you accept."
              : "We've reserved your stock. You'll get an email with tracking once it ships."}
          </p>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Order {orderNo(o.number)}</h1>
          <p className="text-sm text-muted">Placed {dateIN(o.createdAt, true)}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Status value={o.status === "OPEN" ? o.fulfillmentStatus : o.status} />
            {o.status !== "QUOTE" && <Status value={o.paymentStatus} />}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {needsOnlinePay && <PayButton orderId={o.id} label={`Pay ${rupees(o.totalPaise)}`} upiOnly={!wholesale} />}
          {o.invoiceNo && <Link href={`/invoice/${o.id}`} className="btn-ghost btn-sm">Tax invoice {o.invoiceNo}</Link>}
        </div>
      </div>

      {needsUpi && (s.upiId ? (
        <UpiPay order={o} upiId={s.upiId} payeeName={s.upiPayeeName || s.storeName} />
      ) : (
        <p className="panel mt-6 p-4 text-sm">UPI payment details are being updated. Please contact {s.supportPhone} to pay for this order.</p>
      ))}

      {wholesale && o.paymentMethod === "BANK_TRANSFER" && o.paymentStatus === "PENDING" && o.status === "OPEN" && (
        <div className="panel mt-6 p-4 text-sm">
          <p className="font-semibold">Pay by bank transfer</p>
          <p className="mt-1 text-muted">{s.bankDetails}</p>
          <p className="mt-1 text-muted">Use <span className="font-semibold text-ink">{orderNo(o.number)}</span> as the payment reference. We ship once the transfer is received.</p>
        </div>
      )}
      {o.dueDate && o.paymentStatus === "PENDING" && (
        <p className="mt-4 text-sm">Payment due by <span className="font-semibold">{dateIN(o.dueDate)}</span> on your credit terms.</p>
      )}

      <div className="panel mt-6 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="text-right">Qty</th>
              <th className="text-right">{wholesale ? "Rate (excl. GST)" : "Price"}</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {o.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.title}<span className="block text-xs text-muted">{weight(l.netGrams * l.qty)} total</span></td>
                <td className="num text-right">{l.qty}</td>
                <td className="num text-right">{rupees2(l.unitPricePaise)}</td>
                <td className="num text-right">{rupees2(l.qty * l.unitPricePaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="ml-auto max-w-xs space-y-1 p-4 text-sm">
          {o.discountPaise > 0 && <div className="flex justify-between"><dt>Discount {o.couponCode}</dt><dd className="num">− {rupees2(o.discountPaise)}</dd></div>}
          <div className="flex justify-between"><dt>{wholesale ? "Freight" : "Delivery"}</dt><dd className="num">{o.shippingPaise ? rupees2(o.shippingPaise) : "Free"}</dd></div>
          <div className="flex justify-between text-muted"><dt>Taxable value</dt><dd className="num">{rupees2(o.taxablePaise)}</dd></div>
          {o.supplyType === "INTRA" ? (
            <>
              <div className="flex justify-between text-muted"><dt>CGST</dt><dd className="num">{rupees2(o.cgstPaise)}</dd></div>
              <div className="flex justify-between text-muted"><dt>SGST</dt><dd className="num">{rupees2(o.sgstPaise)}</dd></div>
            </>
          ) : (
            <div className="flex justify-between text-muted"><dt>IGST</dt><dd className="num">{rupees2(o.igstPaise)}</dd></div>
          )}
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd className="num">{rupees2(o.totalPaise)}</dd></div>
        </dl>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="panel p-4 text-sm">
          <p className="font-semibold">Delivering to</p>
          <p className="mt-1 text-muted">
            {o.shipName}<br />{o.shipLine1}{o.shipLine2 ? `, ${o.shipLine2}` : ""}<br />{o.shipCity} {o.shipPincode}, {stateName(o.shipStateCode)}<br />{o.phone}
          </p>
          {o.awb && <p className="mt-2">Tracking: <span className="font-medium">{o.courier} {o.awb}</span></p>}
        </div>
        <div className="panel p-4 text-sm">
          <p className="font-semibold">Payment</p>
          <p className="mt-1 text-muted">{PAYMENT_METHOD_LABEL[o.paymentMethod]}</p>
          <p className="mt-3 font-semibold">History</p>
          <ol className="mt-1 space-y-1 text-muted">
            {o.events.map((e) => (
              <li key={e.id}><span className="text-ink">{dateIN(e.createdAt, true)}</span> — {e.message}</li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
