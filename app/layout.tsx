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
  title: "ONDIE | Colectivo de tiendas",
  description: "Descubre tiendas locales, conoce lo que venden y compra directamente a emprendedores de nuestra comunidad.",
  openGraph: {
    title: "ONDIE | Colectivo de tiendas",
    description: "Descubre tiendas locales, conoce lo que venden y compra directamente a emprendedores de nuestra comunidad.",
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
