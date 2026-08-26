import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ac-web-ntx.vercel.app"),
  title: "CA Marketplace",
  description: "Marketplace multi-tienda con catalogos publicos, carrito y login solo al comprar.",
  openGraph: {
    title: "CA Marketplace",
    description: "Marketplace multi-tienda con catalogos publicos, carrito y login solo al comprar.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={inter.className}>
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
