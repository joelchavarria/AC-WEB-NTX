import { supabase, type ProductVariantGroup, type Store } from "@/lib/supabase";
import { normalizeStoreSlug } from "@/lib/store-slug";
import { normalizeFulfillmentMode } from "@/lib/product-availability";
const fallbackImage =
  "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&h=600&fit=crop&auto=format";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeVariantOptions(value: unknown): ProductVariantGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const name = stringValue(entry.name);
    const values = Array.isArray(entry.values)
      ? [...new Set(entry.values.map(stringValue).filter(Boolean) as string[])]
      : [];
    return name && values.length ? [{ name, values }] : [];
  });
}

function sanitizePublicStoreJson(value: unknown): Store["store_json"] {
  if (!isRecord(value)) return {};
  const profile = isRecord(value.profile_settings)
    ? value.profile_settings
    : {};
  const businessHours = Array.isArray(profile.businessHours)
    ? profile.businessHours
        .filter(isRecord)
        .map((entry) => ({
          day: stringValue(entry.day) ?? "",
          label: stringValue(entry.label) ?? "",
          open: entry.open === true,
          opensAt: stringValue(entry.opensAt) ?? "",
          closesAt: stringValue(entry.closesAt) ?? "",
        }))
        .filter((entry) => entry.day && entry.label)
    : undefined;
  const deliveryMethods = Array.isArray(profile.deliveryMethods)
    ? profile.deliveryMethods
        .filter(isRecord)
        .map((method) => ({
          id: stringValue(method.id) ?? "",
          name: stringValue(method.name) ?? "",
          enabled: method.enabled === true,
          fee: stringValue(method.fee) ?? "0",
        }))
        .filter((method) => method.id && method.name)
    : undefined;
  const paymentMethods = Array.isArray(value.paymentMethods)
    ? value.paymentMethods.filter(
        (method): method is string => typeof method === "string",
      )
    : undefined;

  return {
    description: stringValue(value.description),
    accent: stringValue(value.accent),
    heroImage: stringValue(value.heroImage),
    paymentMethods,
    // Legacy JSON may contain account numbers. Public payment accounts are
    // attached only from the RLS-filtered table below.
    paymentAccounts: [],
    profile_settings: {
      brandColor: stringValue(profile.brandColor),
      hours: stringValue(profile.hours),
      coverImage: stringValue(profile.coverImage),
      managuaFee: stringValue(profile.managuaFee),
      pickupEnabled: profile.pickupEnabled === true,
      pickupAddress: stringValue(profile.pickupAddress),
      businessHours,
      deliveryMethods,
    },
  };
}

async function attachPublicPaymentAccounts<T extends Store>(stores: T[]) {
  const ids = stores.map((store) => store.id);
  if (!ids.length) return stores;
  const { data, error } = await supabase
    .from("store_bank_accounts")
    .select(
      "store_id, bank_name, account_holder, account_number, account_type, currency",
    )
    .in("store_id", ids)
    .eq("is_public", true)
    .order("created_at", { ascending: true });
  if (error)
    throw new Error("No se pudieron cargar los métodos de pago públicos.");
  const accountsByStore = new Map<
    string,
    NonNullable<Store["store_json"]>["paymentAccounts"]
  >();
  for (const account of data ?? []) {
    const accounts = accountsByStore.get(account.store_id) ?? [];
    accounts.push({
      bankName: account.bank_name,
      accountHolder: account.account_holder ?? undefined,
      accountNumber: account.account_number,
      accountType: account.account_type ?? undefined,
    });
    accountsByStore.set(account.store_id, accounts);
  }
  return stores.map((store) => ({
    ...store,
    store_json: {
      ...sanitizePublicStoreJson(store.store_json),
      paymentAccounts: accountsByStore.get(store.id) ?? [],
    },
  }));
}

function mapProductsWithImages(
  products: Array<{
    id: string;
    store_id: string;
    name: string;
    description: string | null;
    category?: string | null;
    price: number | string;
    stock: number;
    fulfillment_mode: string | null;
    is_active: boolean;
    created_at?: string;
    product_images?: Array<{
      id?: string;
      image_url: string | null;
      sort_order?: number;
      alt_text?: string | null;
    }> | null;
    variant_options?: unknown;
  }>,
) {
  return products.map((product) => {
    const images = [...(product.product_images ?? [])]
      .filter((image) => Boolean(image.image_url))
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((image) => ({
        id: image.id,
        image_url: image.image_url as string,
        sort_order: image.sort_order ?? 0,
        alt_text: image.alt_text ?? null,
      }));
    return {
      id: product.id,
      store_id: product.store_id,
      name: product.name,
      description: product.description,
      category: product.category ?? null,
      price: Number(product.price),
      stock: product.stock,
      fulfillment_mode: normalizeFulfillmentMode(product.fulfillment_mode),
      is_active: product.is_active,
      created_at: product.created_at,
      images,
      image: images[0]?.image_url ?? fallbackImage,
      variant_options: normalizeVariantOptions(product.variant_options),
    };
  });
}

export async function getStores() {
  const { data: stores, error } = await supabase
    .from("stores")
    .select(
      "id, name, slug, category, description, address, logo_url, brand_color, is_active, store_json",
    )
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error("No se pudo cargar la lista de tiendas.");
  }

  const storeList = await attachPublicPaymentAccounts(
    ((stores ?? []) as Store[]).map((store) => ({
      ...store,
      slug: normalizeStoreSlug(store.slug || store.name),
    })),
  );

  if (storeList.length === 0) {
    return storeList;
  }

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select(
      "id, store_id, name, description, category, price, stock, fulfillment_mode, is_active, created_at, variant_options, product_images(id, image_url, sort_order, alt_text)",
    )
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
  const normalizedSlug = normalizeStoreSlug(slug);
  const { data, error } = await supabase
    .from("stores")
    .select(
      "id, name, slug, category, description, address, logo_url, brand_color, is_active, store_json",
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error("No se pudo cargar la tienda.");
  }

  let store = data as Store | null;

  if (!store) {
    const { data: alias, error: aliasError } = await supabase
      .from("store_slug_history")
      .select("store_id")
      .eq("slug", normalizedSlug)
      .maybeSingle();
    if (aliasError) throw new Error("No se pudo cargar la tienda.");
    if (alias?.store_id) {
      const { data: aliasedStore, error: aliasedStoreError } = await supabase
        .from("stores")
        .select(
          "id, name, slug, category, description, address, logo_url, brand_color, is_active, store_json",
        )
        .eq("id", alias.store_id)
        .eq("is_active", true)
        .maybeSingle();
      if (aliasedStoreError) throw new Error("No se pudo cargar la tienda.");
      store = aliasedStore as Store | null;
    }
  }

  if (!store) {
    const { data: stores, error: storesError } = await supabase
      .from("stores")
      .select(
        "id, name, slug, category, description, address, logo_url, brand_color, is_active, store_json",
      )
      .eq("is_active", true);

    if (storesError) {
      throw new Error("No se pudo cargar la tienda.");
    }

    store =
      ((stores ?? []) as Store[]).find((entry) => {
        return (
          normalizeStoreSlug(entry.slug) === normalizedSlug ||
          normalizeStoreSlug(entry.name) === normalizedSlug
        );
      }) ?? null;
  }

  if (!store) {
    return null;
  }

  store = (await attachPublicPaymentAccounts([store]))[0] ?? store;

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select(
      "id, store_id, name, description, category, price, stock, fulfillment_mode, is_active, variant_options, product_images(id, image_url, sort_order, alt_text)",
    )
    .eq("store_id", store.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (productsError) {
    throw new Error(productsError.message);
  }

  const productsWithImages = mapProductsWithImages(products ?? []);

  return {
    ...store,
    slug: normalizeStoreSlug(store.slug || store.name),
    products: productsWithImages,
  } as Store;
}
