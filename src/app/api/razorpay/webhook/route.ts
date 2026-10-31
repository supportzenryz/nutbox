import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { recordOnlinePayment } from "@/lib/orders";
import { verifyWebhookSignature } from "@/lib/razorpay";

// Razorpay → POST with X-Razorpay-Signature = HMAC_SHA256(webhook_secret, raw body).
// Idempotent: recordOnlinePayment ignores orders that are already paid.
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature") ?? "";
  if (!verifyWebhookSignature(raw, sig)) return NextResponse.json({ error: "bad signature" }, { status: 401 });
  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  if (event.event === "payment.captured" || event.event === "order.paid") {
    const p = event.payload?.payment?.entity;
    if (p?.order_id && p.id) {
      const [o] = await db.select().from(orders).where(eq(orders.razorpayOrderId, p.order_id));
      if (o && p.amount === o.totalPaise) await recordOnlinePayment(o.id, p.id, "razorpay-webhook").catch(() => undefined);
    }
  }
  return NextResponse.json({ ok: true });
}
