import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const storeSlug = process.argv[2];

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.");
}

if (!storeSlug) {
  throw new Error("Uso: node scripts/delete-store-products.mjs <store-slug>");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: store, error: storeError } = await supabase
  .from("stores")
  .select("id, name, slug")
  .eq("slug", storeSlug)
  .maybeSingle();

if (storeError) {
  throw storeError;
}

if (!store) {
  throw new Error(`No se encontró la tienda con slug ${storeSlug}.`);
}

const { data: products, error: productsError } = await supabase
  .from("products")
  .select("id, name")
  .eq("store_id", store.id);

if (productsError) {
  throw productsError;
}

const productIds = (products ?? []).map((product) => product.id);

if (!productIds.length) {
  console.log(`La tienda ${store.name} no tiene productos para eliminar.`);
  process.exit(0);
}

const { error: imagesError } = await supabase
  .from("product_images")
  .delete()
  .in("product_id", productIds);

if (imagesError) {
  throw imagesError;
}

const { error: productsDeleteError } = await supabase
  .from("products")
  .delete()
  .eq("store_id", store.id);

if (productsDeleteError) {
  throw productsDeleteError;
}

console.log(`Se eliminaron ${productIds.length} productos de ${store.name}.`);
