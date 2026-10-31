import { and, desc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Empty, PageHead } from "@/components/admin-ui";
import { PAYMENT_METHOD_LABEL, Status } from "@/components/status";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { dateIN, orderNo, rupees, weight } from "@/lib/format";

export const metadata = { title: "Orders" };

const VIEWS: { key: string; label: string; where?: SQL }[] = [
  { key: "", label: "All" },
  { key: "unfulfilled", label: "To ship", where: and(eq(orders.status, "OPEN"), eq(orders.fulfillmentStatus, "UNFULFILLED")) },
  { key: "unpaid", label: "Unpaid", where: and(eq(orders.status, "OPEN"), eq(orders.paymentStatus, "PENDING")) },
  { key: "quotes", label: "Quotes", where: eq(orders.status, "QUOTE") },
  { key: "shipped", label: "In transit", where: eq(orders.fulfillmentStatus, "SHIPPED") },
  { key: "closed", label: "Cancelled & returned", where: or(eq(orders.status, "CANCELLED"), eq(orders.fulfillmentStatus, "RETURNED")) },
];

export default async function Orders({ searchParams }: { searchParams: Promise<{ view?: string; channel?: string; q?: string }> }) {
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === (sp.view ?? "")) ?? VIEWS[0];
  const where: SQL[] = [];
  if (view.where) where.push(view.where);
  if (sp.channel === "RETAIL" || sp.channel === "WHOLESALE") where.push(eq(orders.channel, sp.channel));
  if (sp.q) {
    const n = Number(sp.q.replace(/\D/g, "")) - 1000;
    const like = `%${sp.q.replace(/[%_\\]/g, "")}%`;
    where.push(or(ilike(orders.email, like), ilike(orders.shipName, like), ilike(orders.buyerLegalName, like), ilike(orders.awb, like), ...(n > 0 ? [inArray(orders.number, [n])] : []))!);
  }
  const list = await db.select().from(orders).where(where.length ? and(...where) : undefined).orderBy(desc(orders.createdAt)).limit(200);
  const link = (patch: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ view: sp.view, channel: sp.channel, q: sp.q, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/admin/orders${q.size ? `?${q}` : ""}`;
  };

  return (
    <>
      <PageHead title={view.key === "quotes" ? "Wholesale quotes" : "Orders"} sub="Retail and wholesale orders draw from the same stock." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded border border-line bg-card p-1 text-sm">
          {VIEWS.map((v) => (
            <Link key={v.key} href={link({ view: v.key || undefined })} className={`rounded px-3 py-1 ${v.key === view.key ? "bg-pista text-white" : "text-muted hover:text-ink"}`}>{v.label}</Link>
          ))}
        </div>
        <div className="flex gap-1 rounded border border-line bg-card p-1 text-sm">
          {[["", "Both channels"], ["RETAIL", "Retail"], ["WHOLESALE", "Wholesale"]].map(([k, l]) => (
            <Link key={k} href={link({ channel: k || undefined })} className={`rounded px-3 py-1 ${(sp.channel ?? "") === k ? "bg-pista text-white" : "text-muted hover:text-ink"}`}>{l}</Link>
          ))}
        </div>
        <form className="ml-auto">
          {sp.view && <input type="hidden" name="view" value={sp.view} />}
          {sp.channel && <input type="hidden" name="channel" value={sp.channel} />}
          <label htmlFor="q" className="sr-only">Search orders</label>
          <input id="q" name="q" defaultValue={sp.q} placeholder="Order no., name, email, AWB" className="field w-64" />
        </form>
      </div>
      {list.length ? (
        <div className="panel overflow-x-auto">
          <table className="table min-w-[860px]">
            <thead>
              <tr><th>Order</th><th>Customer</th><th>Channel</th><th>Payment</th><th>Fulfilment</th><th className="text-right">Weight</th><th className="text-right">Total</th></tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.id} className="hover:bg-paper">
                  <td><Link href={`/admin/orders/${o.id}`} className="link">{orderNo(o.number)}</Link><span className="block text-xs text-muted">{dateIN(o.createdAt, true)}</span></td>
                  <td>{o.buyerLegalName ?? o.shipName}<span className="block text-xs text-muted">{o.shipCity}</span></td>
                  <td><Status value={o.channel} /></td>
                  <td>
                    {o.status === "QUOTE" ? <Status value="QUOTE" /> : <Status value={o.paymentStatus} />}
                    <span className="block text-xs text-muted">{PAYMENT_METHOD_LABEL[o.paymentMethod]}</span>
                  </td>
                  <td>{o.status === "CANCELLED" ? <Status value="CANCELLED" /> : <Status value={o.fulfillmentStatus} />}</td>
                  <td className="num text-right">{weight(o.totalGrams)}</td>
                  <td className="num text-right font-medium">{rupees(o.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>No orders in this view.</Empty>
      )}
    </>
  );
}
