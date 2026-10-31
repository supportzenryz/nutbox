import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, orderEvents, orderLines, orders, users } from "@/db/schema";

export async function getOrderFull(id: string) {
  const [o] = await db.select().from(orders).where(eq(orders.id, id));
  if (!o) return null;
  const [lines, events, [user], company] = await Promise.all([
    db.select().from(orderLines).where(eq(orderLines.orderId, id)),
    db.select().from(orderEvents).where(eq(orderEvents.orderId, id)).orderBy(asc(orderEvents.createdAt)),
    db.select({ name: users.name, email: users.email, phone: users.phone }).from(users).where(eq(users.id, o.userId)),
    o.companyId ? db.select().from(companies).where(eq(companies.id, o.companyId)).then((r) => r[0] ?? null) : Promise.resolve(null),
  ]);
  return { ...o, lines, events, user, company };
}

export type OrderFull = NonNullable<Awaited<ReturnType<typeof getOrderFull>>>;
