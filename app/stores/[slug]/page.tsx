import { storeMetadata, siteUrl } from "@/lib/seo";
import { JsonLd } from "@/components/seo/json-ld";
export const revalidate = 0;

import { permanentRedirect, notFound } from "next/navigation";
import { StorefrontClient } from "@/components/stores/storefront-client";
import { getStoreBySlug } from "@/lib/store-api";
import { normalizeStoreSlug } from "@/lib/store-slug";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  return storeMetadata(store);
}

export default async function StorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const canonicalSlug = normalizeStoreSlug(slug);
  const store = await getStoreBySlug(canonicalSlug);

  if (!store) {
    notFound();
  }

  if (canonicalSlug !== slug || canonicalSlug !== store.slug) {
    permanentRedirect(`/stores/${store.slug}`);
  }

  return <><JsonLd data={{ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "ONDIE", item: siteUrl.href }, { "@type": "ListItem", position: 2, name: store.name, item: new URL(`/stores/${encodeURIComponent(store.slug)}`, siteUrl).href }] }} /><StorefrontClient store={store} /></>;
}
