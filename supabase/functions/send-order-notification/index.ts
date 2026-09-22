import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { getCorsHeaders } from "../_shared/cors.ts";

type Payload = { orderId?: string; orderIds?: string[] };

const MAX_ORDER_IDS = 50;
const EXPO_BATCH_SIZE = 100;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ExpoMessage = {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data: Record<string, string | number | null>;
};

Deno.serve(async (req) => {
  const respond = (body: unknown, status = 200) =>
    json(body, status, getCorsHeaders(req));
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: getCorsHeaders(req) });
  if (req.method !== "POST")
    return respond({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey)
    return respond({ error: "Missing Supabase env" }, 500);
  if (!authorization?.match(/^Bearer\s+\S+$/i))
    return respond({ error: "Authentication required" }, 401);

  const accessToken = authorization.replace(/^Bearer\s+/i, "").trim();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The web server uses the service role only for this trusted internal call.
  // Every other caller must provide a valid user JWT and is checked as an owner.
  const internalServiceCall = accessToken === serviceRoleKey;
  let authenticatedUserId: string | null = null;
  if (!internalServiceCall) {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);
    if (authError || !user)
      return respond({ error: "Authentication required" }, 401);
    authenticatedUserId = user.id;
  }

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return respond({ error: "Invalid JSON" }, 400);
  }

  if (requestedOrderCount(payload) > MAX_ORDER_IDS)
    return respond({ error: "Too many orders" }, 400);

  const orderIds = parseOrderIds(payload);
  if (!orderIds.length) return respond({ error: "Missing orderId" }, 400);
  if (orderIds.length > MAX_ORDER_IDS)
    return respond({ error: "Too many orders" }, 400);

  const { data: orders, error: orderError } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_name, total, store_id, order_items(product_name, quantity), stores(owner_profile_id, name)",
    )
    .in("id", orderIds);
  if (orderError) return respond({ error: "Could not load orders" }, 500);

  const authorizedOrders = (orders ?? []).filter(
    (order: any) =>
      internalServiceCall ||
      order.stores?.owner_profile_id === authenticatedUserId,
  );
  if (authorizedOrders.length !== orderIds.length)
    return respond({ error: "Not authorized to notify these orders" }, 403);

  const ownerIds = [
    ...new Set(
      authorizedOrders
        .map((order: any) => order.stores?.owner_profile_id)
        .filter(
          (value: unknown): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    ),
  ];
  const tokenProfileIds = internalServiceCall
    ? ownerIds
    : authenticatedUserId
      ? [authenticatedUserId]
      : [];
  if (!tokenProfileIds.length)
    return respond({ sent: 0, reason: "owners_not_found" });

  const { data: tokens, error: tokenError } = await supabase
    .from("push_tokens")
    .select("token, profile_id")
    .in("profile_id", tokenProfileIds);
  if (tokenError) return respond({ error: "Could not load tokens" }, 500);
  if (!tokens?.length) return respond({ sent: 0, reason: "tokens_not_found" });

  const messages: ExpoMessage[] = [];
  for (const order of authorizedOrders as any[]) {
    const ownerId = order.stores?.owner_profile_id;
    for (const entry of tokens) {
      if (entry.profile_id !== ownerId || !Expo.isExpoPushToken(entry.token))
        continue;
      messages.push({
        to: entry.token,
        sound: "default",
        title: `¡Estás en la Ondie! Nuevo pedido ORD ${order.order_number}`,
        body: `${order.customer_name || "Cliente web"}${order.order_items?.length ? ` · ${order.order_items.map((item: { quantity: number; product_name: string }) => `${item.quantity}x ${item.product_name}`).join(" · ")}` : ""}`,
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
    return respond({ sent: 0, reason: "no_valid_expo_tokens" });

  for (let start = 0; start < messages.length; start += EXPO_BATCH_SIZE) {
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages.slice(start, start + EXPO_BATCH_SIZE)),
    });
    if (!response.ok) {
      console.error("Push provider request failed", response.status);
      return respond({ error: "Push delivery failed" }, 502);
    }
  }

  return respond({ sent: messages.length });
});

const Expo = {
  isExpoPushToken(token: string) {
    return (
      /^ExponentPushToken\[[\w-]+\]$/.test(token) ||
      /^ExpoPushToken\[[\w-]+\]$/.test(token)
    );
  },
};

function parseOrderIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const body = payload as Record<string, unknown>;
  const rawOrderIds = body.orderIds;
  const rawOrderId = body.orderId;
  if (rawOrderIds !== undefined && !Array.isArray(rawOrderIds)) return [];
  if (rawOrderId !== undefined && typeof rawOrderId !== "string") return [];

  const values = [
    ...(Array.isArray(rawOrderIds) ? rawOrderIds : []),
    ...(rawOrderId === undefined ? [] : [rawOrderId]),
  ];
  if (
    values.some(
      (value) => typeof value !== "string" || !UUID_PATTERN.test(value.trim()),
    )
  )
    return [];

  return [
    ...new Set(values.map((value) => (value as string).trim().toLowerCase())),
  ];
}

function requestedOrderCount(payload: unknown): number {
  if (!payload || typeof payload !== "object") return 0;
  const body = payload as Record<string, unknown>;
  return (
    (Array.isArray(body.orderIds) ? body.orderIds.length : 0) +
    (body.orderId === undefined ? 0 : 1)
  );
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
