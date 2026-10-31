import Link from "next/link";
import { notFound } from "next/navigation";
import { addToCartAction } from "@/app/actions/shop";
import { Packshot, VegMark } from "@/components/packshot";
import { Flash } from "@/components/store-chrome";
import { getProduct } from "@/lib/catalog";
import { pct, rupees, weight } from "@/lib/format";
import { pricePerKg, RETAIL_MAX_PER_LINE } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await getProduct((await params).slug);
  return { title: p ? `${p.name}${p.grade ? ` (${p.grade})` : ""}` : "Not found", description: p?.description };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ v?: string; error?: string; ok?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const [p, s] = await Promise.all([getProduct(slug), getSettings()]);
  if (!p) notFound();
  const retail = p.variants.filter((v) => v.soldRetail);
  if (!retail.length) notFound();
  const v = retail.find((x) => x.id === sp.v) ?? retail.find((x) => x.available > 0) ?? retail[0];
  const kind = p.category.slug === "gift-boxes" ? "box" : "pouch";
  const off = v.mrpPaise > v.retailPricePaise ? Math.round(((v.mrpPaise - v.retailPricePaise) / v.mrpPaise) * 100) : 0;
  const n = p.nutrition;
  const wholesaleCount = p.variants.filter((x) => x.soldWholesale).length;

  return (
    <div className="shell py-8">
      <nav className="text-sm text-muted" aria-label="Breadcrumb">
        <Link href="/shop" className="hover:text-ink">Shop</Link> /{" "}
        <Link href={`/shop?category=${p.category.slug}`} className="hover:text-ink">{p.category.name}</Link>
      </nav>
      <div className="mt-4 grid gap-10 lg:grid-cols-2">
        <div>
          <div className="overflow-hidden rounded border border-line bg-card">
            <Packshot kind={kind} tone={p.tone} mark={kind === "box" ? "FESTIVE" : p.grade?.split(" ")[0] ?? p.variety.toUpperCase()} sub={`${p.origin} · ${v.title}`} className="aspect-square w-full" title={p.name} />
          </div>
          <p className="mt-2 text-xs text-muted">Illustration. Actual pack is a food-grade, nitrogen-flushed kraft pouch with a zip lock.</p>
        </div>

        <div>
          <div className="flex items-center gap-2 text-sm text-muted">
            {p.isVeg && <VegMark />}
            <span>{p.variety}</span>
            {p.grade && (
              <>
                <span aria-hidden>·</span>
                <span className="stamp text-lg text-pista">{p.grade}</span>
              </>
            )}
          </div>
          <h1 className="mt-1 text-3xl font-semibold">{p.name}</h1>
          <p className="mt-3 max-w-prose leading-relaxed text-muted">{p.description}</p>

          <div className="mt-6">
            <p className="text-sm font-medium" id="pack-label">Pack size</p>
            <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="pack-label">
              {retail.map((x) => (
                <Link
                  key={x.id}
                  href={`?v=${x.id}`}
                  scroll={false}
                  role="radio"
                  aria-checked={x.id === v.id}
                  className={`rounded border px-3 py-2 text-sm ${x.id === v.id ? "border-pista bg-pista-soft font-semibold text-pista-deep" : "border-line bg-card hover:border-pista"} ${x.available <= 0 ? "opacity-50" : ""}`}
                >
                  {x.title}
                  <span className="num ml-2 text-xs text-muted">{rupees(x.retailPricePaise)}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-end gap-3">
            <p className="num text-3xl font-semibold">{rupees(v.retailPricePaise)}</p>
            {off > 0 && (
              <p className="pb-1 text-sm text-muted">
                MRP <s className="num">{rupees(v.mrpPaise)}</s> <span className="font-semibold text-pista">{off}% off</span>
              </p>
            )}
          </div>
          <p className="num mt-1 text-sm text-muted">
            {rupees(pricePerKg(v.retailPricePaise, v.netGrams))} per kg · Inclusive of all taxes · Net qty {weight(v.netGrams)}
          </p>

          <Flash sp={sp} />
          <form action={addToCartAction} className="mt-5 flex flex-wrap items-end gap-3">
            <input type="hidden" name="variantId" value={v.id} />
            <input type="hidden" name="channel" value="RETAIL" />
            <div>
              <label htmlFor="qty" className="label">Quantity</label>
              <select id="qty" name="qty" className="field w-24" disabled={v.available <= 0}>
                {Array.from({ length: Math.min(RETAIL_MAX_PER_LINE, Math.max(1, v.available)) }, (_, i) => i + 1).map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>
            <button className="btn-primary px-6" disabled={v.available <= 0}>
              {v.available > 0 ? "Add to cart" : "Out of stock"}
            </button>
          </form>
          {v.available > 0 && v.available <= 10 && <p className="mt-2 text-sm font-medium text-saffron">Only {v.available} left in this size.</p>}
          <p className="mt-3 text-sm text-muted">
            Free delivery over {rupees(s.freeShippingThresholdPaise)}. Ships from {s.city} in 1–2 working days. Cash on delivery available.
          </p>
          {wholesaleCount > 0 && (
            <p className="mt-2 text-sm">
              Need {p.variants.filter((x) => x.soldWholesale).map((x) => x.title.split(" ").slice(0, 2).join(" ")).join(", ")}?{" "}
              <Link href="/wholesale" className="link">See wholesale pricing</Link>
            </p>
          )}

          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-6 text-sm">
            <div><dt className="text-muted">Country of origin</dt><dd className="font-medium">{p.origin}</dd></div>
            <div><dt className="text-muted">Processing</dt><dd className="font-medium">{p.processing}</dd></div>
            <div><dt className="text-muted">Shelf life</dt><dd className="font-medium">{p.shelfLifeDays} days from packing; best before printed on pack</dd></div>
            <div><dt className="text-muted">Net quantity</dt><dd className="font-medium">{weight(v.netGrams)}</dd></div>
            <div className="col-span-2"><dt className="text-muted">Ingredients</dt><dd className="font-medium">{p.ingredients}</dd></div>
            <div className="col-span-2"><dt className="text-muted">Allergen information</dt><dd className="font-medium">{p.allergens}</dd></div>
          </dl>

          <div className="mt-6 border-t border-line pt-6">
            <h2 className="text-sm font-semibold">Nutrition per 100 g (approx.)</h2>
            <table className="table mt-2 max-w-sm">
              <tbody>
                {[
                  ["Energy", `${n.energyKcal} kcal`],
                  ["Protein", `${n.protein} g`],
                  ["Carbohydrate", `${n.carbs} g`],
                  ["of which sugars", `${n.sugar} g`],
                  ["Total fat", `${n.fat} g`],
                  ["Dietary fibre", `${n.fibre} g`],
                ].map(([k, val]) => (
                  <tr key={k}><td className="text-muted">{k}</td><td className="num text-right">{val}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-6 border-t border-line pt-6 text-xs leading-relaxed text-muted">
            Marketed and packed by {s.legalName}, {s.addressLine}, {s.city} {s.pincode}. FSSAI Lic. No. {s.fssaiLicence}. HSN {p.hsnCode}, GST {pct(p.gstRateBps)}. Consumer care: {s.supportPhone}, {s.supportEmail}.
          </p>
        </div>
      </div>
    </div>
  );
}
