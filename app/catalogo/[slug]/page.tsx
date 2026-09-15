export const revalidate = 0;

import type { Metadata } from "next";
import { permanentRedirect, redirect } from "next/navigation";
import { StorefrontClient } from "@/components/stores/storefront-client";
import { getStoreBySlug } from "@/lib/store-api";
import { normalizeStoreSlug } from "@/lib/store-slug";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  return {
    title: store ? `${store.name} | Catálogo` : "Tienda no encontrada",
    description:
      store?.description ??
      (store
        ? `Catálogo de ${store.name}`
        : "Este catálogo no está disponible."),
  };
}

export default async function ExclusiveStorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const canonicalSlug = normalizeStoreSlug(slug);
  const store = await getStoreBySlug(canonicalSlug);

  if (!store) {
    redirect("/");
  }

  if (canonicalSlug !== slug || canonicalSlug !== store.slug) {
    permanentRedirect(`/catalogo/${store.slug}`);
  }

  return <StorefrontClient store={store} exclusive />;
}
