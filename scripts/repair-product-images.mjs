import fs from "node:fs/promises";
import path from "node:path";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local para reparar imágenes de productos.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const catalogAssets = new Map([
  ["Look Casual Arena", { asset: "store-fashion-optimized.jpg", mimeType: "image/jpeg" }],
  ["Kit Cuidado Rosa", { asset: "store-beauty-optimized.jpg", mimeType: "image/jpeg" }],
  ["Set Urbano Tech", { asset: "store-tech-optimized.jpg", mimeType: "image/jpeg" }],
  ["Caja Dulce Artesanal", { asset: "store-food-optimized.jpg", mimeType: "image/jpeg" }],
  ["Arete Cicular", { asset: "store-fashion-optimized.jpg", mimeType: "image/jpeg" }],
  ["Brazalete Relicario", { asset: "store-beauty-optimized.jpg", mimeType: "image/jpeg" }],
]);

const { data: products, error: productsError } = await supabase
  .from("products")
  .select("id, name, store_id")
  .in("name", [...catalogAssets.keys()]);

if (productsError) {
  throw productsError;
}

for (const product of products ?? []) {
  const asset = catalogAssets.get(product.name);

  if (!asset) {
    continue;
  }

  const localPath = path.join(process.cwd(), "public", "assets", asset.asset);
  const fileBuffer = await fs.readFile(localPath);

  if (!fileBuffer.byteLength) {
    throw new Error(`El archivo local ${asset.asset} está vacío.`);
  }

  const storagePath = `stores/${product.store_id}/products/${product.id}/${asset.asset}`;
  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .update(storagePath, fileBuffer, {
      contentType: asset.mimeType,
      cacheControl: "31536000",
      upsert: true,
    });

  if (uploadError) {
    throw uploadError;
  }

  const imageUrl = supabase.storage.from("product-images").getPublicUrl(storagePath).data.publicUrl;
  const { data: imageRow, error: imageReadError } = await supabase
    .from("product_images")
    .select("id")
    .eq("product_id", product.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (imageReadError) {
    throw imageReadError;
  }

  const imagePayload = {
    product_id: product.id,
    image_url: imageUrl,
    thumbnail_url: imageUrl,
    mime_type: asset.mimeType,
    file_size_bytes: fileBuffer.byteLength,
  };

  const mutation = imageRow
    ? supabase.from("product_images").update(imagePayload).eq("id", imageRow.id)
    : supabase.from("product_images").insert(imagePayload);
  const { error: imageWriteError } = await mutation;

  if (imageWriteError) {
    throw imageWriteError;
  }

  console.log(`✓ ${product.name} reparado con ${fileBuffer.byteLength} bytes`);
}
