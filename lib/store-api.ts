import { supabase, type Store } from "@/lib/supabase";

async function attachProductImages<T extends { id: string }>(products: T[]) {
  if (products.length === 0) {
    return products;
  }

  const productIds = products.map((product) => product.id);
  const { data: images, error } = await supabase
    .from("product_images")
    .select("product_id, image_url, thumbnail_url, created_at")
    .in("product_id", productIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const imageByProductId = new Map<string, { image_url: string | null; thumbnail_url: string | null }>();

  for (const image of images ?? []) {
    if (!imageByProductId.has(image.product_id)) {
      imageByProductId.set(image.product_id, {
        image_url: image.image_url,
        thumbnail_url: image.thumbnail_url,
      });
    }
  }

  return products.map((product) => {
    const image = imageByProductId.get(product.id);

    return {
      ...product,
      image: image?.image_url ?? undefined,
      thumbnail: image?.thumbnail_url ?? undefined,
    };
  });
}

export async function getStores() {
  const { data: stores, error } = await supabase
    .from("stores")
    .select("id, owner_profile_id, name, slug, store_json")
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
    .select("id, store_id, name, description, price, stock, fulfillment_mode, is_active")
    .eq("is_active", true);

  if (productsError) {
    throw new Error(productsError.message);
  }

  const productsWithImages = await attachProductImages(products ?? []);
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
    .select("id, owner_profile_id, name, slug, store_json")
    .eq("slug", slug)
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
    .select("id, store_id, name, description, price, stock, fulfillment_mode, is_active")
    .eq("store_id", store.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (productsError) {
    throw new Error(productsError.message);
  }

  const productsWithImages = await attachProductImages(products ?? []);

  return {
    ...store,
    products: productsWithImages,
  } as Store;
}
