import { settingsAction } from "@/app/actions/admin";
import { PageHead } from "@/components/admin-ui";
import { Flash } from "@/components/store-chrome";
import { requireAdmin } from "@/lib/auth";
import { demoPaymentsEnabled, razorpayEnabled } from "@/lib/razorpay";
import { getSettings } from "@/lib/settings";
import { STATE_OPTIONS } from "@/lib/states";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requireAdmin();
  const [sp, s] = await Promise.all([searchParams, getSettings()]);
  const F = ({ name, label, d, hint, wide }: { name: string; label: string; d: string | number; hint?: string; wide?: boolean }) => (
    <div className={wide ? "sm:col-span-2" : ""}>
      <label htmlFor={name} className="label">{label}</label>
      <input id={name} name={name} defaultValue={d} required className="field" />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
  const r = (p: number) => (p / 100).toFixed(0);
  return (
    <>
      <PageHead title="Settings" />
      <Flash sp={sp} />
      <form action={settingsAction} className="max-w-3xl space-y-6">
        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Business and tax registration</h2>
          <F name="storeName" label="Store name" d={s.storeName} />
          <F name="legalName" label="Legal name" d={s.legalName} hint="Printed on invoices." />
          <F name="gstin" label="GSTIN" d={s.gstin} />
          <F name="fssaiLicence" label="FSSAI licence no." d={s.fssaiLicence} hint="14 digits; shown on every product page." />
          <F name="addressLine" label="Warehouse address" d={s.addressLine} wide />
          <F name="city" label="City" d={s.city} />
          <div className="grid grid-cols-2 gap-3">
            <F name="pincode" label="PIN" d={s.pincode} />
            <div>
              <label htmlFor="stateCode" className="label">State</label>
              <select id="stateCode" name="stateCode" defaultValue={s.stateCode} className="field">{STATE_OPTIONS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
            </div>
          </div>
          <p className="text-xs text-muted sm:col-span-2">The warehouse state decides CGST + SGST (same state) versus IGST (other states) on every order.</p>
          <F name="supportEmail" label="Support / grievance email" d={s.supportEmail} />
          <F name="supportPhone" label="Support phone" d={s.supportPhone} />
        </section>
        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Retail store</h2>
          <F name="freeShippingThreshold" label="Free delivery from (₹)" d={r(s.freeShippingThresholdPaise)} />
          <F name="retailShipping" label="Delivery charge below that (₹)" d={r(s.retailShippingPaise)} />
          <F name="codLimit" label="Cash on delivery limit (₹)" d={r(s.codLimitPaise)} />
        </section>
        <section className="panel grid gap-4 p-5 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Wholesale portal</h2>
          <F name="wholesaleMinOrder" label="Minimum order before GST (₹)" d={r(s.wholesaleMinOrderPaise)} />
          <F name="wholesaleFreightPerKg" label="Freight per kg (₹)" d={(s.wholesaleFreightPerKgPaise / 100).toFixed(2)} />
          <F name="bankDetails" label="Bank details for transfers" d={s.bankDetails} wide />
        </section>
        <section className="panel p-5 text-sm">
          <h2 className="font-semibold">Payments</h2>
          <p className="mt-1 text-muted">
            Razorpay: {razorpayEnabled() ? <span className="font-medium text-pista">connected</span> : "not configured"}.
            {!razorpayEnabled() && " Set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET in the environment."}
            {demoPaymentsEnabled() && " Demo payments are on — shoppers can confirm simulated payments."}
          </p>
        </section>
        <button className="btn-primary">Save settings</button>
      </form>
    </>
  );
}
