import { rupees } from "@/lib/format";
import type { TaxResult } from "@/lib/tax";

/** Totals block. Retail shows tax as "included"; wholesale adds it on top. */
export function OrderSummary({ tax, channel, intraState, coupon }: { tax: TaxResult; channel: "RETAIL" | "WHOLESALE"; intraState: boolean; coupon?: string | null }) {
  const row = (label: React.ReactNode, value: string, strong = false) => (
    <div className={`flex justify-between gap-4 py-1 ${strong ? "border-t border-line pt-3 text-base font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
  const gst = tax.cgstPaise + tax.sgstPaise + tax.igstPaise;
  return (
    <dl className="text-sm">
      {row(channel === "RETAIL" ? "Items" : "Items (excl. GST)", rupees(tax.itemsGrossPaise))}
      {tax.discountPaise > 0 && row(<span>Discount {coupon && <span className="font-semibold text-pista">{coupon}</span>}</span>, `− ${rupees(tax.discountPaise)}`)}
      {row(channel === "RETAIL" ? "Delivery" : "Freight", tax.shippingPaise ? rupees(tax.shippingPaise) : "Free")}
      {channel === "WHOLESALE" && (
        <>
          {row("Taxable value", rupees(tax.taxablePaise))}
          {intraState ? (
            <>
              {row("CGST", rupees(tax.cgstPaise))}
              {row("SGST", rupees(tax.sgstPaise))}
            </>
          ) : (
            row("IGST", rupees(tax.igstPaise))
          )}
        </>
      )}
      {row("Total", rupees(tax.totalPaise), true)}
      {channel === "RETAIL" && <p className="num pt-1 text-xs text-muted">Includes {rupees(gst)} GST ({intraState ? "CGST + SGST" : "IGST"})</p>}
    </dl>
  );
}
