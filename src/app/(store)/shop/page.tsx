import Link from "next/link";
import { ProductCard } from "@/components/product-card";
import { facetValues, listCategories, listRetailProducts } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop" };

type SP = { category?: string; grade?: string; origin?: string; variety?: string; q?: string; sort?: string };

function href(sp: SP, patch: Partial<SP>) {
  const next = { ...sp, ...patch };
  const qs = new URLSearchParams(Object.entries(next).filter(([, v]) => v) as [string, string][]).toString();
  return `/shop${qs ? `?${qs}` : ""}`;
}

function FacetGroup({ title, name, values, sp }: { title: string; name: keyof SP; values: { value: string; label: string }[]; sp: SP }) {
  return (
    <fieldset className="border-t border-line py-4">
      <legend className="mb-2 text-sm font-semibold">{title}</legend>
      <ul className="space-y-1 text-sm">
        <li>
          <Link href={href(sp, { [name]: undefined })} className={!sp[name] ? "font-semibold text-pista" : "text-muted hover:text-ink"}>
            Any
          </Link>
        </li>
        {values.map((v) => (
          <li key={v.value}>
            <Link href={href(sp, { [name]: v.value })} className={sp[name] === v.value ? "font-semibold text-pista" : "text-muted hover:text-ink"} aria-current={sp[name] === v.value}>
              {v.label}
            </Link>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export default async function Shop({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [items, cats, facets] = await Promise.all([listRetailProducts(sp), listCategories(), facetValues()]);
  const cat = cats.find((c) => c.slug === sp.category);
  return (
    <div className="shell py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{sp.q ? `Results for "${sp.q}"` : cat?.name ?? "All products"}</h1>
          <p className="mt-1 text-sm text-muted">
            {items.length} product{items.length === 1 ? "" : "s"}
            {cat?.blurb ? ` · ${cat.blurb}` : ""}
          </p>
        </div>
        <form className="flex items-center gap-2 text-sm">
          {Object.entries(sp)
            .filter(([k, v]) => k !== "sort" && v)
            .map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
          <label htmlFor="sort" className="text-muted">
            Sort
          </label>
          <select id="sort" name="sort" defaultValue={sp.sort ?? ""} className="field w-auto py-1.5">
            <option value="">By aisle</option>
            <option value="price-asc">Price per kg, low to high</option>
            <option value="price-desc">Price per kg, high to low</option>
            <option value="name">Name</option>
          </select>
          <button className="btn-ghost btn-sm">Apply</button>
        </form>
      </div>

      <div className="mt-6 grid gap-8 md:grid-cols-[200px_1fr]">
        <aside aria-label="Filters">
          <FacetGroup title="Aisle" name="category" sp={sp} values={cats.map((c) => ({ value: c.slug, label: c.name }))} />
          <FacetGroup title="Grade" name="grade" sp={sp} values={facets.grades.map((g) => ({ value: g, label: g }))} />
          <FacetGroup title="Country of origin" name="origin" sp={sp} values={facets.origins.map((o) => ({ value: o, label: o }))} />
          <FacetGroup title="Variety" name="variety" sp={sp} values={facets.varieties.map((o) => ({ value: o, label: o }))} />
        </aside>
        <div>
          {items.length ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-3">
              {items.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          ) : (
            <div className="panel p-8 text-center">
              <p className="font-semibold">Nothing matches those filters.</p>
              <Link href="/shop" className="link mt-2 inline-block text-sm">
                Clear filters
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
