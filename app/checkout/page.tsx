import { OrderGenerationClient } from "@/components/order-generation-client";
import { getStores } from "@/lib/store-api";

export default async function CheckoutPage() {
  const stores = await getStores();
  const contacts = Object.fromEntries(stores.map((store) => [store.id, { slug: store.slug, phone: store.whatsapp_phone ?? "", category: store.category ?? "Tienda local" }]));
  return <OrderGenerationClient contacts={contacts} />;
}
