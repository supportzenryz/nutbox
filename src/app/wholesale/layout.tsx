import { StoreFooter, StoreHeader } from "@/components/store-chrome";

export default function WholesaleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <StoreHeader portal="wholesale" />
      <main>{children}</main>
      <StoreFooter />
    </>
  );
}
