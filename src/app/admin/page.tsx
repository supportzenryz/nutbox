import { and, asc, desc, eq, gt, gte, inArray, lt, ne, sql } from "drizzle-orm";
import Link from "next/link";
import { Kpi, PageHead } from "@/components/admin-ui";
import { Status } from "@/components/status";
import { db } from "@/db";
import { companies, inventoryItems, inventoryLevels, lots, orders } from "@/db/schema";
import { dateIN, orderNo, rupees, weight } from "@/lib/format";

export const metadata = { title: "Home" };

const DAY = 86_400_000;

export default async function Dashboard() {
  const since = new Date(Date.now() - 14 * DAY);
  const live = and(inArray(orders.status, ["OPEN", "ARCHIVED"]), ne(orders.fulfillmentStatus, "RETURNED"));
  const [byDay, [totals], [counts], [credit], low, expiring, recent, applications] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(${orders.createdAt} AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`,
        channel: orders.channel,
        total: sql<number>`sum(${orders.totalPaise})::float8`,
      })
      .from(orders)
      .where(and(live, gte(orders.createdAt, since)))
      .groupBy(sql`1`, orders.channel),
    db
      .select({
        retail: sql<number>`coalesce(sum(${orders.totalPaise}) filter (where ${orders.channel} = 'RETAIL'), 0)::float8`,
        wholesale: sql<number>`coalesce(sum(${orders.totalPaise}) filter (where ${orders.channel} = 'WHOLESALE'), 0)::float8`,
        kg: sql<number>`coalesce(sum(${orders.totalGrams}), 0)::int`,
        n: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(and(live, gte(orders.createdAt, new Date(Date.now() - 30 * DAY)))),
    db
      .select({
        toShip: sql<number>`count(*) filter (where ${orders.status} = 'OPEN' and ${orders.fulfillmentStatus} = 'UNFULFILLED')::int`,
        awaitingPay: sql<number>`count(*) filter (where ${orders.status} = 'OPEN' and ${orders.paymentStatus} = 'PENDING' and ${orders.paymentMethod} in ('RAZORPAY','BANK_TRANSFER','UPI'))::int`,
        upiToVerify: sql<number>`count(*) filter (where ${orders.status} = 'OPEN' and ${orders.paymentStatus} = 'PENDING' and ${orders.paymentMethod} = 'UPI' and ${orders.upiRef} is not null)::int`,
        quotes: sql<number>`count(*) filter (where ${orders.status} = 'QUOTE')::int`,
      })
      .from(orders),
    db
      .select({
        due: sql<number>`coalesce(sum(${orders.totalPaise}), 0)::float8`,
        overdue: sql<number>`coalesce(sum(${orders.totalPaise}) filter (where ${orders.dueDate} < now()), 0)::float8`,
      })
      .from(orders)
      .where(and(eq(orders.status, "OPEN"), eq(orders.paymentMethod, "NET_TERMS"), eq(orders.paymentStatus, "PENDING"))),
    db
      .select({ id: inventoryItems.id, name: inventoryItems.name, threshold: inventoryItems.lowStockThreshold, free: sql<number>`(${inventoryLevels.onHand} - ${inventoryLevels.reserved})::int` })
      .from(inventoryLevels)
      .innerJoin(inventoryItems, eq(inventoryItems.id, inventoryLevels.itemId))
      .where(sql`${inventoryLevels.onHand} - ${inventoryLevels.reserved} < ${inventoryItems.lowStockThreshold}`)
      .orderBy(asc(sql`${inventoryLevels.onHand} - ${inventoryLevels.reserved}`)),
    db
      .select({ id: lots.id, itemId: lots.itemId, lotNo: lots.lotNo, qty: lots.qtyOnHand, expiresOn: lots.expiresOn, name: inventoryItems.name })
      .from(lots)
      .innerJoin(inventoryItems, eq(inventoryItems.id, lots.itemId))
      .where(and(gt(lots.qtyOnHand, 0), lt(lots.expiresOn, new Date(Date.now() + 45 * DAY))))
      .orderBy(asc(lots.expiresOn)),
    db.select().from(orders).orderBy(desc(orders.createdAt)).limit(8),
    db.select().from(companies).where(eq(companies.status, "PENDING")).orderBy(asc(companies.createdAt)),
  ]);

  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * DAY + 330 * 60_000);
    return d.toISOString().slice(0, 10);
  });
  const series = days.map((d) => ({
    d,
    retail: byDay.find((r) => r.day === d && r.channel === "RETAIL")?.total ?? 0,
    wholesale: byDay.find((r) => r.day === d && r.channel === "WHOLESALE")?.total ?? 0,
  }));
  const max = Math.max(1, ...series.map((s) => s.retail + s.wholesale));

  return (
    <>
      <PageHead title="Today at Nutbox" sub={dateIN(new Date())} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Retail sales · 30 days" value={rupees(totals.retail)} note="incl. GST" />
        <Kpi label="Wholesale sales · 30 days" value={rupees(totals.wholesale)} note="incl. GST" />
        <Kpi label="Volume sold · 30 days" value={weight(totals.kg)} note={`${totals.n} orders across both channels`} />
        <Kpi label="Credit outstanding" value={rupees(credit.due)} note={credit.overdue ? `${rupees(credit.overdue)} overdue` : "Nothing overdue"} tone={credit.overdue ? "warn" : "default"} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="panel p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Sales by channel, last 14 days</h2>
            <p className="flex gap-4 text-xs text-muted">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-pista" />Retail</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-jute" />Wholesale</span>
            </p>
          </div>
          <div className="mt-4 flex h-48 items-end gap-1.5" role="img" aria-label="Daily sales split by retail and wholesale">
            {series.map((s) => (
              <div key={s.d} className="group relative flex h-full flex-1 flex-col justify-end" title={`${dateIN(s.d)}: retail ${rupees(s.retail)}, wholesale ${rupees(s.wholesale)}`}>
                <div className="rounded-t-sm bg-jute" style={{ height: `${(s.wholesale / max) * 100}%` }} />
                <div className={`bg-pista ${s.wholesale ? "" : "rounded-t-sm"}`} style={{ height: `${(s.retail / max) * 100}%`, minHeight: s.retail ? 2 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5 text-[10px] text-muted">
            {series.map((s, i) => (
              <span key={s.d} className="flex-1 text-center">{i % 2 === 0 ? s.d.slice(8) : ""}</span>
            ))}
          </div>
        </section>

        <section className="panel divide-y divide-line">
          <h2 className="px-5 py-3 font-semibold">Needs action</h2>
          {[
            { n: counts.toShip, label: "orders to pack and ship", href: "/admin/orders?view=unfulfilled" },
            { n: counts.upiToVerify, label: "UPI payments to verify", href: "/admin/orders?view=upi" },
            { n: counts.awaitingPay, label: "prepaid orders awaiting payment", href: "/admin/orders?view=unpaid" },
            { n: counts.quotes, label: "wholesale quotes to review", href: "/admin/orders?view=quotes" },
            { n: applications.length, label: "wholesale applications", href: "/admin/companies?status=PENDING" },
            { n: low.length, label: "items below low-stock level", href: "/admin/inventory?filter=low" },
            { n: expiring.length, label: "lots expiring within 45 days", href: "#expiring" },
          ].map((a) => (
            <Link key={a.label} href={a.href} className="flex items-center gap-3 px-5 py-2.5 text-sm hover:bg-paper">
              <span className={`num w-8 text-right text-lg font-semibold ${a.n ? "text-ink" : "text-muted/50"}`}>{a.n}</span>
              <span className={a.n ? "" : "text-muted"}>{a.label}</span>
            </Link>
          ))}
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <section className="panel">
          <div className="flex items-baseline justify-between px-5 pt-4"><h2 className="font-semibold">Recent orders</h2><Link href="/admin/orders" className="link text-sm">All orders</Link></div>
          <table className="table mt-2">
            <tbody>
              {recent.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/orders/${o.id}`} className="link">{orderNo(o.number)}</Link><span className="block text-xs text-muted">{dateIN(o.createdAt)}</span></td>
                  <td><Status value={o.channel} /></td>
                  <td>{o.status === "OPEN" ? <Status value={o.fulfillmentStatus} /> : <Status value={o.status} />}</td>
                  <td className="num text-right">{rupees(o.totalPaise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="space-y-6">
          <div className="panel">
            <h2 className="px-5 pt-4 font-semibold">Low stock</h2>
            {low.length ? (
              <table className="table mt-2">
                <tbody>
                  {low.map((l) => (
                    <tr key={l.id}>
                      <td><Link href={`/admin/inventory/${l.id}`} className="link">{l.name}</Link></td>
                      <td className="num text-right">{weight(Math.max(0, l.free))} free</td>
                      <td className="num text-right text-xs text-muted">alert at {weight(l.threshold)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="px-5 py-4 text-sm text-muted">Every stock pool is above its alert level.</p>}
          </div>
          <div className="panel" id="expiring">
            <h2 className="px-5 pt-4 font-semibold">Lots expiring within 45 days</h2>
            <p className="px-5 text-xs text-muted">FSSAI expects ≥30% shelf life at delivery — move these first or mark down.</p>
            {expiring.length ? (
              <table className="table mt-2">
                <tbody>
                  {expiring.map((l) => (
                    <tr key={l.id}>
                      <td><Link href={`/admin/inventory/${l.itemId}`} className="link">{l.name}</Link><span className="block text-xs text-muted">Lot {l.lotNo}</span></td>
                      <td className="num text-right">{weight(l.qty)}</td>
                      <td className="text-right text-sm"><span className="font-medium text-danger">{dateIN(l.expiresOn)}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="px-5 py-4 text-sm text-muted">No lots close to expiry.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
