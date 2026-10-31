import Link from "next/link";
import { logoutAction } from "@/app/actions/auth";
import { currentUser, isStaff } from "@/lib/auth";
import { readCart } from "@/lib/cart";
import { listCategories } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { stateName } from "@/lib/states";
import { rupees } from "@/lib/format";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`stamp text-[28px] text-pista ${className}`}>
      NUTBOX
    </span>
  );
}

export async function StoreHeader({ portal = "retail" }: { portal?: "retail" | "wholesale" }) {
  const [u, cart, cats, s] = await Promise.all([currentUser(), readCart(portal === "retail" ? "RETAIL" : "WHOLESALE"), listCategories(), getSettings()]);
  const count = cart.reduce((a, i) => a + (portal === "retail" ? i.q : 1), 0);
  return (
    <header className="border-b border-line bg-card">
      <div className="bg-pista text-pista-soft">
        <div className="shell flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-1.5 text-xs">
          <span>
            {portal === "retail"
              ? `Free delivery over ${rupees(s.freeShippingThresholdPaise)} · Cash on delivery up to ${rupees(s.codLimitPaise)}`
              : `GST invoices on every order · Freight ${rupees(s.wholesaleFreightPerKgPaise)}/kg · Net terms for approved accounts`}
          </span>
          <span className="flex gap-4">
            {portal === "retail" ? (
              <Link href="/wholesale" className="font-semibold text-white hover:underline">
                Buying for a business? Wholesale prices
              </Link>
            ) : (
              <Link href="/" className="font-semibold text-white hover:underline">
                Back to the retail store
              </Link>
            )}
          </span>
        </div>
      </div>
      <div className="shell flex items-center gap-6 py-3">
        <Link href={portal === "retail" ? "/" : "/wholesale"} className="flex items-baseline gap-2" aria-label="Nutbox home">
          <Wordmark />
          {portal === "wholesale" && <span className="rounded bg-jute-soft px-1.5 py-0.5 text-xs font-semibold text-jute">Wholesale</span>}
        </Link>
        {portal === "retail" && (
          <form action="/shop" className="hidden flex-1 md:block">
            <label className="sr-only" htmlFor="q">
              Search
            </label>
            <input id="q" name="q" className="field max-w-md" placeholder="Search W240, Mamra, Medjool…" />
          </form>
        )}
        <nav className="ml-auto flex items-center gap-4 text-sm font-medium">
          {isStaff(u) && (
            <Link href="/admin" className="link">
              Admin
            </Link>
          )}
          {u ? (
            <>
              <Link href="/account" className="hover:text-pista">
                {u.name.split(" ")[0]}
              </Link>
              <form action={logoutAction}>
                <button className="text-muted hover:text-ink">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="hover:text-pista">
              Sign in
            </Link>
          )}
          <Link href={portal === "retail" ? "/cart" : "/wholesale/cart"} className="btn-ghost btn-sm">
            Cart{count ? <span className="num rounded-full bg-saffron px-1.5 text-[11px] text-ink">{count}</span> : null}
          </Link>
        </nav>
      </div>
      {portal === "retail" && (
        <nav className="shell flex gap-5 overflow-x-auto pb-2 text-sm text-muted" aria-label="Categories">
          <Link href="/shop" className="whitespace-nowrap hover:text-ink">
            All products
          </Link>
          {cats.map((c) => (
            <Link key={c.id} href={`/shop?category=${c.slug}`} className="whitespace-nowrap hover:text-ink">
              {c.name}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

export async function StoreFooter() {
  const s = await getSettings();
  return (
    <footer className="mt-16 border-t border-line bg-card text-sm text-muted">
      <div className="shell grid gap-8 py-10 md:grid-cols-4">
        <div className="md:col-span-2">
          <Wordmark className="text-2xl" />
          <p className="mt-2 max-w-sm">Nuts and dry fruits sold by grade, from one fresh stock — the same lots go into a 250 g pouch and a 25 kg bag.</p>
        </div>
        <div>
          <p className="font-semibold text-ink">Shop</p>
          <ul className="mt-2 space-y-1">
            <li><Link href="/shop" className="hover:text-ink">All products</Link></li>
            <li><Link href="/shop?category=gift-boxes" className="hover:text-ink">Gift boxes</Link></li>
            <li><Link href="/wholesale" className="hover:text-ink">Wholesale</Link></li>
            <li><Link href="/policies" className="hover:text-ink">Shipping, returns & privacy</Link></li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-ink">Seller</p>
          <address className="mt-2 not-italic leading-relaxed">
            {s.legalName}
            <br />
            {s.addressLine}, {s.city} {s.pincode}, {stateName(s.stateCode)}
            <br />
            GSTIN {s.gstin} · FSSAI Lic. {s.fssaiLicence}
            <br />
            Grievance officer: {s.supportEmail}, {s.supportPhone}
          </address>
        </div>
      </div>
    </footer>
  );
}

export function Flash({ sp }: { sp: { error?: string; ok?: string } }) {
  if (sp.error)
    return (
      <div role="alert" className="mb-4 rounded border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
        {sp.error}
      </div>
    );
  if (sp.ok)
    return (
      <div role="status" className="mb-4 rounded border border-pista/20 bg-pista-soft px-4 py-3 text-sm text-pista-deep">
        {sp.ok}
      </div>
    );
  return null;
}
