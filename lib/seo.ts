import type { Metadata } from "next";
import type { Store } from "./supabase";

export const siteUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://ac-web-ntx.vercel.app");
export function storeMetadata(store: Store): Metadata {
  const title = `${store.name} | ${store.category || "Tienda local"} en ONDIE`;
  const description = store.description?.trim() || `Explora los productos de ${store.name}, consulta su catálogo y coordina tu compra directamente con la tienda en ONDIE.`;
  const url = `/stores/${encodeURIComponent(store.slug)}`;
  return {
    title: { absolute: title }, description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", locale: "es_NI", ...(store.logo_url ? { images: [{ url: store.logo_url, alt: store.name }] } : {}) },
    twitter: { card: "summary", title, description },
  };
}
