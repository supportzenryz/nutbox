import { StoreFooter, StoreHeader } from "@/components/store-chrome";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StoreHeader />
      <main>{children}</main>
      <StoreFooter />
    </>
  );
}
