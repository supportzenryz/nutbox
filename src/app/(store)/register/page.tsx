import Link from "next/link";
import { registerAction } from "@/app/actions/auth";
import { Flash } from "@/components/store-chrome";

export const metadata = { title: "Create account" };

export default async function Register({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="shell flex justify-center py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-semibold">Create an account</h1>
        <div className="mt-6"><Flash sp={sp} /></div>
        <form action={registerAction} className="space-y-4">
          <input type="hidden" name="next" value={sp.next ?? "/account"} />
          <div><label htmlFor="name" className="label">Full name</label><input id="name" name="name" required autoComplete="name" className="field" /></div>
          <div><label htmlFor="email" className="label">Email</label><input id="email" name="email" type="email" required autoComplete="email" className="field" /></div>
          <div><label htmlFor="phone" className="label">Mobile number</label><input id="phone" name="phone" required inputMode="numeric" pattern="[6-9][0-9]{9}" autoComplete="tel-national" className="field" /></div>
          <div><label htmlFor="password" className="label">Password</label><input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="field" /><p className="hint">At least 8 characters.</p></div>
          <label className="flex items-start gap-2 text-sm text-muted">
            <input type="checkbox" name="marketing" className="mt-0.5 h-4 w-4 accent-pista" />
            Send me offers and new-harvest updates by email. You can unsubscribe any time.
          </label>
          <button className="btn-primary w-full">Create account</button>
        </form>
        <p className="mt-4 text-xs text-muted">We use your details to process orders, as described in our <Link href="/policies" className="link">privacy notice</Link>.</p>
        <p className="mt-4 text-sm text-muted">Already have an account? <Link href="/login" className="link">Sign in</Link></p>
      </div>
    </div>
  );
}
