import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Status } from "@/components/status";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { dateIN, orderNo, rupees } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your orders" };

export default async function Account() {
  const u = await requireUser();
  const list = await db.select().from(orders).where(eq(orders.userId, u.id)).orderBy(desc(orders.createdAt));
  return (
    <div className="shell py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Hello, {u.name.split(" ")[0]}</h1>
          <p className="text-sm text-muted">{u.email}{u.company ? ` · ${u.company.legalName}` : ""}</p>
        </div>
        {u.company?.status === "APPROVED" && <Link href="/wholesale" className="btn-ghost">Wholesale quick order</Link>}
      </div>
      <h2 className="mt-8 text-lg font-semibold">Orders</h2>
      {list.length ? (
        <div className="panel mt-3 overflow-x-auto">
          <table className="table">
            <thead>
              <tr><th>Order</th><th>Placed</th><th>Type</th><th>Status</th><th className="text-right">Total</th></tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/account/orders/${o.id}`} className="link">{orderNo(o.number)}</Link></td>
                  <td>{dateIN(o.createdAt)}</td>
                  <td><Status value={o.channel} /></td>
                  <td className="space-x-1">
                    {o.status !== "OPEN" ? <Status value={o.status} /> : <Status value={o.fulfillmentStatus} />}
                    {o.status === "OPEN" && o.paymentStatus === "PENDING" && o.paymentMethod !== "COD" && <Status value="PENDING" />}
                  </td>
                  <td className="num text-right">{rupees(o.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="panel mt-3 p-6 text-sm">
          No orders yet. <Link href="/shop" className="link">Start shopping</Link>
        </div>
      )}
    </div>
  );
}
