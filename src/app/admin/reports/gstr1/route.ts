import { NextResponse } from "next/server";
import { currentUser, isStaff } from "@/lib/auth";
import { gstReport } from "@/lib/gst-report";
import { stateName } from "@/lib/states";

const csvCell = (v: string | number) => {
  const s = String(v);
  // Neutralise spreadsheet formula injection and quote.
  const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const money = (p: number) => (p / 100).toFixed(2);

export async function GET(req: Request) {
  const u = await currentUser();
  if (!isStaff(u)) return new NextResponse("Not found", { status: 404 });
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return new NextResponse("month=YYYY-MM required", { status: 400 });
  const r = await gstReport(month);
  const rows: (string | number)[][] = [["Section", "Invoice no", "Invoice date", "Buyer GSTIN", "Place of supply", "Supply type", "HSN", "Rate %", "Qty kg", "Taxable", "IGST", "CGST", "SGST", "Invoice value", "Status"]];
  for (const o of r.b2b)
    rows.push(["B2B", o.invoiceNo ?? "", o.invoicedAt?.toISOString().slice(0, 10) ?? "", o.buyerGstin ?? "", `${o.shipStateCode}-${stateName(o.shipStateCode)}`, o.supplyType, "", "", "", money(o.taxablePaise), money(o.igstPaise), money(o.cgstPaise), money(o.sgstPaise), money(o.totalPaise), o.status]);
  for (const s of r.b2cStates)
    rows.push(["B2CS", "", "", "", `${s.state}-${stateName(s.state)}`, s.supply, "", "5", "", money(s.taxable), money(s.igst), money(s.cgst), money(s.sgst), money(s.taxable + s.igst + s.cgst + s.sgst), ""]);
  for (const h of r.hsn) rows.push(["HSN", "", "", "", "", "", h.hsn, h.rate / 100, h.qtyKg.toFixed(3), money(h.taxable), "", "", "", money(h.taxable + h.tax), ""]);
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="nutbox-gstr1-${month}.csv"` } });
}
