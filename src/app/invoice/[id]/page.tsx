import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { currentUser, isStaff } from "@/lib/auth";
import { dateIN, orderNo, pct, rupees2 } from "@/lib/format";
import { getOrderFull } from "@/lib/order-view";
import { getSettings } from "@/lib/settings";
import { stateName } from "@/lib/states";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tax invoice", robots: { index: false } };

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function words(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${words(n % 100)}` : ""}`;
  if (n < 100000) return `${words(Math.floor(n / 1000))} Thousand${n % 1000 ? ` ${words(n % 1000)}` : ""}`;
  if (n < 10000000) return `${words(Math.floor(n / 100000))} Lakh${n % 100000 ? ` ${words(n % 100000)}` : ""}`;
  return `${words(Math.floor(n / 10000000))} Crore${n % 10000000 ? ` ${words(n % 10000000)}` : ""}`;
}
const amountInWords = (paise: number) => {
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return `Rupees ${words(r) || "Zero"}${p ? ` and ${words(p)} Paise` : ""} Only`;
};

export default async function Invoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  const o = await getOrderFull(id);
  if (!o || !u || (o.userId !== u.id && !isStaff(u))) notFound();
  const s = await getSettings();
  const intra = o.supplyType === "INTRA";
  const issued = Boolean(o.invoiceNo);

  // HSN summary (required on B2B invoices; useful on all).
  const hsn = new Map<string, { taxable: number; tax: number; rate: number }>();
  for (const l of o.lines) {
    const k = `${l.hsnCode}@${l.gstRateBps}`;
    const cur = hsn.get(k) ?? { taxable: 0, tax: 0, rate: l.gstRateBps };
    hsn.set(k, { ...cur, taxable: cur.taxable + l.taxablePaise, tax: cur.tax + l.taxPaise });
  }
  const shipTaxable = o.taxablePaise - o.lines.reduce((a, l) => a + l.taxablePaise, 0);
  const shipTax = o.cgstPaise + o.sgstPaise + o.igstPaise - o.lines.reduce((a, l) => a + l.taxPaise, 0);

  return (
    <div className="min-h-screen bg-paper py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-3 flex max-w-[820px] justify-end gap-2 px-4 print:hidden">
        <PrintButton />
      </div>
      <article className="mx-auto max-w-[820px] border border-line bg-white p-8 text-[13px] leading-snug print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-4">
          <div>
            <p className="stamp text-3xl text-pista">NUTBOX</p>
            <p className="mt-1 font-semibold">{s.legalName}</p>
            <p>{s.addressLine}, {s.city} {s.pincode}</p>
            <p>{stateName(s.stateCode)} (State code {s.stateCode})</p>
            <p>GSTIN <b>{s.gstin}</b> · FSSAI {s.fssaiLicence}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">{issued ? "TAX INVOICE" : o.status === "QUOTE" ? "QUOTATION" : "PROFORMA INVOICE"}</p>
            {issued && <p className="text-xs">Original for recipient</p>}
            <table className="ml-auto mt-2 text-left">
              <tbody>
                {issued && <tr><td className="pr-3 text-muted">Invoice no.</td><td className="font-semibold">{o.invoiceNo}</td></tr>}
                {issued && <tr><td className="pr-3 text-muted">Invoice date</td><td>{dateIN(o.invoicedAt)}</td></tr>}
                <tr><td className="pr-3 text-muted">Order</td><td>{orderNo(o.number)} · {dateIN(o.createdAt)}</td></tr>
                <tr><td className="pr-3 text-muted">Place of supply</td><td>{stateName(o.shipStateCode)} ({o.shipStateCode})</td></tr>
                <tr><td className="pr-3 text-muted">Reverse charge</td><td>No</td></tr>
              </tbody>
            </table>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-6 border-b border-line py-4">
          <div>
            <p className="text-xs font-semibold text-muted">Bill to</p>
            <p className="font-semibold">{o.buyerLegalName ?? o.user.name}</p>
            {o.company ? (
              <p>{o.company.addressLine}, {o.company.city} {o.company.pincode}, {stateName(o.company.stateCode)}</p>
            ) : (
              <p>{o.shipLine1}{o.shipLine2 ? `, ${o.shipLine2}` : ""}, {o.shipCity} {o.shipPincode}</p>
            )}
            <p>{o.buyerGstin ? <>GSTIN <b>{o.buyerGstin}</b></> : "Unregistered (B2C)"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted">Ship to</p>
            <p className="font-semibold">{o.shipName}</p>
            <p>{o.shipLine1}{o.shipLine2 ? `, ${o.shipLine2}` : ""}, {o.shipCity} {o.shipPincode}</p>
            <p>{stateName(o.shipStateCode)} · {o.phone}</p>
          </div>
        </section>

        <table className="mt-4 w-full border-collapse text-left">
          <thead>
            <tr className="border-y border-ink text-xs">
              <th className="py-1.5 pr-2">#</th>
              <th className="py-1.5 pr-2">Description</th>
              <th className="py-1.5 pr-2">HSN</th>
              <th className="py-1.5 pr-2 text-right">Qty</th>
              <th className="py-1.5 pr-2 text-right">Rate</th>
              <th className="py-1.5 pr-2 text-right">Discount</th>
              <th className="py-1.5 pr-2 text-right">Taxable</th>
              <th className="py-1.5 pr-2 text-right">GST</th>
              <th className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {o.lines.map((l, i) => (
              <tr key={l.id} className="border-b border-line align-top">
                <td className="py-1.5 pr-2">{i + 1}</td>
                <td className="py-1.5 pr-2">{l.title}<span className="block text-[11px] text-muted">SKU {l.sku}</span></td>
                <td className="py-1.5 pr-2">{l.hsnCode}</td>
                <td className="num py-1.5 pr-2 text-right">{l.qty} Nos</td>
                <td className="num py-1.5 pr-2 text-right">{rupees2(o.channel === "RETAIL" ? Math.round((l.unitPricePaise * 10000) / (10000 + l.gstRateBps)) : l.unitPricePaise)}</td>
                <td className="num py-1.5 pr-2 text-right">{l.discountPaise ? rupees2(o.channel === "RETAIL" ? Math.round((l.discountPaise * 10000) / (10000 + l.gstRateBps)) : l.discountPaise) : "—"}</td>
                <td className="num py-1.5 pr-2 text-right">{rupees2(l.taxablePaise)}</td>
                <td className="num py-1.5 pr-2 text-right">{pct(l.gstRateBps)}<span className="block text-[11px] text-muted">{rupees2(l.taxPaise)}</span></td>
                <td className="num py-1.5 text-right">{rupees2(l.totalPaise)}</td>
              </tr>
            ))}
            {o.shippingPaise > 0 && (
              <tr className="border-b border-line">
                <td className="py-1.5 pr-2">{o.lines.length + 1}</td>
                <td className="py-1.5 pr-2" colSpan={5}>{o.channel === "RETAIL" ? "Delivery charges" : "Freight"} (composite supply, taxed at principal rate)</td>
                <td className="num py-1.5 pr-2 text-right">{rupees2(shipTaxable)}</td>
                <td className="num py-1.5 pr-2 text-right">{rupees2(shipTax)}</td>
                <td className="num py-1.5 text-right">{rupees2(shipTaxable + shipTax)}</td>
              </tr>
            )}
          </tbody>
        </table>
        {o.channel === "RETAIL" && <p className="mt-1 text-[11px] text-muted">Rates shown exclusive of GST; prices paid were inclusive of GST.</p>}

        <section className="mt-4 grid grid-cols-[1fr_260px] gap-6">
          <div>
            <p className="text-xs font-semibold text-muted">HSN summary</p>
            <table className="mt-1 w-full text-left">
              <thead><tr className="border-b border-line text-xs"><th className="py-1">HSN</th><th className="py-1 text-right">Taxable</th><th className="py-1 text-right">Rate</th><th className="py-1 text-right">{intra ? "CGST + SGST" : "IGST"}</th></tr></thead>
              <tbody>
                {[...hsn.entries()].map(([k, v]) => (
                  <tr key={k}><td className="py-1">{k.split("@")[0]}</td><td className="num py-1 text-right">{rupees2(v.taxable)}</td><td className="num py-1 text-right">{pct(v.rate)}</td><td className="num py-1 text-right">{rupees2(v.tax)}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3"><span className="text-muted">Amount in words:</span> {amountInWords(o.totalPaise)}</p>
          </div>
          <dl className="space-y-1">
            <div className="flex justify-between"><dt>Taxable value</dt><dd className="num">{rupees2(o.taxablePaise)}</dd></div>
            {intra ? (
              <>
                <div className="flex justify-between"><dt>CGST</dt><dd className="num">{rupees2(o.cgstPaise)}</dd></div>
                <div className="flex justify-between"><dt>SGST</dt><dd className="num">{rupees2(o.sgstPaise)}</dd></div>
              </>
            ) : (
              <div className="flex justify-between"><dt>IGST</dt><dd className="num">{rupees2(o.igstPaise)}</dd></div>
            )}
            <div className="flex justify-between border-t-2 border-ink pt-1 text-base font-bold"><dt>Invoice total</dt><dd className="num">{rupees2(o.totalPaise)}</dd></div>
          </dl>
        </section>

        <footer className="mt-8 grid grid-cols-2 gap-6 border-t border-line pt-4 text-[11px] text-muted">
          <div>
            <p>Goods once sold are subject to our returns policy. Food products: check best-before on each pack.</p>
            {o.dueDate && <p className="mt-1 text-ink">Payment due by {dateIN(o.dueDate)}. {s.bankDetails}</p>}
            {o.awb && <p className="mt-1">Dispatched via {o.courier}, AWB {o.awb}.</p>}
          </div>
          <div className="text-right">
            <p>For {s.legalName}</p>
            <p className="mt-8">Authorised signatory</p>
            <p className="mt-1">This is a computer-generated invoice.</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
