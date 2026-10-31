import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { orderAction } from "@/app/actions/admin";
import { PageHead } from "@/components/admin-ui";
import { PAYMENT_METHOD_LABEL, Status } from "@/components/status";
import { Flash } from "@/components/store-chrome";
import { db } from "@/db";
import { inventoryItems, lots, stockMovements } from "@/db/schema";
import { dateIN, orderNo, rupees2, weight } from "@/lib/format";
import { getOrderFull } from "@/lib/order-view";
import { stateName } from "@/lib/states";
import { needsEwayBill } from "@/lib/tax";

export const metadata = { title: "Order" };

function Act({ id, op, label, tone = "primary", children }: { id: string; op: string; label: string; tone?: "primary" | "ghost" | "danger"; children?: React.ReactNode }) {
  return (
    <form action={orderAction} className="space-y-2">
      <input type="hidden" name="orderId" value={id} />
      <input type="hidden" name="op" value={op} />
      {children}
      <button className={`${tone === "primary" ? "btn-primary" : tone === "danger" ? "btn-danger" : "btn-ghost"} w-full`}>{label}</button>
    </form>
  );
}

export default async function AdminOrder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const o = await getOrderFull(id);
  if (!o) notFound();
  const picks = await db
    .select({ id: stockMovements.id, reason: stockMovements.reason, delta: stockMovements.deltaOnHand, reserved: stockMovements.deltaReserved, lotNo: lots.lotNo, expiresOn: lots.expiresOn, item: inventoryItems.name, at: stockMovements.createdAt })
    .from(stockMovements)
    .innerJoin(inventoryItems, eq(inventoryItems.id, stockMovements.itemId))
    .leftJoin(lots, eq(lots.id, stockMovements.lotId))
    .where(and(eq(stockMovements.refType, "ORDER"), eq(stockMovements.refId, id)))
    .orderBy(stockMovements.createdAt);
  const isQuote = o.status === "QUOTE";
  const open = o.status === "OPEN";
  const unshipped = o.fulfillmentStatus === "UNFULFILLED";
  const prepaid = o.paymentMethod === "RAZORPAY" || o.paymentMethod === "BANK_TRANSFER";
  const eway = needsEwayBill(o.totalPaise, o.supplyType);

  return (
    <>
      <Link href="/admin/orders" className="text-sm text-muted hover:text-ink">Orders</Link>
      <PageHead title={`${isQuote ? "Quote" : "Order"} ${orderNo(o.number)}`} sub={`${dateIN(o.createdAt, true)} · ${o.channel === "RETAIL" ? "Retail store" : "Wholesale portal"}`}>
        <Status value={o.channel} />
        {isQuote ? <Status value="QUOTE" /> : <><Status value={o.status === "CANCELLED" ? "CANCELLED" : o.fulfillmentStatus} /><Status value={o.paymentStatus} /></>}
      </PageHead>
      <Flash sp={sp} />
      {eway && !isQuote && o.status !== "CANCELLED" && (
        <div className="mb-4 rounded border border-saffron/60 bg-saffron-soft px-4 py-3 text-sm">
          <b>E-way bill required.</b> Inter-state consignment above ₹50,000 — generate it on the e-way bill portal against invoice {o.invoiceNo ?? "(issued at shipping)"} before dispatch.
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <form action={orderAction} id="quote-form" className="panel overflow-x-auto">
            <input type="hidden" name="orderId" value={o.id} />
            <input type="hidden" name="op" value="approve" />
            <table className="table">
              <thead>
                <tr><th>Item</th><th>HSN</th><th className="text-right">Qty</th><th className="text-right">{o.channel === "RETAIL" ? "Price (incl. GST)" : "Rate (excl. GST)"}</th><th className="text-right">Taxable</th><th className="text-right">GST</th><th className="text-right">Total</th></tr>
              </thead>
              <tbody>
                {o.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.title}<span className="block text-xs text-muted">{l.sku} · {weight(l.netGrams * l.qty)}</span></td>
                    <td>{l.hsnCode}</td>
                    <td className="num text-right">{l.qty}</td>
                    <td className="num text-right">
                      {isQuote ? (
                        <>
                          <label className="sr-only" htmlFor={`price_${l.id}`}>Negotiated rate for {l.title}</label>
                          <input id={`price_${l.id}`} name={`price_${l.id}`} defaultValue={(l.unitPricePaise / 100).toFixed(2)} inputMode="decimal" className="field num w-28 py-1 text-right" />
                        </>
                      ) : rupees2(l.unitPricePaise)}
                    </td>
                    <td className="num text-right">{rupees2(l.taxablePaise)}</td>
                    <td className="num text-right">{rupees2(l.taxPaise)}</td>
                    <td className="num text-right">{rupees2(l.totalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto max-w-xs space-y-1 p-4 text-sm">
              {o.discountPaise > 0 && <div className="flex justify-between"><dt>Discount ({o.couponCode})</dt><dd className="num">− {rupees2(o.discountPaise)}</dd></div>}
              <div className="flex justify-between"><dt>{o.channel === "RETAIL" ? "Delivery" : "Freight"}</dt><dd className="num">{rupees2(o.shippingPaise)}</dd></div>
              <div className="flex justify-between"><dt>Taxable value</dt><dd className="num">{rupees2(o.taxablePaise)}</dd></div>
              {o.supplyType === "INTRA" ? (
                <><div className="flex justify-between"><dt>CGST</dt><dd className="num">{rupees2(o.cgstPaise)}</dd></div><div className="flex justify-between"><dt>SGST</dt><dd className="num">{rupees2(o.sgstPaise)}</dd></div></>
              ) : (
                <div className="flex justify-between"><dt>IGST</dt><dd className="num">{rupees2(o.igstPaise)}</dd></div>
              )}
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold"><dt>Total</dt><dd className="num">{rupees2(o.totalPaise)}</dd></div>
            </dl>
          </form>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="panel p-4 text-sm">
              <p className="font-semibold">{o.company ? "Business" : "Customer"}</p>
              {o.company ? (
                <p className="mt-1">
                  <Link href={`/admin/companies/${o.company.id}`} className="link">{o.company.legalName}</Link>
                  <br />GSTIN {o.buyerGstin ?? "—"}<br />{o.user.name} · {o.email}
                </p>
              ) : (
                <p className="mt-1">{o.user.name}<br />{o.email} · {o.phone}</p>
              )}
              <p className="mt-3 font-semibold">Ship to</p>
              <p className="mt-1 text-muted">{o.shipName}<br />{o.shipLine1}{o.shipLine2 ? `, ${o.shipLine2}` : ""}<br />{o.shipCity} {o.shipPincode}, {stateName(o.shipStateCode)}<br />{o.phone}</p>
              <p className="mt-3 text-xs text-muted">Supply: {o.supplyType === "INTRA" ? "intra-state (CGST + SGST)" : "inter-state (IGST)"} · place of supply {stateName(o.shipStateCode)}</p>
              {o.customerNote && <p className="mt-3 rounded bg-saffron-soft p-2">Note: {o.customerNote}</p>}
            </div>
            <div className="panel p-4 text-sm">
              <p className="font-semibold">Payment</p>
              <p className="mt-1 text-muted">{PAYMENT_METHOD_LABEL[o.paymentMethod]}{o.razorpayPaymentId ? ` · ${o.razorpayPaymentId}` : ""}</p>
              {o.dueDate && <p className="mt-1">Due {dateIN(o.dueDate)}{o.paymentStatus === "PENDING" && o.dueDate < new Date() ? <span className="ml-1 font-semibold text-danger">overdue</span> : null}</p>}
              <p className="mt-3 font-semibold">Fulfilment</p>
              <p className="mt-1 text-muted">
                {o.awb ? `${o.courier} · AWB ${o.awb}` : "Not shipped yet"}
                {o.shippedAt && <><br />Shipped {dateIN(o.shippedAt, true)}</>}
                {o.deliveredAt && <><br />Delivered {dateIN(o.deliveredAt, true)}</>}
              </p>
              {(o.invoiceNo || !isQuote) && (
                <p className="mt-3"><Link href={`/invoice/${o.id}`} className="link" target="_blank">{o.invoiceNo ? `Tax invoice ${o.invoiceNo}` : "Proforma invoice"}</Link></p>
              )}
            </div>
          </div>

          <div className="panel">
            <h2 className="px-4 pt-4 font-semibold">Stock movements for this order</h2>
            <p className="px-4 text-xs text-muted">Reserved at order; picked first-expiry-first-out at shipping.</p>
            {picks.length ? (
              <table className="table mt-2">
                <tbody>
                  {picks.map((p) => (
                    <tr key={p.id}>
                      <td className="text-xs text-muted">{dateIN(p.at, true)}</td>
                      <td><Status value={p.reason === "SALE" ? "SHIPPED" : p.reason === "RETURN" ? "RETURNED" : p.reason === "RELEASE" ? "VOIDED" : "OPEN"} label={p.reason.toLowerCase()} /></td>
                      <td>{p.item}{p.lotNo && <span className="block text-xs text-muted">Lot {p.lotNo} · best before {dateIN(p.expiresOn)}</span>}</td>
                      <td className="num text-right">{weight(Math.abs(p.delta || p.reserved))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="px-4 py-3 text-sm text-muted">No stock has moved — quotes reserve nothing until approved.</p>}
          </div>
        </div>

        <aside className="space-y-4">
          <div className="panel space-y-4 p-4">
            <h2 className="font-semibold">Next step</h2>
            {isQuote && (
              <>
                <p className="text-sm text-muted">Edit any rate in the table, then approve. Approval recalculates GST and reserves stock; the buyer is notified with the confirmed total.</p>
                <button form="quote-form" className="btn-primary w-full">Approve quote & reserve stock</button>
                <Act id={o.id} op="cancel" label="Decline quote" tone="danger">
                  <label htmlFor="reason-q" className="label">Reason</label>
                  <input id="reason-q" name="reason" className="field" placeholder="E.g. price not workable" />
                </Act>
              </>
            )}
            {open && o.paymentStatus === "PENDING" && (o.paymentMethod !== "COD" || o.fulfillmentStatus !== "UNFULFILLED") && (
              <Act id={o.id} op="paid" label="Record payment" tone={prepaid && unshipped ? "primary" : "ghost"}>
                <label htmlFor="ref" className="label">Reference</label>
                <input id="ref" name="reference" className="field" placeholder="UTR / UPI ref / cheque no." />
              </Act>
            )}
            {open && unshipped && (!prepaid || o.paymentStatus === "PAID") && (
              <Act id={o.id} op="ship" label="Mark shipped & issue invoice">
                <div className="grid grid-cols-2 gap-2">
                  <div><label htmlFor="courier" className="label">Courier</label><input id="courier" name="courier" className="field" placeholder="Delhivery" /></div>
                  <div><label htmlFor="awb" className="label">AWB</label><input id="awb" name="awb" className="field" /></div>
                </div>
              </Act>
            )}
            {open && unshipped && prepaid && o.paymentStatus !== "PAID" && <p className="text-sm text-muted">Prepaid order: shipping unlocks once payment is recorded.</p>}
            {o.fulfillmentStatus === "SHIPPED" && <Act id={o.id} op="delivered" label={o.paymentMethod === "COD" && o.paymentStatus === "PENDING" ? "Mark delivered (COD collected)" : "Mark delivered"} />}
            {o.fulfillmentStatus === "SHIPPED" && (
              <Act id={o.id} op="return" label="Returned to origin — restock" tone="ghost">
                <label htmlFor="reason-r" className="label">Reason</label>
                <input id="reason-r" name="reason" className="field" placeholder="E.g. customer unreachable" />
              </Act>
            )}
            {open && unshipped && (
              <Act id={o.id} op="cancel" label="Cancel order & release stock" tone="danger">
                <label htmlFor="reason-c" className="label">Reason</label>
                <input id="reason-c" name="reason" className="field" placeholder="E.g. customer request" />
                {o.paymentStatus === "PAID" && <p className="text-xs text-danger">Paid order — issue the refund in your gateway or bank after cancelling.</p>}
              </Act>
            )}
            {open && o.fulfillmentStatus === "DELIVERED" && o.paymentStatus === "PAID" && <Act id={o.id} op="archive" label="Archive" tone="ghost" />}
            {(o.status === "CANCELLED" || o.status === "ARCHIVED" || o.fulfillmentStatus === "RETURNED") && <p className="text-sm text-muted">This order is closed.</p>}
          </div>

          <div className="panel p-4">
            <h2 className="font-semibold">Timeline</h2>
            <ol className="mt-3 space-y-3 border-l border-line pl-4 text-sm">
              {[...o.events].reverse().map((e) => (
                <li key={e.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-pista" />
                  <p>{e.message}</p>
                  <p className="text-xs text-muted">{dateIN(e.createdAt, true)}{e.actor ? ` · ${e.actor}` : ""}</p>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </>
  );
}
