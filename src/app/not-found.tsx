import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="stamp text-6xl text-pista">404</p>
      <p className="text-lg font-semibold">We couldn't find that page.</p>
      <Link href="/shop" className="btn-primary">Go to the shop</Link>
    </div>
  );
}
