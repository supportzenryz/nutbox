import QRCode from "qrcode";
import { reportUpiPaymentAction } from "@/app/actions/shop";
import { dateIN, orderNo, rupees2 } from "@/lib/format";
import { upiPayQuery } from "@/lib/upi";
import { UpiAppButtons } from "./upi-app-buttons";

type Props = {
  order: { id: string; number: number; totalPaise: number; upiRef: string | null; paymentReportedAt: Date | null };
  upiId: string;
  payeeName: string;
};

function RefForm({ orderId, defaultValue, cta }: { orderId: string; defaultValue?: string; cta: string }) {
  return (
    <form action={reportUpiPaymentAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex-1">
        <label htmlFor="upiRef" className="label">UPI reference number (UTR)</label>
        <input
          id="upiRef"
          name="upiRef"
          required
          inputMode="numeric"
          autoComplete="off"
          maxLength={30}
          defaultValue={defaultValue}
          placeholder="12 digits, e.g. 431298765012"
          className="field num"
        />
      </div>
      <button className="btn-primary">{cta}</button>
    </form>
  );
}

/** Direct UPI payment panel on the shopper's order page: app buttons (phone), QR (desktop), then the UTR form. */
export async function UpiPay({ order, upiId, payeeName }: Props) {
  const ref = orderNo(order.number);
  const query = upiPayQuery({ upiId, payeeName: payeeName || "Nutbox", amountPaise: order.totalPaise, note: `Nutbox order ${ref}` });
  const qr = await QRCode.toString(`upi://pay?${query}`, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1c1a17", light: "#ffffff" } });

  if (order.upiRef)
    return (
      <div className="panel mt-6 p-5 text-sm">
        <p className="font-semibold">Payment being verified</p>
        <p className="mt-1 text-muted">
          You reported UPI reference <span className="num font-medium text-ink">{order.upiRef}</span>
          {order.paymentReportedAt ? ` on ${dateIN(order.paymentReportedAt, true)}` : ""}. We&apos;ll confirm it shortly and then pack your order.
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer text-muted hover:text-ink">Typed the wrong number?</summary>
          <div className="mt-3"><RefForm orderId={order.id} defaultValue={order.upiRef} cta="Update reference" /></div>
        </details>
      </div>
    );

  return (
    <section className="panel mt-6 p-5" aria-labelledby="upi-pay-h">
      <h2 id="upi-pay-h" className="text-lg font-semibold">Pay {rupees2(order.totalPaise)} by UPI</h2>
      <p className="mt-1 text-sm text-muted">
        To <span className="font-medium text-ink">{payeeName || "Nutbox"}</span> · <span className="num">{upiId}</span> · reference <span className="font-medium text-ink">{ref}</span>
      </p>

      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_200px] md:items-start">
        <ol className="space-y-5 text-sm">
          <li>
            <p className="mb-2 font-medium">1. Pay with your UPI app</p>
            <div className="md:hidden">
              <UpiAppButtons query={query} label={`Pay ${rupees2(order.totalPaise)} with UPI app`} />
            </div>
            <p className="hidden text-muted md:block">Scan the QR code with Google Pay, PhonePe, Paytm, BHIM or your bank&apos;s app. The amount fills in automatically.</p>
          </li>
          <li>
            <p className="mb-2 font-medium">2. Tell us the UPI reference</p>
            <p className="mb-3 text-muted">After paying, copy the 12-digit <b>UPI Ref. No. / UTR</b> from the payment receipt in your app. We ship once the payment is confirmed.</p>
            <RefForm orderId={order.id} cta="I've paid" />
          </li>
        </ol>
        <div className="hidden md:block">
          <div className="rounded border border-line bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
          <p className="mt-1 text-center text-xs text-muted">Scan to pay {rupees2(order.totalPaise)}</p>
        </div>
        <details className="text-sm md:hidden">
          <summary className="cursor-pointer text-muted">Paying from another phone? Show QR code</summary>
          <div className="mx-auto mt-3 max-w-[220px] rounded border border-line bg-white p-2" dangerouslySetInnerHTML={{ __html: qr }} />
        </details>
      </div>
    </section>
  );
}
