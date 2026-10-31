import Link from "next/link";
import { redirect } from "next/navigation";
import { applyWholesaleAction } from "@/app/actions/auth";
import { Flash } from "@/components/store-chrome";
import { currentUser } from "@/lib/auth";
import { STATE_OPTIONS } from "@/lib/states";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apply for wholesale" };

const TYPES = ["Sweet shop / bakery", "Hotel / restaurant / caterer", "Kirana / retail store", "Distributor / trader", "Corporate gifting / office pantry", "Other"];

export default async function Apply({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const u = await currentUser();
  if (u?.company) redirect("/wholesale");
  return (
    <div className="shell max-w-3xl py-10">
      <h1 className="text-3xl font-semibold">Apply for a wholesale account</h1>
      <p className="mt-2 text-muted">We check the GSTIN against your address and approve most businesses within one working day.</p>
      <div className="mt-6"><Flash sp={sp} /></div>
      <form action={applyWholesaleAction} className="space-y-8">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-lg font-semibold">Your business</legend>
          <div className="sm:col-span-2">
            <label htmlFor="legalName" className="label">Legal name</label>
            <input id="legalName" name="legalName" required className="field" placeholder="As on your GST certificate" />
          </div>
          <div>
            <label htmlFor="tradeName" className="label">Trade name <span className="font-normal text-muted">(optional)</span></label>
            <input id="tradeName" name="tradeName" className="field" />
          </div>
          <div>
            <label htmlFor="businessType" className="label">Type of business</label>
            <select id="businessType" name="businessType" required defaultValue="" className="field">
              <option value="" disabled>Choose</option>
              {TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="gstin" className="label">GSTIN</label>
            <input id="gstin" name="gstin" maxLength={15} className="field font-mono uppercase tracking-wider" placeholder="33AABCN1234F1Z5" />
            <p className="hint">We validate the format and checksum now, and verify registration before approval.</p>
            <label className="mt-2 flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="noGstin" className="h-4 w-4 accent-pista" /> We're not GST-registered (we'll ask for a shop licence or Udyam certificate)
            </label>
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="addressLine" className="label">Business address</label>
            <input id="addressLine" name="addressLine" required className="field" />
          </div>
          <div>
            <label htmlFor="city" className="label">City</label>
            <input id="city" name="city" required className="field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="pincode" className="label">PIN code</label>
              <input id="pincode" name="pincode" required inputMode="numeric" pattern="[1-9][0-9]{5}" className="field" />
            </div>
            <div>
              <label htmlFor="stateCode" className="label">State</label>
              <select id="stateCode" name="stateCode" required defaultValue="" className="field">
                <option value="" disabled>Choose</option>
                {STATE_OPTIONS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-3 text-lg font-semibold">Who's ordering</legend>
          <div><label htmlFor="name" className="label">Contact name</label><input id="name" name="name" required defaultValue={u?.name} className="field" /></div>
          <div><label htmlFor="phone" className="label">Mobile number</label><input id="phone" name="phone" required inputMode="numeric" pattern="[6-9][0-9]{9}" defaultValue={u?.phone ?? ""} className="field" /></div>
          <div><label htmlFor="email" className="label">Email</label><input id="email" name="email" type="email" required defaultValue={u?.email} className="field" /></div>
          <div>
            <label htmlFor="password" className="label">{u ? "Your current password" : "Create a password"}</label>
            <input id="password" name="password" type="password" required minLength={8} className="field" />
          </div>
        </fieldset>

        <button className="btn-primary px-8">Submit application</button>
        <p className="text-xs text-muted">
          We use these details to verify your business and issue GST invoices. See our <Link href="/policies" className="link">privacy notice</Link>.
        </p>
      </form>
    </div>
  );
}
