import { supabase, type Store } from "@/lib/supabase";
const fallbackImage =
  "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&h=600&fit=crop&auto=format";

function mapProductsWithImages(
  products: Array<{
    id: string;
    store_id: string;
    name: string;
    description: string | null;
    price: number | string;
    stock: number;
    fulfillment_mode: string;
    is_active: boolean;
    product_images?: Array<{ image_url: string | null }> | null;
  }>,
) {
  return products.map((product) => ({
    id: product.id,
    store_id: product.store_id,
    name: product.name,
    description: product.description,
    price: Number(product.price),
    stock: product.stock,
    fulfillment_mode: product.fulfillment_mode,
    is_active: product.is_active,
    image: product.product_images?.[0]?.image_url ?? fallbackImage,
  }));
}

export async function getStores() {
  const { data: stores, error } = await supabase
    .from("stores")
    .select("id, owner_profile_id, name, slug, category, description, whatsapp_phone, address, is_active, store_json")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const storeList = (stores ?? []) as Store[];

  if (storeList.length === 0) {
    return storeList;
  }

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, store_id, name, description, price, stock, fulfillment_mode, is_active, product_images(image_url)")
    .eq("is_active", true);

  if (productsError) {
    throw new Error(productsError.message);
  }

  const productsWithImages = mapProductsWithImages(products ?? []);
  const productsByStore = new Map<string, NonNullable<Store["products"]>>();

  for (const product of productsWithImages) {
    const current = productsByStore.get(product.store_id) ?? [];
    current.push(product);
    productsByStore.set(product.store_id, current);
  }

  return storeList.map((store) => ({
    ...store,
    products: productsByStore.get(store.id) ?? [],
  }));
}

export async function getStoreBySlug(slug: string) {
  const { data, error } = await supabase
    .from("stores")
    .select("id, owner_profile_id, name, slug, category, description, whatsapp_phone, address, is_active, store_json")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const store = data as Store | null;

  if (!store) {
    return null;
  }

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, store_id, name, description, price, stock, fulfillment_mode, is_active, product_images(image_url)")
    .eq("store_id", store.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (productsError) {
    throw new Error(productsError.message);
  }

  const productsWithImages = mapProductsWithImages(products ?? []);

  return {
    ...store,
    products: productsWithImages,
  } as Store;
}
