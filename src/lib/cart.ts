import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import type { Channel } from "@/db/schema";

export type CartItem = { v: string; q: number };
const CartSchema = z.array(z.object({ v: z.string().min(1).max(64), q: z.number().int().positive().max(100000) })).max(60);

const name = (c: Channel) => (c === "RETAIL" ? "nb_cart" : "nb_cart_wholesale");

export async function readCart(channel: Channel): Promise<CartItem[]> {
  const raw = (await cookies()).get(name(channel))?.value;
  if (!raw) return [];
  try {
    const parsed = CartSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function writeCart(channel: Channel, items: CartItem[]) {
  const clean = items.filter((i) => i.q > 0).slice(0, 60);
  (await cookies()).set(name(channel), JSON.stringify(clean), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function clearCart(channel: Channel) {
  (await cookies()).delete(name(channel));
}

export async function readCoupon(channel: Channel) {
  return (await cookies()).get(channel === "RETAIL" ? "nb_coupon" : "nb_coupon_wholesale")?.value ?? null;
}
