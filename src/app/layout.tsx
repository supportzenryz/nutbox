import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Nutbox — nuts & dry fruits by grade", template: "%s · Nutbox" },
  description: "Graded cashews, almonds, pistachios, dates and dried fruits. Retail packs and wholesale bags from one fresh stock.",
};

export const viewport: Viewport = { themeColor: "#1E4A37" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Stencil+Display:wght@700;800&family=Instrument+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
