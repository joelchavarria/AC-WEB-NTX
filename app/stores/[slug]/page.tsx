export const revalidate = 0;

import { permanentRedirect, redirect } from "next/navigation";
import { StorefrontClient } from "@/components/stores/storefront-client";
import { getStoreBySlug } from "@/lib/store-api";
import { normalizeStoreSlug } from "@/lib/store-slug";

export default async function StorePage({
  params,
}: {
  params: { slug: string };
}) {
  const canonicalSlug = normalizeStoreSlug(params.slug);
  const store = await getStoreBySlug(canonicalSlug);

  if (!store) {
    redirect("/");
  }

  if (canonicalSlug !== params.slug || canonicalSlug !== store.slug) {
    permanentRedirect(`/stores/${store.slug}`);
  }

  return <StorefrontClient store={store} />;
}
