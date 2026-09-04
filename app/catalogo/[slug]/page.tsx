export const revalidate = 0;

import type { Metadata } from "next";
import { StorefrontClient } from "@/components/stores/storefront-client";
import { getStoreBySlug } from "@/lib/store-api";

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const store = await getStoreBySlug(params.slug);
  return {
    title: store ? `${store.name} | Catálogo` : "Tienda no encontrada",
    description: store?.description ?? (store ? `Catálogo de ${store.name}` : "Este catálogo no está disponible."),
  };
}

export default async function ExclusiveStorePage({ params }: { params: { slug: string } }) {
  const store = await getStoreBySlug(params.slug);

  if (!store) {
    return (
      <main className="exclusive-store-error">
        <div>
          <h1>Tienda no encontrada</h1>
          <p>Es posible que este enlace sea antiguo o que la tienda ya no tenga publicaciones activas.</p>
        </div>
      </main>
    );
  }

  return <StorefrontClient store={store} exclusive />;
}
