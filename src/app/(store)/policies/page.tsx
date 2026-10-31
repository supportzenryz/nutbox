import { getSettings } from "@/lib/settings";
import { rupees } from "@/lib/format";

export const metadata = { title: "Policies" };

export default async function Policies() {
  const s = await getSettings();
  return (
    <div className="shell max-w-3xl space-y-8 py-10 leading-relaxed">
      <h1 className="text-3xl font-semibold">Shipping, returns and privacy</h1>
      <section>
        <h2 className="text-xl font-semibold">Shipping</h2>
        <p className="mt-2 text-muted">We dispatch from {s.city} within 1–2 working days. Delivery is free on retail orders over {rupees(s.freeShippingThresholdPaise)}; below that we charge {rupees(s.retailShippingPaise)}. Wholesale freight is {rupees(s.wholesaleFreightPerKgPaise)} per kg of shipping weight. Every pack is delivered with at least 30% of its shelf life remaining.</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Cancellations and returns</h2>
        <p className="mt-2 text-muted">You can cancel any order before it ships for a full refund. Because these are food products, we can't accept opened packs back, but if anything arrives damaged, stale or wrong, tell us within 48 hours with a photo and we'll replace or refund it. Refunds go back to the original payment method within 5–7 working days.</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Privacy notice</h2>
        <p className="mt-2 text-muted">We collect your name, contact details and delivery address to process and deliver orders, issue GST invoices, and handle support. Wholesale accounts also give us business and GST details to verify eligibility and issue B2B invoices. We share data only with our payment gateway and courier partners for these purposes. Card details never reach our servers. We send marketing only if you opt in, and you can withdraw consent at any time. To access, correct or delete your data, write to {s.supportEmail}.</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold">Grievance officer</h2>
        <p className="mt-2 text-muted">{s.legalName}, {s.addressLine}, {s.city} {s.pincode}. Email {s.supportEmail}, phone {s.supportPhone}. We acknowledge complaints within 48 hours and resolve them within one month.</p>
      </section>
    </div>
  );
}
