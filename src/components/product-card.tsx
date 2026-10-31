import Link from "next/link";
import type { ProductCard as P } from "@/lib/catalog";
import { rupees } from "@/lib/format";
import { Packshot } from "./packshot";

export function ProductCard({ p }: { p: P }) {
  const kind = p.categorySlug === "gift-boxes" ? "box" : "pouch";
  return (
    <Link href={`/p/${p.slug}`} className="group block">
      <div className="overflow-hidden rounded border border-line bg-card transition-colors group-hover:border-pista">
        <Packshot kind={kind} tone={p.tone} mark={kind === "box" ? "FESTIVE" : p.grade?.split(" ")[0] ?? p.variety.toUpperCase()} sub={p.origin} className="aspect-square w-full" title={p.name} />
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold leading-snug group-hover:text-pista">{p.name}</h3>
          <p className="text-xs text-muted">
            {p.origin}
            {p.processing !== "Raw" && p.processing !== "Assorted" ? ` · ${p.processing}` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="num font-semibold">{rupees(p.fromPaise)}</p>
          <p className="num text-xs text-muted">{p.fromTitle}</p>
        </div>
      </div>
      {!p.inStock && <p className="mt-1 text-xs font-medium text-danger">Out of stock</p>}
    </Link>
  );
}
