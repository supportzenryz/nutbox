import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { companyAction } from "@/app/actions/admin";
import { PageHead } from "@/components/admin-ui";
import { Status } from "@/components/status";
import { Flash } from "@/components/store-chrome";
import { db } from "@/db";
import { companies, orders, priceLists, users } from "@/db/schema";
import { dateIN, orderNo, rupees } from "@/lib/format";
import { validateGstin } from "@/lib/gstin";
import { stateName } from "@/lib/states";

export const metadata = { title: "Wholesale account" };

export default async function Company({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [[c], lists, people, history] = await Promise.all([
    db.select().from(companies).where(eq(companies.id, id)),
    db.select().from(priceLists),
    db.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.companyId, id)),
    db.select().from(orders).where(eq(orders.companyId, id)).orderBy(desc(orders.createdAt)).limit(20),
  ]);
  if (!c) notFound();
  const g = c.gstin ? validateGstin(c.gstin) : null;
  return (
    <>
      <Link href="/admin/companies" className="text-sm text-muted hover:text-ink">Wholesale accounts</Link>
      <PageHead title={c.legalName} sub={`${c.businessType} · ${c.city}, ${stateName(c.stateCode)}`}><Status value={c.status} /></PageHead>
      <Flash sp={sp} />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="panel p-4 text-sm">
            <h2 className="font-semibold">Verification</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><dt className="text-muted">GSTIN</dt><dd className="font-mono">{c.gstin ?? "Not registered — collect shop licence / Udyam"}</dd></div>
              <div><dt className="text-muted">Format & checksum</dt><dd>{g ? (g.ok ? <span className="text-pista">Valid · PAN {g.pan}</span> : <span className="text-danger">{g.error}</span>) : "—"}</dd></div>
              <div><dt className="text-muted">GSTIN state matches address</dt><dd>{g?.ok ? (g.stateCode === c.stateCode ? "Yes" : <span className="text-danger">No</span>) : "—"}</dd></div>
              <div><dt className="text-muted">Live registration</dt><dd><a className="link" href="https://services.gst.gov.in/services/searchtp" target="_blank" rel="noreferrer">Check on GST portal</a> <span className="text-xs text-muted">(or connect a GSP API)</span></dd></div>
              <div className="sm:col-span-2"><dt className="text-muted">Address</dt><dd>{c.addressLine}, {c.city} {c.pincode} · {c.phone}</dd></div>
            </dl>
          </section>
          <section className="panel">
            <h2 className="px-4 pt-4 font-semibold">People</h2>
            <table className="table mt-2"><tbody>{people.map((p) => <tr key={p.email}><td>{p.name}</td><td>{p.email}</td><td>{p.phone}</td></tr>)}</tbody></table>
          </section>
          <section className="panel">
            <h2 className="px-4 pt-4 font-semibold">Orders</h2>
            {history.length ? (
              <table className="table mt-2"><tbody>{history.map((o) => (
                <tr key={o.id}><td><Link href={`/admin/orders/${o.id}`} className="link">{orderNo(o.number)}</Link></td><td>{dateIN(o.createdAt)}</td><td><Status value={o.status === "OPEN" ? o.fulfillmentStatus : o.status} /> <Status value={o.paymentStatus} /></td><td className="num text-right">{rupees(o.totalPaise)}</td></tr>
              ))}</tbody></table>
            ) : <p className="px-4 py-3 text-sm text-muted">No orders yet.</p>}
          </section>
        </div>
        <form action={companyAction} className="panel h-fit space-y-4 p-4">
          <input type="hidden" name="companyId" value={c.id} />
          <h2 className="font-semibold">Account settings</h2>
          <div>
            <label htmlFor="status" className="label">Status</label>
            <select id="status" name="status" defaultValue={c.status} className="field">
              <option value="PENDING">Pending review</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="SUSPENDED">Suspended</option>
            </select>
          </div>
          <div>
            <label htmlFor="priceListId" className="label">Price list</label>
            <select id="priceListId" name="priceListId" defaultValue={c.priceListId ?? lists.find((l) => l.isDefault)?.id ?? ""} className="field">
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.adjustmentBps / 100}%)</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="paymentTerms" className="label">Payment terms</label>
            <select id="paymentTerms" name="paymentTerms" defaultValue={c.paymentTerms} className="field">
              <option value="PREPAID">Prepaid</option><option value="NET_7">Net 7</option><option value="NET_15">Net 15</option><option value="NET_30">Net 30</option>
            </select>
          </div>
          <div>
            <label htmlFor="creditLimit" className="label">Credit limit (₹)</label>
            <input id="creditLimit" name="creditLimit" defaultValue={c.creditLimitPaise / 100} inputMode="decimal" className="field num" />
          </div>
          <div>
            <label htmlFor="notes" className="label">Internal notes</label>
            <textarea id="notes" name="notes" defaultValue={c.notes ?? ""} rows={3} className="field" />
          </div>
          <button className="btn-primary w-full">Save account</button>
        </form>
      </div>
    </>
  );
}
