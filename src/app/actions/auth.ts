"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { companies, users } from "@/db/schema";
import { endSession, hashPassword, startSession, verifyPassword } from "@/lib/auth";
import { safeNext, str, withMsg } from "@/lib/forms";
import { validateGstin } from "@/lib/gstin";
import { STATES } from "@/lib/states";

export async function loginAction(fd: FormData) {
  const email = str(fd, "email").toLowerCase();
  const next = safeNext(str(fd, "next"), "");
  const [u] = await db.select().from(users).where(eq(users.email, email));
  if (!u || !(await verifyPassword(str(fd, "password"), u.passwordHash))) {
    redirect(withMsg(`/login?next=${encodeURIComponent(next)}`, { error: "That email and password don't match an account." }));
  }
  await startSession({ uid: u.id, role: u.role });
  redirect(next || (u.role === "CUSTOMER" ? (u.companyId ? "/wholesale" : "/account") : "/admin"));
}

const Register = z.object({
  name: z.string().min(2, "Enter your name.").max(80),
  email: z.string().email("Enter a valid email."),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit Indian mobile number."),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(100),
});

export async function registerAction(fd: FormData) {
  const next = safeNext(str(fd, "next"), "/account");
  const parsed = Register.safeParse({ name: str(fd, "name"), email: str(fd, "email").toLowerCase(), phone: str(fd, "phone"), password: str(fd, "password") });
  if (!parsed.success) redirect(withMsg(`/register?next=${encodeURIComponent(next)}`, { error: parsed.error.issues[0].message }));
  const d = parsed.data;
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, d.email));
  if (exists) redirect(withMsg(`/login?next=${encodeURIComponent(next)}`, { error: "An account with that email exists. Sign in instead." }));
  const [u] = await db
    .insert(users)
    .values({ name: d.name, email: d.email, phone: d.phone, passwordHash: await hashPassword(d.password), marketingOptIn: fd.get("marketing") === "on" })
    .returning();
  await startSession({ uid: u.id, role: u.role });
  redirect(next);
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

const Apply = z.object({
  name: z.string().min(2, "Enter the contact person's name."),
  email: z.string().email("Enter a valid email."),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number."),
  password: z.string().min(8, "Use at least 8 characters for your password."),
  legalName: z.string().min(3, "Enter the business's legal name as on the GST certificate."),
  tradeName: z.string().optional(),
  businessType: z.string().min(2, "Choose a business type."),
  addressLine: z.string().min(5, "Enter the business address."),
  city: z.string().min(2, "Enter the city."),
  stateCode: z.string().refine((c) => c in STATES, "Choose a state."),
  pincode: z.string().regex(/^[1-9]\d{5}$/, "Enter a 6-digit PIN code."),
});

/** Wholesale application: creates (or upgrades) the user and a PENDING company for admin review. */
export async function applyWholesaleAction(fd: FormData) {
  const back = "/wholesale/apply";
  const parsed = Apply.safeParse(Object.fromEntries(["name", "email", "phone", "password", "legalName", "tradeName", "businessType", "addressLine", "city", "stateCode", "pincode"].map((k) => [k, str(fd, k)])));
  if (!parsed.success) redirect(withMsg(back, { error: parsed.error.issues[0].message }));
  const d = parsed.data;
  const gstinRaw = str(fd, "gstin");
  let gstin: string | null = null;
  if (gstinRaw) {
    const g = validateGstin(gstinRaw);
    if (!g.ok) redirect(withMsg(back, { error: g.error }));
    if (g.stateCode !== d.stateCode) redirect(withMsg(back, { error: `This GSTIN is registered in ${STATES[g.stateCode]}, but the address is in ${STATES[d.stateCode]}. Use the GSTIN for this address.` }));
    gstin = g.gstin;
    const [dupe] = await db.select({ id: companies.id }).from(companies).where(eq(companies.gstin, gstin));
    if (dupe) redirect(withMsg(back, { error: "A business with this GSTIN already has an account. Ask its admin to add you, or sign in." }));
  } else if (fd.get("noGstin") !== "on") {
    redirect(withMsg(back, { error: "Enter your GSTIN, or tick the box if you're not GST-registered." }));
  }

  const email = d.email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing && !(await verifyPassword(d.password, existing.passwordHash)))
    redirect(withMsg(back, { error: "That email already has an account. Enter its current password to link your business." }));
  if (existing?.companyId) redirect(withMsg("/wholesale", { error: "This account is already linked to a business." }));

  const uid = await db.transaction(async (tx) => {
    const [c] = await tx
      .insert(companies)
      .values({ legalName: d.legalName, tradeName: d.tradeName || null, gstin, businessType: d.businessType, stateCode: d.stateCode, addressLine: d.addressLine, city: d.city, pincode: d.pincode, phone: d.phone })
      .returning();
    if (existing) {
      await tx.update(users).set({ companyId: c.id }).where(eq(users.id, existing.id));
      return existing;
    }
    const [u] = await tx.insert(users).values({ name: d.name, email, phone: d.phone, passwordHash: await hashPassword(d.password), companyId: c.id }).returning();
    return u;
  });
  await startSession({ uid: uid.id, role: uid.role });
  redirect(withMsg("/wholesale", { ok: "Application received. We'll verify your GSTIN and approve your account within one working day." }));
}
