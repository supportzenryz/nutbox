// Checkout + order lifecycle. Prices, tax and stock are always recomputed here, never trusted from the client.
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, type Executor, type Tx } from "@/db";
import {
  companies,
  coupons,
  invoiceCounters,
  orderEvents,
  orderLines,
  orders,
  priceBreaks,
  products,
  variants,
  type Channel,
  type OrderStatus,
  type PaymentMethod,
} from "@/db/schema";
import { consumeOrder, releaseOrder, reserveOrder, restockOrder, variantAvailability } from "./inventory";
import { checkWholesaleQty, RETAIL_MAX_PER_LINE, wholesaleUnitPrice } from "./pricing";
import { getSettings, type Settings } from "./settings";
import { computeOrderTax, financialYearCode, formatInvoiceNo, type TaxResult } from "./tax";
import { weight } from "./format";

export class CheckoutError extends Error {
  constructor(public problems: string[]) {
    super(problems.join(" "));
    this.name = "CheckoutError";
  }
}

export type BuyerCompany = {
  id: string;
  status: string;
  legalName: string;
  gstin: string | null;
  stateCode: string;
  paymentTerms: "PREPAID" | "NET_7" | "NET_15" | "NET_30";
  creditLimitPaise: number;
  priceListId: string | null;
} | null;

export type PriceListInfo = { id: string; adjustmentBps: number } | null;

export type CheckoutLine = {
  variantId: string;
  productId: string;
  productName: string;
  productSlug: string;
  title: string;
  sku: string;
  grade: string | null;
  tone: string;
  packType: string;
  hsnCode: string;
  gstRateBps: number;
  netGrams: number;
  shipGrams: number;
  qty: number;
  unitPricePaise: number;
  mrpPaise: number;
  available: number;
  minQty: number;
  step: number;
  problem?: string;
};

export type CheckoutSummary = {
  channel: Channel;
  lines: CheckoutLine[];
  problems: string[];
  coupon: { code: string; discountPaise: number } | null;
  couponProblem?: string;
  tax: TaxResult;
  intraState: boolean;
  totalGrams: number;
  shipGrams: number;
  freeShippingGapPaise: number;
  settings: Settings;
};

export async function buildCheckout(
  ex: Executor,
  a: {
    channel: Channel;
    items: { v: string; q: number }[];
    priceList?: PriceListInfo;
    couponCode?: string | null;
    shipStateCode?: string | null;
  },
): Promise<CheckoutSummary> {
  const s = await getSettings(ex);
  const ids = [...new Set(a.items.map((i) => i.v))];
  const rows = ids.length
    ? await ex.select({ v: variants, p: products }).from(variants).innerJoin(products, eq(products.id, variants.productId)).where(inArray(variants.id, ids))
    : [];
  const byId = new Map(rows.map((r) => [r.v.id, r]));
  const avail = await variantAvailability(ex, ids);
  const breaks =
    a.channel === "WHOLESALE" && a.priceList && ids.length
      ? await ex.select().from(priceBreaks).where(and(eq(priceBreaks.priceListId, a.priceList.id), inArray(priceBreaks.variantId, ids)))
      : [];

  const problems: string[] = [];
  const lines: CheckoutLine[] = [];
  for (const item of a.items) {
    const r = byId.get(item.v);
    const sold = r && r.v.isActive && r.p.isActive && (a.channel === "RETAIL" ? r.v.soldRetail : r.v.soldWholesale);
    if (!r || !sold) {
      problems.push("An item in your cart is no longer available and was skipped.");
      continue;
    }
    const { v, p } = r;
    let unit: number;
    let problem: string | undefined;
    if (a.channel === "RETAIL") {
      unit = v.retailPricePaise;
      if (item.q > RETAIL_MAX_PER_LINE) problem = `Up to ${RETAIL_MAX_PER_LINE} per order on the retail store — use the wholesale portal for bulk.`;
    } else {
      unit = wholesaleUnitPrice({
        basePaise: v.wholesaleBasePaise,
        adjustmentBps: a.priceList?.adjustmentBps ?? 0,
        breaks: breaks.filter((b) => b.variantId === v.id),
        qty: item.q,
      }).unitPricePaise;
      problem = checkWholesaleQty(item.q, v.wholesaleMinQty, v.wholesaleStep) ?? undefined;
    }
    const available = avail.get(v.id) ?? 0;
    if (!problem && item.q > available)
      problem = available > 0 ? `Only ${available} available right now.` : "Out of stock right now.";
    if (problem) problems.push(`${p.name} ${v.title}: ${problem}`);
    lines.push({
      variantId: v.id,
      productId: p.id,
      productName: p.name,
      productSlug: p.slug,
      title: v.title,
      sku: v.sku,
      grade: p.grade,
      tone: p.tone,
      packType: v.packType,
      hsnCode: p.hsnCode,
      gstRateBps: p.gstRateBps,
      netGrams: v.netGrams,
      shipGrams: v.shipGrams,
      qty: item.q,
      unitPricePaise: unit,
      mrpPaise: v.mrpPaise,
      available,
      minQty: a.channel === "WHOLESALE" ? v.wholesaleMinQty : 1,
      step: a.channel === "WHOLESALE" ? v.wholesaleStep : 1,
      problem,
    });
  }

  const gross = lines.reduce((t, l) => t + l.qty * l.unitPricePaise, 0);

  // Coupon
  let coupon: CheckoutSummary["coupon"] = null;
  let couponProblem: string | undefined;
  if (a.couponCode) {
    const code = a.couponCode.trim().toUpperCase();
    const [c] = await ex.select().from(coupons).where(eq(coupons.code, code));
    const now = Date.now();
    if (!c || !c.isActive) couponProblem = `Code ${code} isn't valid.`;
    else if (c.channel && c.channel !== a.channel) couponProblem = `Code ${code} doesn't apply to ${a.channel === "RETAIL" ? "retail" : "wholesale"} orders.`;
    else if ((c.startsAt && c.startsAt.getTime() > now) || (c.endsAt && c.endsAt.getTime() < now)) couponProblem = `Code ${code} has expired.`;
    else if (c.usageLimit !== null && c.usedCount >= c.usageLimit) couponProblem = `Code ${code} has been fully redeemed.`;
    else if (gross < c.minSubtotalPaise) couponProblem = `Add ₹${Math.ceil((c.minSubtotalPaise - gross) / 100)} more to use ${code}.`;
    else {
      const d = c.type === "PERCENT" ? Math.round((gross * c.value) / 10000) : Math.min(c.value, gross);
      coupon = { code, discountPaise: d };
    }
  }
  const discount = coupon?.discountPaise ?? 0;

  // Shipping
  const shipGrams = lines.reduce((t, l) => t + l.qty * l.shipGrams, 0);
  const totalGrams = lines.reduce((t, l) => t + l.qty * l.netGrams, 0);
  let shipping = 0;
  let freeShippingGapPaise = 0;
  if (lines.length) {
    if (a.channel === "RETAIL") {
      const afterDiscount = gross - discount;
      if (afterDiscount < s.freeShippingThresholdPaise) {
        shipping = s.retailShippingPaise;
        freeShippingGapPaise = s.freeShippingThresholdPaise - afterDiscount;
      }
    } else {
      shipping = Math.ceil(shipGrams / 1000) * s.wholesaleFreightPerKgPaise;
    }
  }

  const intraState = (a.shipStateCode || s.stateCode) === s.stateCode;
  const tax = computeOrderTax({
    lines: lines.map((l) => ({ key: l.variantId, qty: l.qty, unitPricePaise: l.unitPricePaise, gstRateBps: l.gstRateBps })),
    mode: a.channel === "RETAIL" ? "INCLUSIVE" : "EXCLUSIVE",
    intraState,
    discountPaise: discount,
    shippingPaise: shipping,
  });

  return { channel: a.channel, lines, problems, coupon, couponProblem, tax, intraState, totalGrams, shipGrams, freeShippingGapPaise, settings: s };
}

const TERMS_DAYS = { PREPAID: 0, NET_7: 7, NET_15: 15, NET_30: 30 } as const;

export async function addEvent(ex: Executor, orderId: string, type: string, message: string, actor?: string) {
  await ex.insert(orderEvents).values({ orderId, type, message, actor });
}

async function outstandingCreditPaise(tx: Tx, companyId: string) {
  const [r] = await tx
    .select({ due: sql<number>`coalesce(sum(${orders.totalPaise}), 0)::float8` })
    .from(orders)
    .where(and(eq(orders.companyId, companyId), eq(orders.paymentMethod, "NET_TERMS"), eq(orders.paymentStatus, "PENDING"), inArray(orders.status, ["OPEN"])));
  return r.due;
}

export type PlaceOrderInput = {
  channel: Channel;
  user: { id: string; email: string; name: string };
  company: BuyerCompany;
  priceList: PriceListInfo;
  items: { v: string; q: number }[];
  address: { name: string; phone: string; line1: string; line2?: string | null; city: string; stateCode: string; pincode: string };
  paymentMethod: PaymentMethod;
  couponCode?: string | null;
  asQuote?: boolean;
  note?: string | null;
};

export async function placeOrder(input: PlaceOrderInput): Promise<{ id: string; number: number; status: OrderStatus }> {
  return db.transaction(async (tx) => {
    const { channel, company } = input;
    if (channel === "WHOLESALE") {
      if (!company || company.status !== "APPROVED") throw new CheckoutError(["Your business account isn't approved for wholesale yet."]);
      // Serialise credit checks per company.
      await tx.select({ id: companies.id }).from(companies).where(eq(companies.id, company.id)).for("update");
    }
    const sum = await buildCheckout(tx, {
      channel,
      items: input.items,
      priceList: input.priceList,
      couponCode: input.couponCode,
      shipStateCode: input.address.stateCode,
    });
    const problems = [...sum.problems];
    if (input.couponCode && sum.couponProblem) problems.push(sum.couponProblem);
    if (!sum.lines.length) problems.push("Your cart is empty.");
    const s = sum.settings;
    const asQuote = channel === "WHOLESALE" && Boolean(input.asQuote);

    let method = input.paymentMethod;
    let dueDate: Date | null = null;
    if (channel === "RETAIL") {
      if (method !== "COD" && method !== "RAZORPAY") problems.push("Choose UPI/card or cash on delivery.");
      if (method === "COD" && sum.tax.totalPaise > s.codLimitPaise)
        problems.push(`Cash on delivery is available up to ₹${(s.codLimitPaise / 100).toLocaleString("en-IN")}. Pay online for larger orders.`);
    } else {
      if (sum.tax.taxablePaise < s.wholesaleMinOrderPaise)
        problems.push(`Wholesale orders start at ₹${(s.wholesaleMinOrderPaise / 100).toLocaleString("en-IN")} before GST.`);
      if (asQuote) method = company!.paymentTerms === "PREPAID" ? "BANK_TRANSFER" : "NET_TERMS";
      else if (method === "COD") problems.push("Cash on delivery isn't offered on wholesale orders.");
      else if (method === "NET_TERMS") {
        if (company!.paymentTerms === "PREPAID") problems.push("Your account is on prepaid terms. Pay by bank transfer or online.");
        else {
          const used = await outstandingCreditPaise(tx, company!.id);
          if (used + sum.tax.totalPaise > company!.creditLimitPaise)
            problems.push(
              `This order would exceed your credit limit (₹${(company!.creditLimitPaise / 100).toLocaleString("en-IN")}; ₹${(used / 100).toLocaleString("en-IN")} outstanding). Pay by bank transfer or request a quote.`,
            );
          dueDate = new Date(Date.now() + TERMS_DAYS[company!.paymentTerms] * 86_400_000);
        }
      }
    }
    if (problems.length) throw new CheckoutError([...new Set(problems)]);

    const [order] = await tx
      .insert(orders)
      .values({
        channel,
        status: asQuote ? "QUOTE" : "OPEN",
        paymentMethod: method,
        userId: input.user.id,
        companyId: company?.id ?? null,
        email: input.user.email,
        phone: input.address.phone,
        shipName: input.address.name,
        shipLine1: input.address.line1,
        shipLine2: input.address.line2 || null,
        shipCity: input.address.city,
        shipStateCode: input.address.stateCode,
        shipPincode: input.address.pincode,
        buyerGstin: channel === "WHOLESALE" ? company?.gstin : null,
        buyerLegalName: channel === "WHOLESALE" ? company?.legalName : null,
        supplyType: sum.intraState ? "INTRA" : "INTER",
        itemsGrossPaise: sum.tax.itemsGrossPaise,
        discountPaise: sum.tax.discountPaise,
        shippingPaise: sum.tax.shippingPaise,
        taxablePaise: sum.tax.taxablePaise,
        cgstPaise: sum.tax.cgstPaise,
        sgstPaise: sum.tax.sgstPaise,
        igstPaise: sum.tax.igstPaise,
        totalPaise: sum.tax.totalPaise,
        totalGrams: sum.totalGrams,
        couponCode: sum.coupon?.code ?? null,
        dueDate,
        customerNote: input.note || null,
      })
      .returning({ id: orders.id, number: orders.number, status: orders.status });

    await tx.insert(orderLines).values(
      sum.lines.map((l, i) => {
        const t = sum.tax.lines[i];
        return {
          orderId: order.id,
          variantId: l.variantId,
          sku: l.sku,
          title: `${l.productName} — ${l.title}`,
          hsnCode: l.hsnCode,
          gstRateBps: l.gstRateBps,
          netGrams: l.netGrams,
          qty: l.qty,
          unitPricePaise: l.unitPricePaise,
          discountPaise: t.discountPaise,
          taxablePaise: t.taxablePaise,
          taxPaise: t.taxPaise,
          totalPaise: t.totalPaise,
        };
      }),
    );

    if (sum.coupon) {
      const [c] = await tx
        .update(coupons)
        .set({ usedCount: sql`${coupons.usedCount} + 1` })
        .where(and(eq(coupons.code, sum.coupon.code), or(isNull(coupons.usageLimit), lt(coupons.usedCount, coupons.usageLimit))))
        .returning({ id: coupons.id });
      if (!c) throw new CheckoutError([`Code ${sum.coupon.code} has just been fully redeemed.`]);
    }

    if (asQuote) {
      await addEvent(tx, order.id, "quote", `Quote requested for ${sum.lines.length} item(s), ${weight(sum.totalGrams)}.`, input.user.email);
    } else {
      await reserveOrder(tx, order.id, input.user.email);
      await addEvent(tx, order.id, "placed", `Order placed. Stock reserved for ${weight(sum.totalGrams)}.`, input.user.email);
    }
    return order;
  });
}

// ───────────────────────── Lifecycle (admin) ─────────────────────────

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

async function lockOrder(tx: Tx, id: string) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
  if (!o) throw new TransitionError("Order not found.");
  return o;
}

export async function approveQuote(orderId: string, actor: string, unitPriceOverrides: Record<string, number> = {}) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.status !== "QUOTE") throw new TransitionError("Only quotes awaiting review can be approved.");
    const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, orderId));
    const priced = lines.map((l) => {
      const override = unitPriceOverrides[l.id];
      return { ...l, unitPricePaise: Number.isInteger(override) && override > 0 ? override : l.unitPricePaise };
    });
    const tax = computeOrderTax({
      lines: priced.map((l) => ({ key: l.id, qty: l.qty, unitPricePaise: l.unitPricePaise, gstRateBps: l.gstRateBps })),
      mode: "EXCLUSIVE",
      intraState: o.supplyType === "INTRA",
      discountPaise: o.discountPaise,
      shippingPaise: o.shippingPaise,
    });
    for (const [i, l] of priced.entries()) {
      const t = tax.lines[i];
      await tx
        .update(orderLines)
        .set({ unitPricePaise: l.unitPricePaise, discountPaise: t.discountPaise, taxablePaise: t.taxablePaise, taxPaise: t.taxPaise, totalPaise: t.totalPaise })
        .where(eq(orderLines.id, l.id));
    }
    let dueDate: Date | null = null;
    if (o.paymentMethod === "NET_TERMS" && o.companyId) {
      const [c] = await tx.select().from(companies).where(eq(companies.id, o.companyId));
      dueDate = new Date(Date.now() + TERMS_DAYS[c.paymentTerms] * 86_400_000);
    }
    await tx
      .update(orders)
      .set({
        status: "OPEN",
        itemsGrossPaise: tax.itemsGrossPaise,
        taxablePaise: tax.taxablePaise,
        cgstPaise: tax.cgstPaise,
        sgstPaise: tax.sgstPaise,
        igstPaise: tax.igstPaise,
        totalPaise: tax.totalPaise,
        dueDate,
      })
      .where(eq(orders.id, orderId));
    await reserveOrder(tx, orderId, actor);
    const changed = priced.filter((l, i) => l.unitPricePaise !== lines[i].unitPricePaise).length;
    await addEvent(tx, orderId, "quote_approved", changed ? `Quote approved with ${changed} negotiated price(s). Stock reserved.` : "Quote approved. Stock reserved.", actor);
  });
}

export async function markPaid(orderId: string, actor: string, reference?: string) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.status !== "OPEN") throw new TransitionError("Only open orders can be marked paid.");
    if (o.paymentStatus !== "PENDING") throw new TransitionError("This order isn't awaiting payment.");
    await tx.update(orders).set({ paymentStatus: "PAID" }).where(eq(orders.id, orderId));
    await addEvent(tx, orderId, "paid", reference ? `Payment recorded (${reference}).` : "Payment recorded.", actor);
  });
}

async function nextInvoiceNo(tx: Tx, prefix: string, at: Date) {
  const fy = financialYearCode(at);
  const [r] = await tx
    .insert(invoiceCounters)
    .values({ fy, next: 2 })
    .onConflictDoUpdate({ target: invoiceCounters.fy, set: { next: sql`${invoiceCounters.next} + 1` } })
    .returning({ next: invoiceCounters.next });
  return formatInvoiceNo(prefix, fy, r.next - 1);
}

export async function shipOrder(orderId: string, actor: string, courier: string, awb: string) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.status !== "OPEN" || o.fulfillmentStatus !== "UNFULFILLED") throw new TransitionError("Only open, unfulfilled orders can be shipped.");
    if ((o.paymentMethod === "RAZORPAY" || o.paymentMethod === "BANK_TRANSFER") && o.paymentStatus !== "PAID")
      throw new TransitionError("Prepaid order — record the payment before shipping.");
    const s = await getSettings(tx);
    const now = new Date();
    const invoiceNo = await nextInvoiceNo(tx, s.invoicePrefix, now);
    await consumeOrder(tx, orderId, actor);
    await tx
      .update(orders)
      .set({ fulfillmentStatus: "SHIPPED", shippedAt: now, courier: courier || null, awb: awb || null, invoiceNo, invoicedAt: now })
      .where(eq(orders.id, orderId));
    await addEvent(tx, orderId, "shipped", `Shipped${courier ? ` via ${courier}` : ""}${awb ? ` (AWB ${awb})` : ""}. Tax invoice ${invoiceNo} issued; lots picked FEFO.`, actor);
  });
}

export async function markDelivered(orderId: string, actor: string) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.fulfillmentStatus !== "SHIPPED") throw new TransitionError("Only shipped orders can be marked delivered.");
    const codCollected = o.paymentMethod === "COD" && o.paymentStatus === "PENDING";
    await tx
      .update(orders)
      .set({ fulfillmentStatus: "DELIVERED", deliveredAt: new Date(), ...(codCollected ? { paymentStatus: "PAID" as const } : {}) })
      .where(eq(orders.id, orderId));
    await addEvent(tx, orderId, "delivered", codCollected ? "Delivered. Cash on delivery collected." : "Delivered.", actor);
  });
}

export async function cancelOrder(orderId: string, actor: string, reason: string) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.status !== "OPEN" && o.status !== "QUOTE") throw new TransitionError("This order is already closed.");
    if (o.fulfillmentStatus !== "UNFULFILLED") throw new TransitionError("Shipped orders can't be cancelled — mark them returned instead.");
    await releaseOrder(tx, orderId, actor, reason);
    const paymentStatus = o.paymentStatus === "PAID" ? "REFUNDED" : "VOIDED";
    await tx.update(orders).set({ status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason, paymentStatus }).where(eq(orders.id, orderId));
    await addEvent(
      tx,
      orderId,
      o.status === "QUOTE" ? "quote_declined" : "cancelled",
      `${o.status === "QUOTE" ? "Quote declined" : "Order cancelled"}: ${reason}.${o.status === "OPEN" ? " Reserved stock released." : ""}${paymentStatus === "REFUNDED" ? " Refund due to customer." : ""}`,
      actor,
    );
  });
}

export async function markReturned(orderId: string, actor: string, reason: string) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.fulfillmentStatus !== "SHIPPED") throw new TransitionError("Only shipped (undelivered) orders can be returned to origin.");
    await restockOrder(tx, orderId, actor);
    await tx
      .update(orders)
      .set({ fulfillmentStatus: "RETURNED", ...(o.paymentStatus === "PENDING" ? { paymentStatus: "VOIDED" as const } : {}) })
      .where(eq(orders.id, orderId));
    await addEvent(tx, orderId, "returned", `Returned to origin: ${reason}. Stock put back into the original lots.`, actor);
  });
}

export async function archiveOrder(orderId: string, actor: string) {
  const res = await db.update(orders).set({ status: "ARCHIVED" }).where(and(eq(orders.id, orderId), eq(orders.status, "OPEN"))).returning({ id: orders.id });
  if (!res.length) throw new TransitionError("Only open orders can be archived.");
  await addEvent(db, orderId, "archived", "Order archived.", actor);
}

/** Record a verified Razorpay (or demo) payment. Idempotent. */
export async function recordOnlinePayment(orderId: string, paymentId: string, actor: string) {
  return db.transaction(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.paymentStatus === "PAID") return;
    if (o.status !== "OPEN") throw new TransitionError("Order is not open.");
    await tx.update(orders).set({ paymentStatus: "PAID", razorpayPaymentId: paymentId }).where(eq(orders.id, orderId));
    await addEvent(tx, orderId, "paid", `Online payment received (${paymentId}).`, actor);
  });
}
