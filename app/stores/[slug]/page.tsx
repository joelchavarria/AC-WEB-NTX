export const revalidate = 0;

import Link from "next/link";
import { StorefrontClient } from "@/components/stores/storefront-client";
import { getStoreBySlug } from "@/lib/store-api";

export default async function StorePage({ params }: { params: { slug: string } }) {
  const store = await getStoreBySlug(params.slug);

  if (!store) {
    return <main className="page"><div className="shell card stack"><h1>Tienda no encontrada</h1><Link href="/" className="button secondary">Volver a ONDIE</Link></div></main>;
  }

  return <StorefrontClient store={store} />;
}
