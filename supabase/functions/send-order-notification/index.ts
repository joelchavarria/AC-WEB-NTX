import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
import { getCorsHeaders } from "../_shared/cors.ts";

type Payload = {
  orderId?: string;
  orderIds?: string[];
  record?: { id?: string };
};

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

type ExpoTicket = {
  status?: "ok" | "error";
  message?: string;
  details?: { error?: string };
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
      "id, order_number, customer_name, total, store_id, order_items(product_name, quantity, variant_options), stores(owner_profile_id, name)",
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
        body: `${order.customer_name || "Cliente web"}${order.order_items?.length ? ` · ${order.order_items.map((item: { quantity: number; product_name: string; variant_options?: Record<string, string> }) => `${item.quantity}x ${item.product_name}${Object.entries(item.variant_options ?? {}).map(([name, value]) => ` · ${name}: ${value}`).join("")}`).join(" · ")}` : ""}`,
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

  let sentCount = 0;
  let failedCount = 0;
  for (let start = 0; start < messages.length; start += EXPO_BATCH_SIZE) {
    const batch = messages.slice(start, start + EXPO_BATCH_SIZE);
    const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN")?.trim();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    };
    if (expoAccessToken) {
      headers.Authorization = `Bearer ${expoAccessToken}`;
    }
    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers,
      body: JSON.stringify(batch),
    });
    if (!response.ok) {
      console.error("Push provider request failed", response.status);
      return respond({ error: "Push delivery failed" }, 502);
    }
    let result: { data?: ExpoTicket[] };
    try {
      result = (await response.json()) as { data?: ExpoTicket[] };
    } catch {
      return respond({ error: "Invalid push provider response" }, 502);
    }
    const tickets = Array.isArray(result.data) ? result.data : [];
    const failedTokens = tickets
      .map((ticket, index) => ({ ticket, token: batch[index]?.to }))
      .filter(
        ({ ticket }) =>
          ticket.status === "error" &&
          ticket.details?.error === "DeviceNotRegistered",
      )
      .map(({ token }) => token)
      .filter((token): token is string => Boolean(token));
    if (failedTokens.length) {
      await supabase.from("push_tokens").delete().in("token", failedTokens);
    }
    const failedTickets = tickets.filter((ticket) => ticket.status === "error");
    if (tickets.length !== batch.length) {
      return respond({ error: "Invalid push provider response" }, 502);
    }
    sentCount += tickets.length - failedTickets.length;
    failedCount += failedTickets.length;
    if (failedTickets.length) {
      console.error(
        "Push provider rejected notifications",
        failedTickets.map((ticket) => ({
          message: ticket.message,
          error: ticket.details?.error,
        })),
      );
    }
    if (failedTickets.length === batch.length) {
      return respond(
        {
          error: "Push delivery failed",
          sent: sentCount,
          failed: failedCount,
        },
        502,
      );
    }
  }

  return respond({ sent: sentCount, failed: failedCount });
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
  const rawRecord = body.record;
  if (rawOrderIds !== undefined && !Array.isArray(rawOrderIds)) return [];
  if (rawOrderId !== undefined && typeof rawOrderId !== "string") return [];
  if (
    rawRecord !== undefined &&
    (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord))
  )
    return [];
  const recordId =
    rawRecord && typeof rawRecord === "object" && !Array.isArray(rawRecord)
      ? (rawRecord as Record<string, unknown>).id
      : undefined;
  if (recordId !== undefined && typeof recordId !== "string") return [];

  const values = [
    ...(Array.isArray(rawOrderIds) ? rawOrderIds : []),
    ...(rawOrderId === undefined ? [] : [rawOrderId]),
    ...(recordId === undefined ? [] : [recordId]),
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
    (body.orderId === undefined ? 0 : 1) +
    (body.record && typeof body.record === "object" ? 1 : 0)
  );
}

function json(body: unknown, status: number, headers: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
