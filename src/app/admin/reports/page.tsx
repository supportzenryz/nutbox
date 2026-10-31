import { PageHead } from "@/components/admin-ui";
import { dateIN, orderNo, pct, rupees2 } from "@/lib/format";
import { currentMonth, gstReport } from "@/lib/gst-report";
import { stateName } from "@/lib/states";

export const metadata = { title: "GST reports" };

export default async function Reports({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth();
  const r = await gstReport(month);
  return (
    <>
      <PageHead title="GST reports" sub="Invoices issued in the month, grouped for GSTR-1. Hand the CSV to your CA or upload through your GSP.">
        <form className="flex items-end gap-2">
          <div><label htmlFor="month" className="label">Month</label><input id="month" name="month" type="month" defaultValue={month} className="field" /></div>
          <button className="btn-ghost">Show</button>
        </form>
        <a href={`/admin/reports/gstr1?month=${month}`} className="btn-primary self-end">Download CSV</a>
      </PageHead>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="panel p-4"><p className="text-sm text-muted">B2B invoices (table 4)</p><p className="num mt-1 text-xl font-semibold">{r.b2b.length} · {rupees2(r.totals.b2b.taxable)} taxable</p><p className="num text-sm text-muted">{rupees2(r.totals.b2b.tax)} GST</p></div>
        <div className="panel p-4"><p className="text-sm text-muted">B2C supplies (tables 5 & 7)</p><p className="num mt-1 text-xl font-semibold">{rupees2(r.totals.b2c.taxable)} taxable</p><p className="num text-sm text-muted">{rupees2(r.totals.b2c.tax)} GST</p></div>
      </div>
      <section className="panel mt-6 overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">B2B invoices</h2>
        <table className="table mt-2 min-w-[820px]">
          <thead><tr><th>Invoice</th><th>Date</th><th>Buyer GSTIN</th><th>Place of supply</th><th className="text-right">Taxable</th><th className="text-right">IGST</th><th className="text-right">CGST</th><th className="text-right">SGST</th><th className="text-right">Total</th></tr></thead>
          <tbody>{r.b2b.map((o) => (
            <tr key={o.id}><td>{o.invoiceNo}<span className="block text-xs text-muted">{orderNo(o.number)}{o.status === "CANCELLED" ? " · cancelled" : ""}</span></td><td>{dateIN(o.invoicedAt)}</td><td className="font-mono text-xs">{o.buyerGstin}</td><td>{o.shipStateCode}-{stateName(o.shipStateCode)}</td><td className="num text-right">{rupees2(o.taxablePaise)}</td><td className="num text-right">{rupees2(o.igstPaise)}</td><td className="num text-right">{rupees2(o.cgstPaise)}</td><td className="num text-right">{rupees2(o.sgstPaise)}</td><td className="num text-right">{rupees2(o.totalPaise)}</td></tr>
          ))}</tbody>
        </table>
        {!r.b2b.length && <p className="px-4 pb-4 text-sm text-muted">No B2B invoices this month.</p>}
      </section>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="panel overflow-x-auto">
          <h2 className="px-4 pt-4 font-semibold">B2C by place of supply</h2>
          <table className="table mt-2"><thead><tr><th>State</th><th>Type</th><th className="text-right">Invoices</th><th className="text-right">Taxable</th><th className="text-right">Tax</th></tr></thead>
            <tbody>{r.b2cStates.map((s) => (<tr key={s.state}><td>{stateName(s.state)}</td><td>{s.supply === "INTRA" ? "Intra" : "Inter"}</td><td className="num text-right">{s.n}</td><td className="num text-right">{rupees2(s.taxable)}</td><td className="num text-right">{rupees2(s.cgst + s.sgst + s.igst)}</td></tr>))}</tbody></table>
        </section>
        <section className="panel overflow-x-auto">
          <h2 className="px-4 pt-4 font-semibold">HSN summary (table 12)</h2>
          <table className="table mt-2"><thead><tr><th>HSN</th><th>Rate</th><th className="text-right">Qty (kg)</th><th className="text-right">Taxable</th><th className="text-right">Tax</th></tr></thead>
            <tbody>{r.hsn.map((h) => (<tr key={h.hsn + h.rate}><td>{h.hsn}</td><td>{pct(h.rate)}</td><td className="num text-right">{h.qtyKg.toFixed(2)}</td><td className="num text-right">{rupees2(h.taxable)}</td><td className="num text-right">{rupees2(h.tax)}</td></tr>))}</tbody></table>
          <p className="px-4 pb-4 text-xs text-muted">Goods only; freight is reported with the invoice value.</p>
        </section>
      </div>
    </>
  );
}
