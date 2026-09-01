import { OrderGenerationClient } from "@/components/orders/order-generation-client";
import { getStores } from "@/lib/store-api";

export default async function CheckoutPage() {
  const stores = await getStores();
  const contacts = Object.fromEntries(stores.map((store) => [store.id, {
    slug: store.slug,
    phone: store.whatsapp_phone ?? "",
    category: store.category ?? "Tienda local",
    paymentMethods: store.store_json?.paymentMethods ?? [],
    paymentAccounts: store.store_json?.paymentAccounts ?? [],
  }]));
  return <OrderGenerationClient contacts={contacts} />;
}
