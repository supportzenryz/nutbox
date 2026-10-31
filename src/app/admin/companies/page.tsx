import { and, asc, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { Empty, PageHead } from "@/components/admin-ui";
import { Status } from "@/components/status";
import { db } from "@/db";
import { companies, orders, priceLists } from "@/db/schema";
import { dateIN, rupees } from "@/lib/format";
import { stateName } from "@/lib/states";

export const metadata = { title: "Wholesale accounts" };

export default async function Companies({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const st = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"].includes(sp.status ?? "") ? (sp.status as "PENDING") : undefined;
  const rows = await db
    .select({
      c: companies,
      list: priceLists.name,
      spend: sql<number>`coalesce((select sum(${orders.totalPaise}) from ${orders} where ${orders.companyId} = ${companies.id} and ${orders.status} in ('OPEN','ARCHIVED')), 0)::float8`,
      due: sql<number>`coalesce((select sum(${orders.totalPaise}) from ${orders} where ${orders.companyId} = ${companies.id} and ${orders.status} = 'OPEN' and ${orders.paymentStatus} = 'PENDING' and ${orders.paymentMethod} = 'NET_TERMS'), 0)::float8`,
    })
    .from(companies)
    .leftJoin(priceLists, eq(priceLists.id, companies.priceListId))
    .where(st ? eq(companies.status, st) : undefined)
    .orderBy(asc(sql`case ${companies.status} when 'PENDING' then 0 else 1 end`), desc(companies.createdAt));
  return (
    <>
      <PageHead title="Wholesale accounts" sub="Approve applications, set price lists, terms and credit limits.">
        {[["", "All"], ["PENDING", "Pending"], ["APPROVED", "Approved"], ["SUSPENDED", "Suspended"]].map(([k, l]) => (
          <Link key={k} href={k ? `/admin/companies?status=${k}` : "/admin/companies"} className={`btn-sm ${(sp.status ?? "") === k ? "btn-primary" : "btn-ghost"}`}>{l}</Link>
        ))}
      </PageHead>
      {rows.length ? (
        <div className="panel overflow-x-auto">
          <table className="table min-w-[860px]">
            <thead><tr><th>Business</th><th>GSTIN</th><th>State</th><th>Status</th><th>Price list · terms</th><th className="text-right">Lifetime spend</th><th className="text-right">Credit used</th></tr></thead>
            <tbody>
              {rows.map(({ c, list, spend, due }) => (
                <tr key={c.id} className="hover:bg-paper">
                  <td><Link href={`/admin/companies/${c.id}`} className="link">{c.legalName}</Link><span className="block text-xs text-muted">{c.businessType} · applied {dateIN(c.createdAt)}</span></td>
                  <td className="font-mono text-xs">{c.gstin ?? "—"}</td>
                  <td>{stateName(c.stateCode)}</td>
                  <td><Status value={c.status} /></td>
                  <td className="text-sm">{list ?? "—"}<span className="block text-xs text-muted">{c.paymentTerms.replace("_", " ")}</span></td>
                  <td className="num text-right">{rupees(spend)}</td>
                  <td className="num text-right">{c.creditLimitPaise ? `${rupees(due)} / ${rupees(c.creditLimitPaise)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty>No accounts here.</Empty>}
    </>
  );
}
