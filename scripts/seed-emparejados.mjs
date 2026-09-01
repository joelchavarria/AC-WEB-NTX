import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local. Usa la service role key únicamente en el entorno local/servidor; nunca la expongas como NEXT_PUBLIC_*.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const catalog = [
  {
    name: "Look Casual Arena",
    description: "Conjunto casual en tonos naturales para combinar con tu calzado favorito.",
    price: 1450,
    stock: 8,
    asset: "store-fashion.png",
  },
  {
    name: "Kit Cuidado Rosa",
    description: "Selección de cuidado personal con una presentación delicada y moderna.",
    price: 980,
    stock: 12,
    asset: "store-beauty.png",
  },
  {
    name: "Set Urbano Tech",
    description: "Accesorios esenciales para una rutina urbana conectada.",
    price: 2200,
    stock: 5,
    asset: "store-tech.png",
  },
  {
    name: "Caja Dulce Artesanal",
    description: "Surtido artesanal ideal para compartir o regalar.",
    price: 650,
    stock: 10,
    asset: "store-food.png",
  },
];

const { data: store, error: storeError } = await supabase
  .from("stores")
  .select("id, name, slug")
  .eq("slug", "emparejados")
  .single();

if (storeError || !store) {
  throw new Error(`No se encontró la tienda Emparejados: ${storeError?.message ?? "sin resultado"}`);
}

for (const item of catalog) {
  let { data: product, error: productReadError } = await supabase
    .from("products")
    .select("id")
    .eq("store_id", store.id)
    .eq("name", item.name)
    .maybeSingle();

  if (productReadError) throw productReadError;

  if (!product) {
    const { data: created, error: createError } = await supabase
      .from("products")
      .insert({
        store_id: store.id,
        name: item.name,
        description: item.description,
        price: item.price,
        stock: item.stock,
        fulfillment_mode: "inmediato",
        is_active: true,
      })
      .select("id")
      .single();

    if (createError) throw createError;
    product = created;
  }

  const localPath = path.join(process.cwd(), "public", "assets", item.asset);
  const storagePath = `stores/${store.id}/products/${product.id}/${item.asset}`;
  const imageBuffer = await fs.readFile(localPath);
  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(storagePath, imageBuffer, { contentType: "image/png", upsert: true });

  if (uploadError) throw uploadError;

  const imageUrl = supabase.storage.from("product-images").getPublicUrl(storagePath).data.publicUrl;
  const { data: currentImage, error: imageReadError } = await supabase
    .from("product_images")
    .select("id")
    .eq("product_id", product.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (imageReadError) throw imageReadError;

  const imagePayload = {
    product_id: product.id,
    image_url: imageUrl,
    thumbnail_url: imageUrl,
    mime_type: "image/png",
    file_size_bytes: imageBuffer.byteLength,
  };

  const imageMutation = currentImage
    ? supabase.from("product_images").update(imagePayload).eq("id", currentImage.id)
    : supabase.from("product_images").insert(imagePayload);
  const { error: imageWriteError } = await imageMutation;

  if (imageWriteError) throw imageWriteError;
  console.log(`✓ ${item.name}`);
}

console.log(`Catálogo de ${store.name} actualizado con ${catalog.length} productos.`);
