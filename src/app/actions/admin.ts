"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import {
  companies,
  coupons,
  inventoryItems,
  inventoryLevels,
  locations,
  priceBreaks,
  priceLists,
  products,
  settings,
  variantComponents,
  variants,
} from "@/db/schema";
import { requireAdmin, requireStaff } from "@/lib/auth";
import { attempt, int, optStr, paise, str, withMsg } from "@/lib/forms";
import { validateGstin } from "@/lib/gstin";
import { adjustLot, InventoryError, receiveStock } from "@/lib/inventory";
import { approveQuote, archiveOrder, cancelOrder, markDelivered, markPaid, markReturned, shipOrder } from "@/lib/orders";
import { STATES } from "@/lib/states";
import { UPI_ID_RE } from "@/lib/upi";

const who = (u: { email: string }) => u.email;

// ───────────── Orders ─────────────

export async function orderAction(fd: FormData) {
  const u = await requireStaff();
  const id = str(fd, "orderId");
  const op = str(fd, "op");
  const back = `/admin/orders/${id}`;
  const labels: Record<string, string> = {
    approve: "Quote approved and stock reserved.",
    paid: "Payment recorded.",
    ship: "Marked shipped and tax invoice issued.",
    delivered: "Marked delivered.",
    cancel: "Cancelled.",
    return: "Marked returned; stock restored to its lots.",
    archive: "Archived.",
  };
  await attempt(back, labels[op] ?? "Done.", async () => {
    switch (op) {
      case "approve": {
        const overrides: Record<string, number> = {};
        for (const [k] of fd.entries()) if (k.startsWith("price_")) {
          const p = paise(fd, k);
          if (Number.isFinite(p) && p > 0) overrides[k.slice(6)] = p;
        }
        return approveQuote(id, who(u), overrides);
      }
      case "paid":
        return markPaid(id, who(u), optStr(fd, "reference") ?? undefined);
      case "ship":
        return shipOrder(id, who(u), str(fd, "courier"), str(fd, "awb"));
      case "delivered":
        return markDelivered(id, who(u));
      case "cancel":
        return cancelOrder(id, who(u), str(fd, "reason") || "Cancelled by staff");
      case "return":
        return markReturned(id, who(u), str(fd, "reason") || "Undeliverable");
      case "archive":
        return archiveOrder(id, who(u));
      default:
        throw new InventoryError("Unknown action.");
    }
  });
}

// ───────────── Inventory ─────────────

const toBase = (fd: FormData, k: string, uom: string) => {
  const n = Number(str(fd, k));
  return uom === "GRAM" ? Math.round(n * 1000) : Math.round(n); // form takes kg for gram items
};

export async function receiveStockAction(fd: FormData) {
  const u = await requireStaff();
  const itemId = str(fd, "itemId");
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  const back = `/admin/inventory/${itemId}`;
  await attempt(back, "Stock received.", async () => {
    if (!item) throw new InventoryError("Item not found.");
    const qty = toBase(fd, "qty", item.uom);
    const exp = new Date(str(fd, "expiresOn"));
    if (Number.isNaN(exp.getTime())) throw new InventoryError("Enter the best-before date.");
    const lotNo = str(fd, "lotNo").toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{1,30}$/.test(lotNo)) throw new InventoryError("Lot numbers use letters, numbers and dashes (2–31 characters).");
    const cost = paise(fd, "costPerKg");
    await db.transaction((tx) =>
      receiveStock(tx, { itemId, qty, lotNo, expiresOn: exp, supplier: optStr(fd, "supplier") ?? undefined, costPaisePerKg: Number.isFinite(cost) && cost > 0 ? cost : undefined, actor: who(u) }),
    );
  });
}

export async function adjustLotAction(fd: FormData) {
  const u = await requireStaff();
  const itemId = str(fd, "itemId");
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  await attempt(`/admin/inventory/${itemId}`, "Adjustment recorded.", async () => {
    if (!item) throw new InventoryError("Item not found.");
    const reason = str(fd, "reason") === "WASTAGE" ? "WASTAGE" : "ADJUSTMENT";
    const raw = toBase(fd, "delta", item.uom);
    const delta = reason === "WASTAGE" ? -Math.abs(raw) : raw;
    const note = str(fd, "note");
    if (note.length < 3) throw new InventoryError("Add a short note explaining the adjustment.");
    await db.transaction((tx) => adjustLot(tx, { lotId: str(fd, "lotId"), delta, reason, note, actor: who(u) }));
  });
}

export async function thresholdAction(fd: FormData) {
  await requireStaff();
  const itemId = str(fd, "itemId");
  const [item] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, itemId));
  await attempt(`/admin/inventory/${itemId}`, "Low-stock alert updated.", async () => {
    const v = toBase(fd, "threshold", item?.uom ?? "GRAM");
    if (!Number.isFinite(v) || v < 0) throw new InventoryError("Enter a number.");
    await db.update(inventoryItems).set({ lowStockThreshold: v }).where(eq(inventoryItems.id, itemId));
  });
}

// ───────────── Catalog ─────────────

const ProductForm = z.object({
  name: z.string().min(2),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug: lowercase letters, numbers and dashes."),
  categoryId: z.string().min(1),
  variety: z.string().min(2),
  grade: z.string().optional(),
  origin: z.string().min(2, "Country of origin is required (Legal Metrology)."),
  processing: z.string().min(2),
  description: z.string().min(10, "Write at least a sentence of description."),
  hsnCode: z.string().regex(/^\d{4,8}$/, "HSN is 4–8 digits."),
  gstRateBps: z.coerce.number().int().min(0).max(2800),
  ingredients: z.string().min(2),
  allergens: z.string().min(2),
  shelfLifeDays: z.coerce.number().int().min(1).max(1095),
  tone: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

function productFields(fd: FormData) {
  return ProductForm.safeParse({
    ...Object.fromEntries(["name", "slug", "categoryId", "variety", "grade", "origin", "processing", "description", "hsnCode", "ingredients", "allergens", "tone"].map((k) => [k, str(fd, k)])),
    gstRateBps: Math.round(Number(str(fd, "gstRate")) * 100),
    shelfLifeDays: str(fd, "shelfLifeDays"),
  });
}

function nutritionFrom(fd: FormData) {
  const n = (k: string) => Number(str(fd, `n_${k}`)) || 0;
  return { energyKcal: n("energyKcal"), protein: n("protein"), carbs: n("carbs"), sugar: n("sugar"), fat: n("fat"), fibre: n("fibre") };
}

export async function createProductAction(fd: FormData) {
  await requireAdmin();
  const p = productFields(fd);
  if (!p.success) redirect(withMsg("/admin/products/new", { error: p.error.issues[0].message }));
  let id = "";
  let error: string | undefined;
  try {
    id = await db.transaction(async (tx) => {
      const [prod] = await tx
        .insert(products)
        .values({ ...p.data, grade: p.data.grade || null, nutrition: nutritionFrom(fd), isFeatured: fd.get("isFeatured") === "on" })
        .returning();
      const [item] = await tx
        .insert(inventoryItems)
        .values({ sku: `${p.data.slug.toUpperCase().replace(/-/g, "")}-BULK`, name: `${p.data.name} (bulk)`, uom: "GRAM", productId: prod.id })
        .returning();
      const [loc] = await tx.select().from(locations).where(eq(locations.isDefault, true));
      await tx.insert(inventoryLevels).values({ itemId: item.id, locationId: loc.id });
      return prod.id;
    });
  } catch (e) {
    error = /unique/i.test(String(e)) ? "That slug or SKU is already used." : "Couldn't create the product.";
  }
  if (error) redirect(withMsg("/admin/products/new", { error }));
  redirect(withMsg(`/admin/products/${id}`, { ok: "Product created with its own bulk stock pool. Add pack sizes next." }));
}

export async function updateProductAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "productId");
  const p = productFields(fd);
  if (!p.success) redirect(withMsg(`/admin/products/${id}`, { error: p.error.issues[0].message }));
  await attempt(`/admin/products/${id}`, "Product saved.", async () => {
    await db
      .update(products)
      .set({ ...p.data, grade: p.data.grade || null, nutrition: nutritionFrom(fd), isActive: fd.get("isActive") === "on", isFeatured: fd.get("isFeatured") === "on" })
      .where(eq(products.id, id));
  });
}

export async function saveVariantAction(fd: FormData) {
  await requireAdmin();
  const productId = str(fd, "productId");
  const variantId = str(fd, "variantId");
  const back = `/admin/products/${productId}`;
  await attempt(back, variantId ? "Pack size saved." : "Pack size added.", async () => {
    const netGrams = int(fd, "netGrams");
    if (!(netGrams > 0)) throw new InventoryError("Net weight must be a positive number of grams.");
    const soldRetail = fd.get("soldRetail") === "on";
    const soldWholesale = fd.get("soldWholesale") === "on";
    if (!soldRetail && !soldWholesale) throw new InventoryError("Sell the pack on retail, wholesale, or both.");
    const retail = paise(fd, "retailPrice");
    const mrp = paise(fd, "mrp");
    const base = paise(fd, "wholesaleBase");
    if (soldRetail && !(retail > 0)) throw new InventoryError("Retail packs need a selling price.");
    if (soldRetail && mrp > 0 && retail > mrp) throw new InventoryError("Selling price can't be above MRP.");
    if (soldWholesale && !(base > 0)) throw new InventoryError("Wholesale packs need a base price.");
    const values = {
      title: str(fd, "title") || `${netGrams >= 1000 ? `${netGrams / 1000} kg` : `${netGrams} g`}`,
      packType: str(fd, "packType") || "Pouch",
      netGrams,
      shipGrams: int(fd, "shipGrams") > 0 ? int(fd, "shipGrams") : Math.round(netGrams * 1.05),
      soldRetail,
      soldWholesale,
      retailPricePaise: soldRetail ? retail : 0,
      mrpPaise: soldRetail ? (mrp > 0 ? mrp : retail) : 0,
      wholesaleBasePaise: soldWholesale ? base : 0,
      wholesaleMinQty: Math.max(1, int(fd, "minQty") || 1),
      wholesaleStep: Math.max(1, int(fd, "step") || 1),
      isActive: fd.get("isActive") !== "off",
    };
    if (variantId) {
      await db.update(variants).set(values).where(and(eq(variants.id, variantId), eq(variants.productId, productId)));
      return;
    }
    const sku = str(fd, "sku").toUpperCase();
    if (!/^[A-Z0-9-]{3,40}$/.test(sku)) throw new InventoryError("SKU: 3–40 letters, numbers or dashes.");
    await db.transaction(async (tx) => {
      const [v] = await tx.insert(variants).values({ ...values, productId, sku }).returning();
      const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.productId, productId)).limit(1);
      if (!item) throw new InventoryError("This product has no stock pool to draw from.");
      await tx.insert(variantComponents).values({ variantId: v.id, inventoryItemId: item.id, requiredQty: netGrams });
    });
  });
}

// ───────────── Wholesale accounts & pricing ─────────────

export async function companyAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "companyId");
  const back = `/admin/companies/${id}`;
  const status = str(fd, "status");
  await attempt(back, "Account updated.", async () => {
    if (!["PENDING", "APPROVED", "REJECTED", "SUSPENDED"].includes(status)) throw new InventoryError("Choose a status.");
    const terms = str(fd, "paymentTerms");
    if (!["PREPAID", "NET_7", "NET_15", "NET_30"].includes(terms)) throw new InventoryError("Choose payment terms.");
    const credit = paise(fd, "creditLimit");
    const [c] = await db.select().from(companies).where(eq(companies.id, id));
    if (status === "APPROVED" && c?.gstin) {
      const g = validateGstin(c.gstin);
      if (!g.ok) throw new InventoryError(`Can't approve: ${g.error}`);
    }
    if (terms !== "PREPAID" && !(credit > 0)) throw new InventoryError("Set a credit limit for accounts on credit terms.");
    await db
      .update(companies)
      .set({
        status: status as "APPROVED",
        paymentTerms: terms as "PREPAID",
        priceListId: optStr(fd, "priceListId"),
        creditLimitPaise: Number.isFinite(credit) ? credit : 0,
        notes: optStr(fd, "notes"),
      })
      .where(eq(companies.id, id));
  });
}

export async function priceListAction(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "priceListId");
  const op = str(fd, "op");
  const back = id ? `/admin/price-lists/${id}` : "/admin/price-lists";
  await attempt(back, "Price list updated.", async () => {
    if (op === "create") {
      const name = str(fd, "name");
      if (name.length < 2) throw new InventoryError("Name the price list.");
      await db.insert(priceLists).values({ name, adjustmentBps: Math.round(Number(str(fd, "adjustment")) * 100) || 0 });
    } else if (op === "adjust") {
      const pct = Number(str(fd, "adjustment"));
      if (!Number.isFinite(pct) || pct < -50 || pct > 50) throw new InventoryError("Adjustment must be between −50% and +50%.");
      await db.update(priceLists).set({ adjustmentBps: Math.round(pct * 100) }).where(eq(priceLists.id, id));
    } else if (op === "addBreak") {
      const minQty = int(fd, "minQty");
      const price = paise(fd, "price");
      if (!(minQty > 1) || !(price > 0)) throw new InventoryError("Breaks need a quantity above 1 and a price.");
      await db
        .insert(priceBreaks)
        .values({ priceListId: id, variantId: str(fd, "variantId"), minQty, unitPricePaise: price })
        .onConflictDoUpdate({ target: [priceBreaks.priceListId, priceBreaks.variantId, priceBreaks.minQty], set: { unitPricePaise: price } });
    } else if (op === "deleteBreak") {
      await db.delete(priceBreaks).where(and(eq(priceBreaks.id, str(fd, "breakId")), eq(priceBreaks.priceListId, id)));
    }
  });
}

export async function couponAdminAction(fd: FormData) {
  await requireAdmin();
  await attempt("/admin/discounts", "Discounts updated.", async () => {
    if (str(fd, "op") === "toggle") {
      const [c] = await db.select().from(coupons).where(eq(coupons.id, str(fd, "couponId")));
      if (c) await db.update(coupons).set({ isActive: !c.isActive }).where(eq(coupons.id, c.id));
      return;
    }
    const code = str(fd, "code").toUpperCase();
    if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new InventoryError("Codes are 3–20 letters or numbers.");
    const type = str(fd, "type") === "FIXED" ? "FIXED" : "PERCENT";
    const value = type === "PERCENT" ? Math.round(Number(str(fd, "value")) * 100) : paise(fd, "value");
    if (!(value > 0) || (type === "PERCENT" && value > 9000)) throw new InventoryError("Enter a discount value (percent up to 90).");
    const ch = str(fd, "channel");
    await db.insert(coupons).values({
      code,
      type,
      value,
      minSubtotalPaise: Math.max(0, paise(fd, "minSubtotal") || 0),
      channel: ch === "RETAIL" || ch === "WHOLESALE" ? ch : null,
      endsAt: str(fd, "endsAt") ? new Date(`${str(fd, "endsAt")}T23:59:59+05:30`) : null,
      usageLimit: int(fd, "usageLimit") > 0 ? int(fd, "usageLimit") : null,
    });
  });
}

export async function settingsAction(fd: FormData) {
  await requireAdmin();
  await attempt("/admin/settings", "Settings saved.", async () => {
    const g = validateGstin(str(fd, "gstin"));
    if (!g.ok) throw new InventoryError(`Store GSTIN: ${g.error}`);
    const stateCode = str(fd, "stateCode");
    if (!(stateCode in STATES)) throw new InventoryError("Choose the warehouse state.");
    if (g.stateCode !== stateCode) throw new InventoryError("The store GSTIN must belong to the warehouse state.");
    if (!/^\d{14}$/.test(str(fd, "fssaiLicence"))) throw new InventoryError("FSSAI licence numbers have 14 digits.");
    const upiId = str(fd, "upiId").trim();
    if (upiId && !UPI_ID_RE.test(upiId)) throw new InventoryError("Check the UPI ID — it looks like name@bank, e.g. nutbox@okhdfcbank.");
    const money = (k: string) => {
      const v = paise(fd, k);
      if (!Number.isFinite(v) || v < 0) throw new InventoryError("Check the amounts — they must be zero or more.");
      return v;
    };
    await db
      .update(settings)
      .set({
        storeName: str(fd, "storeName"),
        legalName: str(fd, "legalName"),
        gstin: g.gstin,
        fssaiLicence: str(fd, "fssaiLicence"),
        addressLine: str(fd, "addressLine"),
        city: str(fd, "city"),
        stateCode,
        pincode: str(fd, "pincode"),
        supportEmail: str(fd, "supportEmail"),
        supportPhone: str(fd, "supportPhone"),
        freeShippingThresholdPaise: money("freeShippingThreshold"),
        retailShippingPaise: money("retailShipping"),
        codLimitPaise: money("codLimit"),
        wholesaleFreightPerKgPaise: money("wholesaleFreightPerKg"),
        wholesaleMinOrderPaise: money("wholesaleMinOrder"),
        bankDetails: str(fd, "bankDetails"),
        upiId,
        upiPayeeName: str(fd, "upiPayeeName").trim().slice(0, 50),
      })
      .where(eq(settings.id, 1));
    await db.update(locations).set({ stateCode }).where(eq(locations.isDefault, true));
    revalidatePath("/", "layout");
  });
}
