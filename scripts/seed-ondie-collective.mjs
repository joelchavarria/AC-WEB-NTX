import fs from "node:fs/promises";
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local. La clave debe permanecer solo en el servidor y nunca usar el prefijo NEXT_PUBLIC_.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const collective = [
  {
    name: "Moda Clara",
    slug: "moda-clara",
    category: "Ropa y accesorios",
    description: "Prendas versátiles, accesorios y básicos contemporáneos seleccionados para vestir con personalidad.",
    address: "Managua, Nicaragua",
    phone: "88880001",
    asset: "store-fashion-optimized.jpg",
    product: { name: "Look Casual Arena", description: "Conjunto casual en tonos naturales para todos los días.", price: 1450, stock: 8 },
  },
  {
    name: "Belleza Natural",
    slug: "belleza-natural",
    category: "Belleza y cuidado",
    description: "Cuidado personal consciente, cosmética suave y esenciales para una rutina que se siente bien.",
    address: "León, Nicaragua",
    phone: "88880002",
    asset: "store-beauty-optimized.jpg",
    product: { name: "Kit Cuidado Rosa", description: "Selección de cuidado personal con presentación delicada.", price: 980, stock: 12 },
  },
  {
    name: "Tech House",
    slug: "tech-house",
    category: "Tecnología",
    description: "Equipos y accesorios tecnológicos confiables para trabajar, crear y disfrutar desde cualquier lugar.",
    address: "Granada, Nicaragua",
    phone: "88880003",
    asset: "store-tech-optimized.jpg",
    product: { name: "Set Urbano Tech", description: "Accesorios esenciales para una rutina conectada.", price: 2200, stock: 5 },
  },
  {
    name: "Delicias Caseras",
    slug: "delicias-caseras",
    category: "Comida y bebidas",
    description: "Repostería artesanal, bocadillos recién hechos y sabores locales preparados para compartir.",
    address: "Masaya, Nicaragua",
    phone: "88880004",
    asset: "store-food-optimized.jpg",
    product: { name: "Caja Dulce Artesanal", description: "Surtido artesanal ideal para compartir o regalar.", price: 650, stock: 10 },
  },
];

const { data: anchorStore, error: anchorError } = await supabase
  .from("stores")
  .select("owner_profile_id")
  .eq("slug", "emparejados")
  .single();

if (anchorError || !anchorStore) {
  throw new Error(`No se pudo obtener el propietario base desde Emparejados: ${anchorError?.message ?? "sin resultado"}`);
}

for (const entry of collective) {
  const storePayload = {
    owner_profile_id: anchorStore.owner_profile_id,
    name: entry.name,
    slug: entry.slug,
    category: entry.category,
    description: entry.description,
    whatsapp_phone: entry.phone,
    address: entry.address,
    is_active: true,
    store_json: { description: entry.description, accent: "#142FE3" },
  };

  let { data: store, error: storeReadError } = await supabase
    .from("stores")
    .select("id")
    .eq("slug", entry.slug)
    .maybeSingle();
  if (storeReadError) throw storeReadError;

  if (store) {
    const { error } = await supabase.from("stores").update(storePayload).eq("id", store.id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("stores").insert(storePayload).select("id").single();
    if (error) throw error;
    store = data;
  }

  let { data: product, error: productReadError } = await supabase
    .from("products")
    .select("id")
    .eq("store_id", store.id)
    .eq("name", entry.product.name)
    .maybeSingle();
  if (productReadError) throw productReadError;

  const productPayload = {
    store_id: store.id,
    ...entry.product,
    fulfillment_mode: "inmediato",
    is_active: true,
  };

  if (product) {
    const { error } = await supabase.from("products").update(productPayload).eq("id", product.id);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("products").insert(productPayload).select("id").single();
    if (error) throw error;
    product = data;
  }

  const localPath = path.join(process.cwd(), "public", "assets", entry.asset);
  const imageBuffer = await fs.readFile(localPath);
  const storagePath = `stores/${store.id}/products/${product.id}/${entry.asset}`;
  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(storagePath, imageBuffer, { contentType: "image/jpeg", cacheControl: "31536000", upsert: true });
  if (uploadError) throw uploadError;

  const imageUrl = supabase.storage.from("product-images").getPublicUrl(storagePath).data.publicUrl;
  const { data: imageRow, error: imageReadError } = await supabase
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
    mime_type: "image/jpeg",
    file_size_bytes: imageBuffer.byteLength,
  };
  const mutation = imageRow
    ? supabase.from("product_images").update(imagePayload).eq("id", imageRow.id)
    : supabase.from("product_images").insert(imagePayload);
  const { error: imageWriteError } = await mutation;
  if (imageWriteError) throw imageWriteError;

  console.log(`✓ ${entry.name}: 1 producto e imagen optimizada`);
}

console.log(`Colectivo ONDIE actualizado con ${collective.length} tiendas adicionales.`);
