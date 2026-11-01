// Direct UPI (no gateway): build the NPCI "upi://pay" deep link that opens the shopper's UPI apps
// with payee, amount and order reference filled in. Pure functions — safe on server and client.

/** UPI ID / VPA, e.g. nutbox@okhdfcbank, 9876543210@ybl, nutbox.store@icici. */
export const UPI_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

/** UPI transaction reference (UTR / RRN) shown in every UPI app's receipt: 12 digits. */
export const UPI_REF_RE = /^\d{12}$/;

/** Spaces, dashes and the "UTR:" label people paste along with the number are dropped. */
export function normaliseUpiRef(raw: string) {
  return raw.replace(/^\s*(utr|rrn|upi\s*ref(\.|erence)?\s*(no\.?)?)\s*[:#-]?\s*/i, "").replace(/[\s-]/g, "");
}

/** Paise → "1234.50" without floating point. */
export function upiAmount(paise: number) {
  if (!Number.isInteger(paise) || paise <= 0) throw new Error("UPI amount must be a positive number of paise.");
  return `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, "0")}`;
}

// Percent-encode like encodeURIComponent but keep "@" readable — some UPI apps reject "%40" in pa.
const enc = (v: string) => encodeURIComponent(v).replace(/%40/g, "@");

export function upiPayQuery(p: { upiId: string; payeeName: string; amountPaise: number; note: string }) {
  const params: [string, string][] = [
    ["pa", p.upiId.trim()],
    ["pn", p.payeeName.trim().slice(0, 50)],
    ["am", upiAmount(p.amountPaise)],
    ["cu", "INR"],
    ["tn", p.note.slice(0, 50)],
  ];
  return params.map(([k, v]) => `${k}=${enc(v)}`).join("&");
}

/** The generic link: Android shows every installed UPI app; QR scanners in all UPI apps read it too. */
export const upiPayUri = (p: Parameters<typeof upiPayQuery>[0]) => `upi://pay?${upiPayQuery(p)}`;

/** App-specific schemes — needed on iPhone, where "upi://" isn't routed to an app chooser. */
export const UPI_APPS = [
  { key: "gpay", name: "Google Pay", ios: "gpay://upi/pay?", android: "tez://upi/pay?" },
  { key: "phonepe", name: "PhonePe", ios: "phonepe://pay?", android: "phonepe://pay?" },
  { key: "paytm", name: "Paytm", ios: "paytmmp://pay?", android: "paytmmp://pay?" },
] as const;
