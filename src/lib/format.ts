const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

/** ₹1,23,456 style; shows paise (two decimals) only when there are any. */
export const rupees = (paise: number) => (paise % 100 === 0 ? inr.format(paise / 100) : inr2.format(paise / 100));
/** Always two decimals — for invoices and tax lines. */
export const rupees2 = (paise: number) => inr2.format(paise / 100);

export function weight(grams: number) {
  if (grams >= 1000) return `${(grams / 1000).toLocaleString("en-IN", { maximumFractionDigits: 2 })} kg`;
  return `${grams} g`;
}

export const orderNo = (n: number) => `NB-${1000 + n}`;

export function dateIN(d: Date | string | null | undefined, withTime = false) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Asia/Kolkata",
  });
}

export const pct = (bps: number) => `${(bps / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`;
