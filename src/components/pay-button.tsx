"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { demoPayAction, startPaymentAction, verifyPaymentAction } from "@/app/actions/shop";

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
  }
}

function loadScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// Razorpay Checkout showing only UPI (apps, QR, UPI ID). Wholesale keeps every method: UPI caps most payments at ₹1 lakh.
const UPI_ONLY_CONFIG = {
  display: {
    blocks: { upi: { name: "Pay by UPI", instruments: [{ method: "upi" }] } },
    sequence: ["block.upi"],
    preferences: { show_default_blocks: false },
  },
};

export function PayButton({ orderId, label, upiOnly = false }: { orderId: string; label: string; upiOnly?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);

  const pay = () =>
    start(async () => {
      setError(null);
      const r = await startPaymentAction(orderId);
      if ("error" in r && r.error) return setError(r.error);
      if ("demo" in r) {
        if (!r.demo) return setError("Online payments aren't set up yet. Choose cash on delivery or contact us.");
        return setDemo(true);
      }
      if (!("rzpOrderId" in r)) return;
      if (!(await loadScript()) || !window.Razorpay) return setError("Couldn't load the payment window. Check your connection and try again.");
      const rzp = new window.Razorpay({
        key: r.keyId,
        order_id: r.rzpOrderId,
        amount: r.amount,
        currency: "INR",
        name: "Nutbox",
        prefill: { email: r.email, contact: r.phone, name: r.name },
        theme: { color: "#1E4A37" },
        ...(upiOnly ? { config: UPI_ONLY_CONFIG } : {}),
        handler: async (resp: { razorpay_payment_id: string; razorpay_signature: string }) => {
          const v = await verifyPaymentAction(orderId, resp.razorpay_payment_id, resp.razorpay_signature);
          if ("error" in v && v.error) setError(v.error);
          router.refresh();
        },
      });
      rzp.on("payment.failed", () => setError("The payment didn't go through. You can try again or pick another method."));
      rzp.open();
    });

  const confirmDemo = () =>
    start(async () => {
      const r = await demoPayAction(orderId);
      if ("error" in r && r.error) setError(r.error);
      router.refresh();
    });

  return (
    <div>
      {demo ? (
        <div className="rounded border border-saffron/50 bg-saffron-soft p-4 text-sm">
          <p className="font-medium">Demo payment</p>
          <p className="mt-1 text-muted">No Razorpay keys are configured. Confirming records a simulated successful payment on this order.</p>
          <button onClick={confirmDemo} disabled={pending} className="btn-primary mt-3">
            {pending ? "Recording…" : "Confirm demo payment"}
          </button>
        </div>
      ) : (
        <button onClick={pay} disabled={pending} className="btn-saffron px-6">
          {pending ? "Opening payment…" : label}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
