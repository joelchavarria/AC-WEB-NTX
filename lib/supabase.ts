import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Store = {
  id: string;
  owner_profile_id: string;
  name: string;
  slug: string;
  store_json: {
    description?: string;
    accent?: string;
    heroImage?: string;
  } | null;
  products?: Product[];
};

export type Product = {
  id: string;
  store_id?: string;
  name: string;
  price: number;
  description?: string;
  image?: string;
  thumbnail?: string;
  stock?: number;
  fulfillment_mode?: string;
  is_active?: boolean;
};
