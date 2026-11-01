const STYLES: Record<string, string> = {
  QUOTE: "bg-jute-soft text-jute",
  OPEN: "bg-pista-soft text-pista-deep",
  CANCELLED: "bg-danger-soft text-danger",
  ARCHIVED: "bg-line text-muted",
  PENDING: "bg-saffron-soft text-[#8A5A10]",
  PAID: "bg-pista-soft text-pista-deep",
  REFUNDED: "bg-line text-muted",
  VOIDED: "bg-line text-muted",
  UNFULFILLED: "bg-saffron-soft text-[#8A5A10]",
  SHIPPED: "bg-[#DDE8F3] text-[#24496E]",
  DELIVERED: "bg-pista-soft text-pista-deep",
  RETURNED: "bg-danger-soft text-danger",
  APPROVED: "bg-pista-soft text-pista-deep",
  REJECTED: "bg-danger-soft text-danger",
  SUSPENDED: "bg-line text-muted",
  RETAIL: "bg-[#E7E3F3] text-[#463A7A]",
  WHOLESALE: "bg-jute-soft text-jute",
};

const LABELS: Record<string, string> = {
  QUOTE: "Quote requested",
  OPEN: "Open",
  PENDING: "Payment pending",
  UNFULFILLED: "Not shipped",
  RETAIL: "Retail",
  WHOLESALE: "Wholesale",
  PAID: "Paid",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refund due",
  VOIDED: "Voided",
  RETURNED: "Returned",
  ARCHIVED: "Archived",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  SUSPENDED: "Suspended",
};

export function Status({ value, label }: { value: string; label?: string }) {
  return <span className={`badge ${STYLES[value] ?? "bg-line text-muted"}`}>{label ?? LABELS[value] ?? value}</span>;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  COD: "Cash on delivery",
  RAZORPAY: "UPI / card (Razorpay)",
  BANK_TRANSFER: "Bank transfer (NEFT/RTGS)",
  NET_TERMS: "Credit terms",
  UPI: "UPI (direct to store)",
};
