import Link from "next/link";
import { siteUrl } from "@/lib/seo";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NoticeCenterProvider } from "@/components/page/feedback/notice-center";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: "ONDIE | Tiendas locales y catálogos en línea",
  description: "Descubre tiendas locales, conoce lo que venden y compra directamente a emprendedores de nuestra comunidad.",
  openGraph: {
    title: "ONDIE | Colectivo de tiendas",
    description: "Descubre tiendas locales, conoce lo que venden y compra directamente a emprendedores de nuestra comunidad.",
    type: "website",
  },
  twitter: { card: "summary", title: "ONDIE | Tiendas locales y catálogos en línea", description: "Descubre negocios locales y compra directamente a emprendedores en ONDIE." },
  icons: {
    icon: "/ondie-icon.png",
    shortcut: "/ondie-icon.png",
    apple: "/ondie-icon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={inter.className}>
      <body>
        <NoticeCenterProvider>{children}<footer className="legal-footer" aria-label="Información legal"><span>ONDIE</span><Link href="/privacidad">Política de privacidad</Link><Link href="/terminos">Términos y condiciones</Link></footer></NoticeCenterProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
