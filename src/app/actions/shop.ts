"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { addresses, orders, type Channel, type PaymentMethod } from "@/db/schema";
import { currentUser, requireUser, requireWholesale } from "@/lib/auth";
import { clearCart, readCart, readCoupon, writeCart } from "@/lib/cart";
import { int, optStr, str, userMessage, withMsg } from "@/lib/forms";
import { placeOrder, recordOnlinePayment } from "@/lib/orders";
import { createRazorpayOrder, demoPaymentsEnabled, razorpayEnabled, verifyPaymentSignature } from "@/lib/razorpay";
import { STATES } from "@/lib/states";

const cartPath = (c: Channel) => (c === "RETAIL" ? "/cart" : "/wholesale/cart");

export async function addToCartAction(fd: FormData) {
  const channel: Channel = str(fd, "channel") === "WHOLESALE" ? "WHOLESALE" : "RETAIL";
  if (channel === "WHOLESALE") await requireWholesale();
  const v = str(fd, "variantId");
  const q = Math.max(1, int(fd, "qty") || 1);
  const cart = await readCart(channel);
  const line = cart.find((i) => i.v === v);
  if (line) line.q += q;
  else cart.push({ v, q });
  await writeCart(channel, cart);
  redirect(withMsg(cartPath(channel), { ok: "Added to your cart." }));
}

/** Wholesale quick-order: every `qty_<variantId>` field with a value goes into the cart. */
export async function quickOrderAction(fd: FormData) {
  await requireWholesale();
  const cart = await readCart("WHOLESALE");
  let added = 0;
  for (const [k, val] of fd.entries()) {
    if (!k.startsWith("qty_")) continue;
    const q = Math.trunc(Number(val));
    if (!q || q <= 0) continue;
    const v = k.slice(4);
    const line = cart.find((i) => i.v === v);
    if (line) line.q = q;
    else cart.push({ v, q });
    added++;
  }
  if (!added) redirect(withMsg("/wholesale", { error: "Enter a quantity for at least one pack." }));
  await writeCart("WHOLESALE", cart);
  redirect(withMsg("/wholesale/cart", { ok: `${added} line${added > 1 ? "s" : ""} added.` }));
}

export async function updateCartAction(fd: FormData) {
  const channel: Channel = str(fd, "channel") === "WHOLESALE" ? "WHOLESALE" : "RETAIL";
  const v = str(fd, "variantId");
  const q = int(fd, "qty");
  const cart = (await readCart(channel)).map((i) => (i.v === v ? { ...i, q: Number.isFinite(q) ? q : i.q } : i)).filter((i) => i.q > 0);
  await writeCart(channel, cart);
  redirect(cartPath(channel));
}

export async function couponAction(fd: FormData) {
  const channel: Channel = str(fd, "channel") === "WHOLESALE" ? "WHOLESALE" : "RETAIL";
  const code = str(fd, "code").toUpperCase().slice(0, 32);
  const jar = await cookies();
  const name = channel === "RETAIL" ? "nb_coupon" : "nb_coupon_wholesale";
  if (code && fd.get("remove") !== "1") jar.set(name, code, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
  else jar.delete(name);
  redirect(cartPath(channel));
}

function addressFrom(fd: FormData) {
  const a = {
    name: str(fd, "shipName"),
    phone: str(fd, "shipPhone"),
    line1: str(fd, "line1"),
    line2: optStr(fd, "line2"),
    city: str(fd, "city"),
    stateCode: str(fd, "stateCode"),
    pincode: str(fd, "pincode"),
  };
  if (a.name.length < 2) return { error: "Enter the recipient's name." };
  if (!/^[6-9]\d{9}$/.test(a.phone)) return { error: "Enter a 10-digit mobile number for delivery updates." };
  if (a.line1.length < 5) return { error: "Enter the delivery address." };
  if (a.city.length < 2) return { error: "Enter the city." };
  if (!(a.stateCode in STATES)) return { error: "Choose a state." };
  if (!/^[1-9]\d{5}$/.test(a.pincode)) return { error: "Enter a 6-digit PIN code." };
  return { address: a };
}

export async function placeRetailOrderAction(fd: FormData) {
  const u = await requireUser("/checkout");
  const parsed = addressFrom(fd);
  if ("error" in parsed) redirect(withMsg("/checkout", { error: parsed.error! }));
  const method: PaymentMethod = str(fd, "paymentMethod") === "COD" ? "COD" : "RAZORPAY";
  let orderId = "";
  let error: string | undefined;
  try {
    const items = await readCart("RETAIL");
    const o = await placeOrder({
      channel: "RETAIL",
      user: u,
      company: null,
      priceList: null,
      items,
      address: parsed.address,
      paymentMethod: method,
      couponCode: await readCoupon("RETAIL"),
      note: optStr(fd, "note"),
    });
    orderId = o.id;
    if (fd.get("saveAddress") === "on") {
      const existing = await db.select({ id: addresses.id }).from(addresses).where(eq(addresses.userId, u.id));
      await db.insert(addresses).values({ ...parsed.address, userId: u.id, isDefault: existing.length === 0 });
    }
  } catch (e) {
    error = userMessage(e);
  }
  if (error) redirect(withMsg("/checkout", { error }));
  await clearCart("RETAIL");
  (await cookies()).delete("nb_coupon");
  redirect(`/account/orders/${orderId}?placed=1`);
}

export async function placeWholesaleOrderAction(fd: FormData) {
  const u = await requireWholesale();
  const parsed = addressFrom(fd);
  if ("error" in parsed) redirect(withMsg("/wholesale/cart", { error: parsed.error! }));
  const asQuote = str(fd, "mode") === "quote";
  const pm = str(fd, "paymentMethod");
  const method: PaymentMethod = pm === "NET_TERMS" ? "NET_TERMS" : pm === "RAZORPAY" ? "RAZORPAY" : "BANK_TRANSFER";
  let orderId = "";
  let error: string | undefined;
  try {
    const o = await placeOrder({
      channel: "WHOLESALE",
      user: u,
      company: u.company,
      priceList: u.priceList ? { id: u.priceList.id, adjustmentBps: u.priceList.adjustmentBps } : null,
      items: await readCart("WHOLESALE"),
      address: parsed.address,
      paymentMethod: method,
      couponCode: await readCoupon("WHOLESALE"),
      asQuote,
      note: optStr(fd, "note"),
    });
    orderId = o.id;
  } catch (e) {
    error = userMessage(e);
  }
  if (error) redirect(withMsg("/wholesale/cart", { error }));
  await clearCart("WHOLESALE");
  (await cookies()).delete("nb_coupon_wholesale");
  redirect(`/account/orders/${orderId}?placed=1`);
}

async function ownOrder(orderId: string) {
  const u = await currentUser();
  if (!u) throw new Error("Sign in to pay for this order.");
  const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
  if (!o || o.userId !== u.id) throw new Error("Order not found.");
  return o;
}

/** Starts a Razorpay payment for the shopper's own order. Amount always comes from the DB. */
export async function startPaymentAction(orderId: string) {
  const o = await ownOrder(orderId);
  if (o.paymentStatus !== "PENDING" || o.status !== "OPEN") return { error: "This order isn't awaiting payment." };
  if (!razorpayEnabled()) return { demo: demoPaymentsEnabled() };
  const rzp = o.razorpayOrderId ? { id: o.razorpayOrderId } : await createRazorpayOrder(o.totalPaise, `NB-${1000 + o.number}`);
  if (!o.razorpayOrderId) await db.update(orders).set({ razorpayOrderId: rzp.id }).where(eq(orders.id, o.id));
  return { keyId: process.env.RAZORPAY_KEY_ID!, rzpOrderId: rzp.id, amount: o.totalPaise, email: o.email, phone: o.phone, name: o.shipName };
}

export async function verifyPaymentAction(orderId: string, paymentId: string, signature: string) {
  const o = await ownOrder(orderId);
  if (!o.razorpayOrderId || !verifyPaymentSignature(o.razorpayOrderId, paymentId, signature)) return { error: "We couldn't verify that payment. If money was deducted, it will be refunded automatically." };
  await recordOnlinePayment(o.id, paymentId, o.email);
  return { ok: true };
}

export async function demoPayAction(orderId: string) {
  if (!demoPaymentsEnabled()) return { error: "Demo payments are disabled." };
  const o = await ownOrder(orderId);
  await recordOnlinePayment(o.id, `pay_demo_${Date.now().toString(36)}`, o.email);
  return { ok: true };
}
