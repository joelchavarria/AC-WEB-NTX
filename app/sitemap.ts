import type { MetadataRoute } from "next";
import { supabase } from "@/lib/supabase";
import { siteUrl } from "@/lib/seo";
export const revalidate = 3600;
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [{ url: siteUrl.href }];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from("stores").select("slug").eq("is_active", true).order("id").range(offset, offset + 499);
    if (error) throw new Error("No se pudo generar el sitemap de tiendas.");
    for (const store of data ?? []) if (store.slug) entries.push({ url: new URL(`/stores/${encodeURIComponent(store.slug)}`, siteUrl).href });
    if ((data?.length ?? 0) < 500) break;
  }
  return entries;
}
