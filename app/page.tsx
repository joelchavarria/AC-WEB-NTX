export const revalidate = 0;

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

  return <MarketplaceHome stores={stores} error={error} />;
}
