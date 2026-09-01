import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Faltan credenciales de Supabase en .env.local.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function ensureTable(name, sampleInsert) {
  const { error } = await sampleInsert();

  if (!error) {
    return;
  }

  throw new Error(`No se pudo garantizar la tabla ${name}: ${error.message}`);
}

await ensureTable("orders", async () => supabase.from("orders").select("id").limit(1));
await ensureTable("order_items", async () => supabase.from("order_items").select("id").limit(1));

const checks = [
  ["customer_name", { customer_name: "migracion" }],
  ["customer_phone", { customer_phone: "50500000000" }],
  ["delivery_address", { delivery_address: "pendiente" }],
  ["delivery_reference", { delivery_reference: "pendiente" }],
  ["payment_method", { payment_method: "transfer" }],
  ["subtotal", { subtotal: 0 }],
  ["total", { total: 0 }],
  ["status", { status: "nuevo" }],
  ["notes", { notes: "pendiente" }],
];

for (const [column, payload] of checks) {
  const { error } = await supabase.from("orders").select(column).limit(1);

  if (error) {
    console.log(`Falta la columna ${column} en orders. Debes agregarla manualmente en Supabase SQL Editor.`);
  } else {
    console.log(`OK orders.${column}`);
  }
}

const { error: historyError } = await supabase.from("order_status_history").select("id").limit(1);

if (historyError) {
  console.log("Falta la tabla order_status_history. Debes crearla manualmente en Supabase SQL Editor.");
} else {
  console.log("OK order_status_history");
}
