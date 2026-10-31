import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { PageHead } from "@/components/admin-ui";
import { Packshot } from "@/components/packshot";
import { db } from "@/db";
import { categories, products, variants } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { pct, rupees } from "@/lib/format";

export const metadata = { title: "Products" };

export default async function Products() {
  const [rows, vs, u] = await Promise.all([
    db.select({ p: products, c: categories }).from(products).innerJoin(categories, eq(categories.id, products.categoryId)).orderBy(asc(categories.sortOrder), asc(products.name)),
    db.select().from(variants),
    currentUser(),
  ]);
  return (
    <>
      <PageHead title="Products" sub={`${rows.length} products · ${vs.length} pack sizes`}>
        {u?.role === "ADMIN" && <Link href="/admin/products/new" className="btn-primary">Add product</Link>}
      </PageHead>
      <div className="panel overflow-x-auto">
        <table className="table min-w-[820px]">
          <thead><tr><th>Product</th><th>Aisle</th><th>Origin</th><th>HSN · GST</th><th>Retail packs</th><th>Wholesale packs</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map(({ p, c }) => {
              const pv = vs.filter((v) => v.productId === p.id && v.isActive);
              const r = pv.filter((v) => v.soldRetail);
              const w = pv.filter((v) => v.soldWholesale);
              return (
                <tr key={p.id} className="hover:bg-paper">
                  <td>
                    <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                      <Packshot kind={c.slug === "gift-boxes" ? "box" : "pouch"} tone={p.tone} mark={p.grade?.split(" ")[0] ?? p.variety.toUpperCase()} className="h-10 w-10 shrink-0 rounded" />
                      <span className="link">{p.name}</span>
                    </Link>
                  </td>
                  <td>{c.name}</td>
                  <td>{p.origin}</td>
                  <td className="num">{p.hsnCode} · {pct(p.gstRateBps)}</td>
                  <td className="text-xs">{r.map((v) => `${v.title} ${rupees(v.retailPricePaise)}`).join(", ") || "—"}</td>
                  <td className="text-xs">{w.map((v) => v.title.split(" ").slice(0, 2).join(" ")).join(", ") || "—"}</td>
                  <td>{p.isActive ? <span className="badge bg-pista-soft text-pista-deep">Live</span> : <span className="badge bg-line text-muted">Hidden</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
