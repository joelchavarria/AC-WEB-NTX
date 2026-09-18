import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type OrderRequest = {
  customer: {
    name: string;
    phone: string;
    address: string;
    reference?: string;
  };
  paymentMethod: string;
  deliveryMethod: "pickup" | "own_delivery" | "store_delivery";
  groups: Array<{
    storeId: string;
    deliveryOptionId?: string;
    items: Array<{
      id: string;
      name: string;
      description?: string | null;
      image?: string;
      price: number;
      quantity: number;
    }>;
  }>;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function userError(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Content-Security-Policy": "frame-ancestors 'none'",
      },
    },
  );
}

function friendlyServerError() {
  return userError(
    "No pudimos preparar tu pedido en este momento. Intenta nuevamente en unos minutos.",
    500,
  );
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isOrderRequest(value: unknown): value is OrderRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as OrderRequest;
  const text = (v: unknown, max: number) =>
    typeof v === "string" && v.length <= max;
  if (
    !body.customer ||
    !text(body.customer.name, 150) ||
    !text(body.customer.phone, 30) ||
    !text(body.customer.address, 1000) ||
    (body.customer.reference !== undefined &&
      !text(body.customer.reference, 1000)) ||
    !["cash", "transfer"].includes(body.paymentMethod) ||
    !Array.isArray(body.groups) ||
    body.groups.length < 1 ||
    body.groups.length > 20
  )
    return false;
  const stores = new Set<string>();
  return body.groups.every((group) => {
    if (
      !group ||
      !text(group.storeId, 36) ||
      !uuid.test(group.storeId) ||
      stores.has(group.storeId) ||
      !Array.isArray(group.items) ||
      !group.items.length ||
      group.items.length > 100 ||
      (group.deliveryOptionId !== undefined &&
        !text(group.deliveryOptionId, 100))
    )
      return false;
    stores.add(group.storeId);
    const products = new Set<string>();
    return group.items.every((item) => {
      if (
        !item ||
        !text(item.id, 36) ||
        !uuid.test(item.id) ||
        products.has(item.id) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 999 ||
        typeof item.price !== "number" ||
        !Number.isFinite(item.price) ||
        item.price < 0
      )
        return false;
      products.add(item.id);
      return true;
    });
  });
}

export async function POST(request: Request) {
  if (!supabaseUrl || !serviceRoleKey || !supabaseUrl.startsWith("https://")) {
    return friendlyServerError();
  }

  const requestId = request.headers.get("idempotency-key");
  if (!requestId || !uuid.test(requestId))
    return userError("Identificador de compra inválido.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return userError("Origen no permitido.", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return userError("Origen no permitido.", 403);
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  ) {
    return userError("Envía un pedido en formato JSON.", 415);
  }
  // Read with a hard limit, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return userError("Pedido vacío.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  let body: OrderRequest;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 64 * 1024) {
        await reader.cancel();
        return userError("El pedido es demasiado grande.", 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!isOrderRequest(parsed))
      return userError("Datos del pedido inválidos.");
    body = parsed;
  } catch {
    return userError("Datos del pedido inválidos.");
  }
  const name = body.customer?.name?.trim();
  const phone = body.customer?.phone?.trim();
  const address = body.customer?.address?.trim();
  const paymentMethod = body.paymentMethod?.trim();
  const deliveryMethod = body.deliveryMethod;
  const groups = body.groups ?? [];

  if (
    !name ||
    !phone ||
    !paymentMethod ||
    !["pickup", "own_delivery", "store_delivery"].includes(deliveryMethod) ||
    (deliveryMethod === "store_delivery" && !address) ||
    !groups.length
  ) {
    return userError("Completa tus datos de entrega para continuar.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Vercel overwrites this header. Outside Vercel use a single conservative bucket
  // unless the hosting proxy supplies an authenticated, non-spoofable client IP.
  const clientIp =
    process.env.VERCEL === "1"
      ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown"
      : "local";
  const clientKey = createHmac("sha256", serviceRoleKey)
    .update(clientIp)
    .digest("hex");
  const { data: allowed, error: limitError } = await supabase.rpc(
    "consume_checkout_rate_limit",
    { p_client_key: clientKey },
  );
  if (limitError) return friendlyServerError();
  if (!allowed)
    return NextResponse.json(
      {
        error:
          "Demasiados intentos. Espera unos minutos antes de volver a intentar.",
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": "300",
          "X-Content-Type-Options": "nosniff",
          "X-Frame-Options": "DENY",
          "Referrer-Policy": "strict-origin-when-cross-origin",
          "Content-Security-Policy": "frame-ancestors 'none'",
        },
      },
    );

  // Canonical payload ignores client-supplied prices, descriptions and images.
  // One transaction covers every store, fees, inventory and retry deduplication.
  const payload = {
    customer: {
      name,
      phone,
      address: address || "",
      reference: body.customer.reference?.trim() ?? "",
    },
    paymentMethod,
    deliveryMethod,
    groups: [...groups]
      .sort((a, b) => a.storeId.localeCompare(b.storeId))
      .map((group) => ({
        storeId: group.storeId,
        deliveryOptionId: group.deliveryOptionId ?? null,
        items: [...group.items]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((item) => ({ id: item.id, quantity: item.quantity })),
      })),
  };
  const { data: createdOrders, error: orderError } = await supabase.rpc(
    "create_checkout",
    {
      p_request_id: requestId,
      p_payload: payload,
    },
  );
  if (orderError) {
    // Never expose raw SQL, internal codes, or database messages to customers.
    console.error("Checkout processing failed");
    return friendlyServerError();
  }
  if (!Array.isArray(createdOrders) || createdOrders.length !== groups.length)
    return friendlyServerError();
  const orderIds = createdOrders
    .map((order: { id?: unknown }) => order.id)
    .filter((id): id is string => typeof id === "string" && uuid.test(id));
  if (orderIds.length && supabase.functions?.invoke) {
    const { error: notifyError } = await supabase.functions.invoke(
      "send-order-notification",
      { body: { orderIds } },
    );
    if (notifyError)
      console.error("Notification delivery failed");
  }
  return NextResponse.json(
    {
      orderIds,
      message: "Tu pedido ya está listo para enviarse por WhatsApp.",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Content-Security-Policy": "frame-ancestors 'none'",
      },
    },
  );
}
