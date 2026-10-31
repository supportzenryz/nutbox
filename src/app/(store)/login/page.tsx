import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { Flash } from "@/components/store-chrome";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  const next = sp.next ?? "";
  return (
    <div className="shell flex justify-center py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-semibold">Sign in</h1>
        <p className="mt-1 text-sm text-muted">One account for retail orders and your wholesale portal.</p>
        <div className="mt-6"><Flash sp={sp} /></div>
        <form action={loginAction} className="space-y-4">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="field" />
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" className="field" />
          </div>
          <button className="btn-primary w-full">Sign in</button>
        </form>
        <p className="mt-6 text-sm text-muted">
          New here? <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link">Create an account</Link>
          <br />
          Buying for a business? <Link href="/wholesale/apply" className="link">Apply for wholesale</Link>
        </p>
        {process.env.NODE_ENV !== "production" && (
          <div className="mt-8 rounded border border-dashed border-line p-3 text-xs text-muted">
            <p className="font-semibold text-ink">Demo accounts</p>
            <p>Admin: admin@nutbox.in / admin123</p>
            <p>Retail: priya@example.com / customer123</p>
            <p>Wholesale: orders@sksweets.in / wholesale123</p>
          </div>
        )}
      </div>
    </div>
  );
}
