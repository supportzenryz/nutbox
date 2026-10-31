import { and, asc, eq, ilike, inArray, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { categories, products, variants } from "@/db/schema";
import { variantAvailability } from "./inventory";
import { pricePerKg } from "./pricing";

export type ProductCard = Awaited<ReturnType<typeof listRetailProducts>>[number];

export async function listCategories() {
  return db.select().from(categories).orderBy(asc(categories.sortOrder));
}

export async function listRetailProducts(f: { category?: string; grade?: string; origin?: string; variety?: string; q?: string; sort?: string; featured?: boolean } = {}) {
  const where: SQL[] = [eq(products.isActive, true)];
  if (f.category) where.push(eq(categories.slug, f.category));
  if (f.origin) where.push(eq(products.origin, f.origin));
  if (f.variety) where.push(eq(products.variety, f.variety));
  if (f.grade) where.push(eq(products.grade, f.grade));
  if (f.featured) where.push(eq(products.isFeatured, true));
  if (f.q) {
    const like = `%${f.q.replace(/[%_\\]/g, "")}%`;
    where.push(or(ilike(products.name, like), ilike(products.variety, like), ilike(products.grade, like), ilike(products.origin, like))!);
  }
  const rows = await db
    .select({ p: products, c: categories })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(...where))
    .orderBy(asc(categories.sortOrder), asc(products.name));
  const ids = rows.map((r) => r.p.id);
  const vs = ids.length
    ? await db
        .select()
        .from(variants)
        .where(and(inArray(variants.productId, ids), eq(variants.soldRetail, true), eq(variants.isActive, true)))
        .orderBy(asc(variants.sortOrder))
    : [];
  const avail = await variantAvailability(db, vs.map((v) => v.id));
  const out = rows
    .map(({ p, c }) => {
      const pv = vs.filter((v) => v.productId === p.id).map((v) => ({ ...v, available: avail.get(v.id) ?? 0 }));
      if (!pv.length) return null;
      const from = pv.reduce((m, v) => (v.retailPricePaise < m.retailPricePaise ? v : m), pv[0]);
      const perKg = Math.min(...pv.map((v) => pricePerKg(v.retailPricePaise, v.netGrams)));
      return { ...p, categorySlug: c.slug, categoryName: c.name, variants: pv, fromPaise: from.retailPricePaise, fromTitle: from.title, perKgPaise: perKg, inStock: pv.some((v) => v.available > 0) };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (f.sort === "price-asc") out.sort((a, b) => a.perKgPaise - b.perKgPaise);
  if (f.sort === "price-desc") out.sort((a, b) => b.perKgPaise - a.perKgPaise);
  if (f.sort === "name") out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

export async function facetValues() {
  const rows = await db.select({ origin: products.origin, grade: products.grade, variety: products.variety }).from(products).where(eq(products.isActive, true));
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort();
  return { origins: uniq(rows.map((r) => r.origin)), grades: uniq(rows.map((r) => r.grade)), varieties: uniq(rows.map((r) => r.variety)) };
}

export async function getProduct(slug: string) {
  const [row] = await db
    .select({ p: products, c: categories })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.slug, slug), eq(products.isActive, true)));
  if (!row) return null;
  const vs = await db
    .select()
    .from(variants)
    .where(and(eq(variants.productId, row.p.id), eq(variants.isActive, true)))
    .orderBy(asc(variants.sortOrder));
  const avail = await variantAvailability(db, vs.map((v) => v.id));
  return { ...row.p, category: row.c, variants: vs.map((v) => ({ ...v, available: avail.get(v.id) ?? 0 })) };
}

export const packKind = (packType: string, channel: "RETAIL" | "WHOLESALE" = "RETAIL") =>
  /box/i.test(packType) ? ("box" as const) : channel === "WHOLESALE" || /bag|tin|carton|vacuum/i.test(packType) ? ("sack" as const) : ("pouch" as const);
