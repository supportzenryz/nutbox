import { desc } from "drizzle-orm";
import { couponAdminAction } from "@/app/actions/admin";
import { PageHead } from "@/components/admin-ui";
import { Flash } from "@/components/store-chrome";
import { db } from "@/db";
import { coupons } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { dateIN, rupees } from "@/lib/format";

export const metadata = { title: "Discounts" };

export default async function Discounts({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const list = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
  return (
    <>
      <PageHead title="Discount codes" sub="Discounts are applied before GST, so tax is charged on the discounted value." />
      <Flash sp={sp} />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="panel overflow-x-auto">
          <table className="table min-w-[640px]">
            <thead><tr><th>Code</th><th>Discount</th><th>Applies to</th><th>Minimum</th><th>Ends</th><th className="text-right">Used</th><th /></tr></thead>
            <tbody>{list.map((c) => (
              <tr key={c.id} className={c.isActive ? "" : "text-muted"}>
                <td className="font-mono font-semibold">{c.code}</td>
                <td>{c.type === "PERCENT" ? `${c.value / 100}% off` : `${rupees(c.value)} off`}</td>
                <td>{c.channel === "RETAIL" ? "Retail" : c.channel === "WHOLESALE" ? "Wholesale" : "Both"}</td>
                <td className="num">{c.minSubtotalPaise ? rupees(c.minSubtotalPaise) : "—"}</td>
                <td>{c.endsAt ? dateIN(c.endsAt) : "No end date"}</td>
                <td className="num text-right">{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</td>
                <td><form action={couponAdminAction}><input type="hidden" name="op" value="toggle" /><input type="hidden" name="couponId" value={c.id} /><button className="btn-ghost btn-sm">{c.isActive ? "Pause" : "Resume"}</button></form></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <form action={couponAdminAction} className="panel h-fit space-y-3 p-4">
          <h2 className="font-semibold">New code</h2>
          <div><label htmlFor="code" className="label">Code</label><input id="code" name="code" required className="field uppercase" placeholder="HOLI12" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="type" className="label">Type</label><select id="type" name="type" className="field"><option value="PERCENT">Percent</option><option value="FIXED">Fixed ₹</option></select></div>
            <div><label htmlFor="value" className="label">Value</label><input id="value" name="value" required inputMode="decimal" className="field num" /></div>
          </div>
          <div><label htmlFor="channel" className="label">Applies to</label><select id="channel" name="channel" className="field"><option value="RETAIL">Retail store</option><option value="WHOLESALE">Wholesale portal</option><option value="">Both</option></select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label htmlFor="minSubtotal" className="label">Min. order ₹</label><input id="minSubtotal" name="minSubtotal" inputMode="decimal" className="field num" /></div>
            <div><label htmlFor="usageLimit" className="label">Use limit</label><input id="usageLimit" name="usageLimit" inputMode="numeric" className="field num" /></div>
          </div>
          <div><label htmlFor="endsAt" className="label">Last day</label><input id="endsAt" name="endsAt" type="date" className="field" /></div>
          <button className="btn-primary w-full">Create code</button>
        </form>
      </div>
    </>
  );
}
