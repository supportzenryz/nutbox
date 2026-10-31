"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ counts, isAdmin }: { counts: { orders: number; quotes: number; companies: number }; isAdmin: boolean }) {
  const path = usePathname();
  const items: { href: string; label: string; n?: number; adminOnly?: boolean }[] = [
    { href: "/admin", label: "Home" },
    { href: "/admin/orders", label: "Orders", n: counts.orders },
    { href: "/admin/orders?view=quotes", label: "Quotes", n: counts.quotes },
    { href: "/admin/inventory", label: "Inventory" },
    { href: "/admin/products", label: "Products" },
    { href: "/admin/companies", label: "Wholesale accounts", n: counts.companies },
    { href: "/admin/price-lists", label: "Price lists", adminOnly: true },
    { href: "/admin/discounts", label: "Discounts", adminOnly: true },
    { href: "/admin/reports", label: "GST reports" },
    { href: "/admin/settings", label: "Settings", adminOnly: true },
  ];
  const active = (href: string) => {
    const base = href.split("?")[0];
    if (href.includes("view=quotes")) return false;
    return base === "/admin" ? path === "/admin" : path.startsWith(base);
  };
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 text-sm lg:block lg:space-y-0.5 lg:overflow-visible" aria-label="Admin">
      {items
        .filter((i) => isAdmin || !i.adminOnly)
        .map((i) => (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active(i.href) ? "page" : undefined}
            className={`flex items-center justify-between whitespace-nowrap rounded px-3 py-2 ${active(i.href) ? "bg-white/10 font-semibold text-white" : "hover:bg-white/5 hover:text-white"}`}
          >
            {i.label}
            {i.n ? <span className="num ml-2 rounded-full bg-saffron px-1.5 text-[11px] font-semibold text-ink">{i.n}</span> : null}
          </Link>
        ))}
    </nav>
  );
}
