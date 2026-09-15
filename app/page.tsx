export const revalidate = 0;

import { JsonLd } from "@/components/seo/json-ld";
import { siteUrl } from "@/lib/seo";
export const metadata = { alternates: { canonical: "/" }, openGraph: { url: "/", title: "ONDIE | Tiendas locales y catálogos en línea", description: "Descubre tiendas locales, explora sus productos y compra directamente a emprendedores en ONDIE.", type: "website" } };

import { MarketplaceHome } from "@/components/page/marketplace-home";
import { getStores } from "@/lib/store-api";
import type { Store } from "@/lib/supabase";

export default async function HomePage() {
  let stores: Store[] = [];
  let error = "";

  try {
    stores = await getStores();
  } catch (cause) {
    error = cause instanceof Error ? cause.message : "No se pudieron cargar las tiendas.";
  }

  return <><JsonLd data={{ "@context": "https://schema.org", "@type": "WebSite", name: "ONDIE", url: siteUrl.href, inLanguage: "es" }} /><MarketplaceHome stores={stores} error={error} /></>;
}
