import type { Nutrition } from "@/db/schema";

type P = {
  id?: string;
  name?: string;
  slug?: string;
  categoryId?: string;
  variety?: string;
  grade?: string | null;
  origin?: string;
  processing?: string;
  description?: string;
  hsnCode?: string;
  gstRateBps?: number;
  ingredients?: string;
  allergens?: string;
  shelfLifeDays?: number;
  tone?: string;
  nutrition?: Nutrition;
  isActive?: boolean;
  isFeatured?: boolean;
};

export function ProductFields({ p = {}, categories }: { p?: P; categories: { id: string; name: string }[] }) {
  const n = p.nutrition ?? { energyKcal: 0, protein: 0, carbs: 0, sugar: 0, fat: 0, fibre: 0 };
  const F = ({ name, label, d, hint, wide, ...rest }: { name: string; label: string; d?: string | number | null; hint?: string; wide?: boolean } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label htmlFor={name} className="label">{label}</label>
      <input id={name} name={name} defaultValue={d ?? ""} className="field" {...rest} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <F name="name" label="Product name" d={p.name} required />
        <F name="slug" label="URL slug" d={p.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" hint="Lowercase, dashes. Used in /p/your-slug." />
        <div>
          <label htmlFor="categoryId" className="label">Aisle</label>
          <select id="categoryId" name="categoryId" defaultValue={p.categoryId ?? ""} required className="field">
            <option value="" disabled>Choose</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <F name="variety" label="Variety" d={p.variety} required placeholder="Cashew" />
        <F name="grade" label="Grade" d={p.grade} placeholder="W240, Mamra, Medjool…" hint="Shown as the stencil mark on packs." />
        <F name="origin" label="Country of origin" d={p.origin} required hint="Required on listings and powers the origin filter." />
        <F name="processing" label="Processing" d={p.processing ?? "Raw"} required />
        <div className="grid grid-cols-2 gap-3">
          <F name="hsnCode" label="HSN" d={p.hsnCode} required pattern="[0-9]{4,8}" />
          <F name="gstRate" label="GST %" d={(p.gstRateBps ?? 500) / 100} required inputMode="decimal" />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="description" className="label">Description</label>
          <textarea id="description" name="description" defaultValue={p.description} required rows={3} className="field" />
        </div>
        <F name="ingredients" label="Ingredients" d={p.ingredients} required wide />
        <F name="allergens" label="Allergen statement" d={p.allergens ?? "Contains tree nuts. Packed in a facility that also handles peanuts and sesame."} required wide />
        <F name="shelfLifeDays" label="Shelf life (days)" d={p.shelfLifeDays ?? 180} required inputMode="numeric" />
        <div>
          <label htmlFor="tone" className="label">Pack colour</label>
          <input id="tone" name="tone" type="color" defaultValue={p.tone ?? "#C8A27A"} className="h-10 w-20 rounded border border-line" />
        </div>
      </div>
      <fieldset>
        <legend className="label">Nutrition per 100 g</legend>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {(["energyKcal", "protein", "carbs", "sugar", "fat", "fibre"] as const).map((k) => (
            <div key={k}>
              <label htmlFor={`n_${k}`} className="text-xs text-muted">{{ energyKcal: "Energy kcal", protein: "Protein g", carbs: "Carbs g", sugar: "Sugar g", fat: "Fat g", fibre: "Fibre g" }[k]}</label>
              <input id={`n_${k}`} name={`n_${k}`} defaultValue={n[k]} inputMode="decimal" className="field num" />
            </div>
          ))}
        </div>
      </fieldset>
      <div className="flex gap-6 text-sm">
        {p.id && <label className="flex items-center gap-2"><input type="checkbox" name="isActive" defaultChecked={p.isActive ?? true} className="h-4 w-4 accent-pista" />Visible in store</label>}
        <label className="flex items-center gap-2"><input type="checkbox" name="isFeatured" defaultChecked={p.isFeatured} className="h-4 w-4 accent-pista" />Feature on home page</label>
      </div>
    </div>
  );
}
