import Link from "next/link";
import { createProductAction } from "@/app/actions/admin";
import { PageHead } from "@/components/admin-ui";
import { ProductFields } from "@/components/product-form";
import { Flash } from "@/components/store-chrome";
import { requireAdmin } from "@/lib/auth";
import { listCategories } from "@/lib/catalog";

export const metadata = { title: "New product" };

export default async function NewProduct({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const [sp, cats] = await Promise.all([searchParams, listCategories()]);
  return (
    <>
      <Link href="/admin/products" className="text-sm text-muted hover:text-ink">Products</Link>
      <PageHead title="Add product" sub="Creating a product also creates its bulk stock pool. Add retail and wholesale pack sizes after saving." />
      <Flash sp={sp} />
      <form action={createProductAction} className="panel max-w-4xl space-y-6 p-6">
        <ProductFields categories={cats} />
        <button className="btn-primary">Create product</button>
      </form>
    </>
  );
}
