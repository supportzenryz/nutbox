import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { saveVariantAction, updateProductAction } from "@/app/actions/admin";
import { PageHead } from "@/components/admin-ui";
import { ProductFields } from "@/components/product-form";
import { Flash } from "@/components/store-chrome";
import { db } from "@/db";
import { inventoryItems, products, variants } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { listCategories } from "@/lib/catalog";
import { variantAvailability } from "@/lib/inventory";

export const metadata = { title: "Edit product" };

type V = typeof variants.$inferSelect;

function VariantRow({ v, productId }: { v?: V; productId: string }) {
  const r = (p?: number) => (p ? (p / 100).toFixed(2) : "");
  return (
    <form action={saveVariantAction} className="grid grid-cols-2 items-end gap-2 border-t border-line p-4 md:grid-cols-[1.2fr_0.8fr_0.7fr_0.7fr_auto_0.8fr_0.8fr_auto_0.8fr_0.6fr_0.6fr_auto]">
      <input type="hidden" name="productId" value={productId} />
      {v && <input type="hidden" name="variantId" value={v.id} />}
      <div><label className="text-xs text-muted">{v ? "SKU" : "New SKU"}</label>{v ? <p className="py-2 text-xs font-medium">{v.sku}</p> : <input name="sku" required className="field py-1.5 uppercase" placeholder="CASHEWW240-2KG" />}</div>
      <div><label className="text-xs text-muted">Title</label><input name="title" defaultValue={v?.title} className="field py-1.5" placeholder="2 kg" /></div>
      <div><label className="text-xs text-muted">Net g</label><input name="netGrams" defaultValue={v?.netGrams} required inputMode="numeric" className="field num py-1.5" /></div>
      <div><label className="text-xs text-muted">Pack</label><input name="packType" defaultValue={v?.packType ?? "Pouch"} className="field py-1.5" /></div>
      <label className="flex items-center gap-1 pb-2 text-xs"><input type="checkbox" name="soldRetail" defaultChecked={v?.soldRetail ?? true} className="accent-pista" />Retail</label>
      <div><label className="text-xs text-muted">Price ₹</label><input name="retailPrice" defaultValue={r(v?.retailPricePaise)} inputMode="decimal" className="field num py-1.5" /></div>
      <div><label className="text-xs text-muted">MRP ₹</label><input name="mrp" defaultValue={r(v?.mrpPaise)} inputMode="decimal" className="field num py-1.5" /></div>
      <label className="flex items-center gap-1 pb-2 text-xs"><input type="checkbox" name="soldWholesale" defaultChecked={v?.soldWholesale} className="accent-pista" />Wholesale</label>
      <div><label className="text-xs text-muted">Base ₹ ex-GST</label><input name="wholesaleBase" defaultValue={r(v?.wholesaleBasePaise)} inputMode="decimal" className="field num py-1.5" /></div>
      <div><label className="text-xs text-muted">MOQ</label><input name="minQty" defaultValue={v?.wholesaleMinQty ?? 1} inputMode="numeric" className="field num py-1.5" /></div>
      <div><label className="text-xs text-muted">Step</label><input name="step" defaultValue={v?.wholesaleStep ?? 1} inputMode="numeric" className="field num py-1.5" /></div>
      <div className="flex items-center gap-2">
        {v && (
          <select name="isActive" defaultValue={v.isActive ? "on" : "off"} className="field w-auto py-1.5 text-xs" aria-label="Status">
            <option value="on">Live</option>
            <option value="off">Hidden</option>
          </select>
        )}
        <button className={v ? "btn-ghost btn-sm" : "btn-primary btn-sm"}>{v ? "Save" : "Add"}</button>
      </div>
    </form>
  );
}

export default async function EditProduct({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [[p], cats, vs, [item], u] = await Promise.all([
    db.select().from(products).where(eq(products.id, id)),
    listCategories(),
    db.select().from(variants).where(eq(variants.productId, id)).orderBy(asc(variants.sortOrder), asc(variants.netGrams)),
    db.select().from(inventoryItems).where(eq(inventoryItems.productId, id)),
    currentUser(),
  ]);
  if (!p) notFound();
  const avail = await variantAvailability(db, vs.map((v) => v.id));
  const admin = u?.role === "ADMIN";
  return (
    <>
      <Link href="/admin/products" className="text-sm text-muted hover:text-ink">Products</Link>
      <PageHead title={p.name} sub={<>Stock pool: {item ? <Link href={`/admin/inventory/${item.id}`} className="link">{item.name}</Link> : "none"} · <Link href={`/p/${p.slug}`} className="link">View in store</Link></>} />
      <Flash sp={sp} />
      <section className="panel mb-6">
        <div className="px-4 pt-4">
          <h2 className="font-semibold">Pack sizes</h2>
          <p className="text-sm text-muted">Each pack draws its net weight from the shared pool. Retail prices include GST; wholesale base prices exclude it.</p>
        </div>
        <div className="mt-2 overflow-x-auto">
          <div className="min-w-[1080px]">
            {vs.map((v) => (
              <div key={v.id} className="relative">
                <VariantRow v={v} productId={p.id} />
                <span className="num absolute right-4 top-1 text-[11px] text-muted">{Number.isFinite(avail.get(v.id)) ? `${avail.get(v.id)} sellable` : ""}</span>
              </div>
            ))}
            {admin && <VariantRow productId={p.id} />}
          </div>
        </div>
      </section>
      {admin ? (
        <form action={updateProductAction} className="panel max-w-4xl space-y-6 p-6">
          <input type="hidden" name="productId" value={p.id} />
          <h2 className="font-semibold">Details and label information</h2>
          <ProductFields p={p} categories={cats} />
          <button className="btn-primary">Save product</button>
        </form>
      ) : (
        <p className="text-sm text-muted">Only admins can edit product details.</p>
      )}
    </>
  );
}
