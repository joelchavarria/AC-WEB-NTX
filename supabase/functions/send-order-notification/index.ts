import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

type Payload = { orderId?: string; orderIds?: string[] };

type ExpoMessage = {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data: Record<string, string | number | null>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey)
    return json({ error: "Missing Supabase env" }, 500);

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const orderIds = [
    ...new Set([...(payload.orderIds ?? []), payload.orderId].filter(Boolean)),
  ] as string[];
  if (!orderIds.length) return json({ error: "Missing orderId" }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, total, store_id, stores(owner_profile_id, name)",
    )
    .in("id", orderIds);
  if (orderError) return json({ error: "Could not load orders" }, 500);
  if (!orders?.length) return json({ sent: 0, reason: "orders_not_found" });

  const ownerIds = [
    ...new Set(
      orders
        .map((order: any) => order.stores?.owner_profile_id)
        .filter(
          (value: unknown): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    ),
  ];
  if (!ownerIds.length) return json({ sent: 0, reason: "owners_not_found" });

  const { data: tokens, error: tokenError } = await supabase
    .from("push_tokens")
    .select("token, profile_id")
    .in("profile_id", ownerIds);
  if (tokenError) return json({ error: "Could not load tokens" }, 500);
  if (!tokens?.length) return json({ sent: 0, reason: "tokens_not_found" });

  const messages: ExpoMessage[] = [];
  for (const order of orders as any[]) {
    const ownerId = order.stores?.owner_profile_id;
    const ownerTokens = tokens.filter(
      (entry: any) => entry.profile_id === ownerId,
    );
    for (const entry of ownerTokens) {
      if (!Expo.isExpoPushToken(entry.token)) continue;
      messages.push({
        to: entry.token,
        sound: "default",
        title: `Nuevo pedido ORD-${order.order_number}`,
        body: `${order.customer_name ?? "Cliente web"} · C$ ${Number(order.total ?? 0).toLocaleString("es-NI")}`,
        data: {
          type: "order",
          orderId: order.id,
          orderNumber: Number(order.order_number ?? 0),
          storeId: order.store_id,
        },
      });
    }
  }

  if (!messages.length)
    return json({ sent: 0, reason: "no_valid_expo_tokens" });

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });
  if (!response.ok) {
    const failure = await response.text().catch(() => "");
    return json({ sent: 0, error: "expo_push_failed", detail: failure }, 502);
  }
  const result = await response.json().catch(() => null);
  return json({ sent: messages.length, expo: result });
});

const Expo = {
  isExpoPushToken(token: string) {
    return (
      /^ExponentPushToken\[[\w-]+\]$/.test(token) ||
      /^ExpoPushToken\[[\w-]+\]$/.test(token)
    );
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
