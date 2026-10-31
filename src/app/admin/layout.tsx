import { and, count, eq } from "drizzle-orm";
import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { AdminNav } from "@/components/admin-nav";
import { db } from "@/db";
import { companies, orders } from "@/db/schema";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Admin", template: "%s · Nutbox admin" }, robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await requireStaff();
  const [[toShip], [quotes], [pending]] = await Promise.all([
    db.select({ n: count() }).from(orders).where(and(eq(orders.status, "OPEN"), eq(orders.fulfillmentStatus, "UNFULFILLED"))),
    db.select({ n: count() }).from(orders).where(eq(orders.status, "QUOTE")),
    db.select({ n: count() }).from(companies).where(eq(companies.status, "PENDING")),
  ]);
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[232px_1fr]">
      <aside className="bg-pista-deep text-pista-soft lg:sticky lg:top-0 lg:h-screen">
        <div className="flex items-center justify-between px-5 py-4 lg:block">
          <Link href="/admin" className="stamp text-2xl text-white">NUTBOX</Link>
          <p className="hidden text-xs text-pista-kernel lg:block">Store admin</p>
        </div>
        <AdminNav counts={{ orders: toShip.n, quotes: quotes.n, companies: pending.n }} isAdmin={u.role === "ADMIN"} />
        <div className="hidden border-t border-white/10 px-5 py-4 text-xs lg:absolute lg:bottom-0 lg:block lg:w-full">
          <p className="truncate text-white">{u.name}</p>
          <p className="truncate text-pista-kernel">{u.role === "ADMIN" ? "Admin" : "Staff"} · {u.email}</p>
          <div className="mt-2 flex gap-3">
            <Link href="/" className="underline">View store</Link>
            <form action={logoutAction}><button className="underline">Sign out</button></form>
          </div>
        </div>
      </aside>
      <div className="min-w-0 bg-paper">
        <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </div>
    </div>
  );
}
