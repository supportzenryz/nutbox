import "server-only";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { companies, priceLists, users } from "@/db/schema";
import { readSession, SESSION_COOKIE, signSession, type SessionPayload } from "./session";

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function startSession(p: SessionPayload) {
  (await cookies()).set(SESSION_COOKIE, await signSession(p), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Current user with company + price list, re-read from the DB on every request (role/approval changes apply immediately). */
export const currentUser = cache(async () => {
  const s = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!s) return null;
  const [row] = await db
    .select({ user: users, company: companies, priceList: priceLists })
    .from(users)
    .leftJoin(companies, eq(companies.id, users.companyId))
    .leftJoin(priceLists, eq(priceLists.id, companies.priceListId))
    .where(eq(users.id, s.uid));
  if (!row) return null;
  return { ...row.user, company: row.company, priceList: row.priceList };
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export async function requireUser(next = "/account") {
  const u = await currentUser();
  if (!u) redirect(`/login?next=${encodeURIComponent(next)}`);
  return u;
}

export const isStaff = (u: { role: string } | null) => u?.role === "ADMIN" || u?.role === "STAFF";

export async function requireStaff() {
  const u = await currentUser();
  if (!u) redirect("/login?next=/admin");
  if (!isStaff(u)) redirect("/");
  return u;
}

export async function requireAdmin() {
  const u = await requireStaff();
  if (u.role !== "ADMIN") throw new Error("Only admins can do this.");
  return u;
}

/** Approved wholesale buyer, or redirect to the wholesale landing page. */
export async function requireWholesale() {
  const u = await currentUser();
  if (!u) redirect("/login?next=/wholesale");
  if (!u.company || u.company.status !== "APPROVED") redirect("/wholesale");
  return u as CurrentUser & { company: NonNullable<CurrentUser["company"]> };
}
