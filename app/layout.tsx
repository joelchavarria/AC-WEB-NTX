import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CA Web",
  description: "Catalogos de tiendas con carrito y checkout con login diferido.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
