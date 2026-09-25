import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type OrderRequest = {
  website?: string;
  turnstileToken?: string;
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
      variantOptions?: Record<string, string>;
    }>;
  }>;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function userError(
  message: string,
  status = 400,
  reportable = false,
  code?: string,
) {
  return NextResponse.json(
    { error: message, reportable, ...(code ? { code } : {}) },
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
    true,
    "CHECKOUT_INTERNAL_ERROR",
  );
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deviceIdPattern = /^[a-zA-Z0-9._:-]{8,128}$/;
function isOrderRequest(value: unknown): value is OrderRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as OrderRequest;
  const text = (v: unknown, max: number) =>
    typeof v === "string" && v.length <= max;
  const validVariantOptions = (value: unknown) =>
    value === undefined ||
    (value !== null && typeof value === "object" && !Array.isArray(value) &&
      Object.entries(value).length <= 12 &&
      Object.entries(value).every(
        ([key, option]) => text(key, 80) && text(option, 120),
      ));
  if (
    (body.website !== undefined && !text(body.website, 200)) ||
    (body.turnstileToken !== undefined && !text(body.turnstileToken, 4096)) ||
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
        item.price < 0 ||
        !validVariantOptions(item.variantOptions)
      )
        return false;
      products.add(item.id);
      return true;
    });
  });
}

function clientIpFor(request: Request) {
  return process.env.VERCEL === "1"
    ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown"
    : "local";
}

function deviceIdFor(request: Request) {
  const value = request.headers.get("x-device-id")?.trim() || "missing";
  return deviceIdPattern.test(value) ? value : "invalid";
}

function hashKey(secret: string, scope: string, value: string) {
  return createHmac("sha256", secret).update(`${scope}:${value}`).digest("hex");
}

async function verifyTurnstile(token: string | undefined, secret: string) {
  if (!token) return false;
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(3000),
      },
    );
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

async function recordCheckoutAbuse(
  supabase: any,
  eventType: "rate_limited" | "honeypot" | "bot_verification_failed",
  clientKey: string,
  storeCount: number,
) {
  console.warn("checkout_abuse", { eventType, storeCount });
  const { error } = await supabase.rpc("record_checkout_security_event", {
    p_event_type: eventType,
    p_client_key: clientKey,
    p_store_count: storeCount,
  });
  if (error) console.error("Could not record checkout abuse event");

  const webhook = process.env.CHECKOUT_ABUSE_WEBHOOK_URL?.trim();
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventType,
        storeCount,
        occurredAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(2500),
    });
  } catch {
    console.error("Could not deliver checkout abuse alert");
  }
}

export async function POST(request: Request) {
  if (!supabaseUrl || !serviceRoleKey || !supabaseUrl.startsWith("https://")) {
    return friendlyServerError();
  }

  const requestId = request.headers.get("idempotency-key");
  if (!requestId || !uuid.test(requestId))
    return userError("Identificador de compra inválido.", 400, false, "CHECKOUT_INVALID_REQUEST_ID");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return userError("Origen no permitido.", 403, false, "CHECKOUT_ORIGIN_REJECTED");
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return userError("Origen no permitido.", 403, false, "CHECKOUT_ORIGIN_REJECTED");
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .includes("application/json")
  ) {
    return userError("Envía un pedido en formato JSON.", 415, false, "CHECKOUT_INVALID_CONTENT_TYPE");
  }
  // Read with a hard limit, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return userError("Pedido vacío.", 400, false, "CHECKOUT_EMPTY_REQUEST");
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
        return userError("El pedido es demasiado grande.", 413, false, "CHECKOUT_REQUEST_TOO_LARGE");
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
      return userError("Datos del pedido inválidos.", 400, false, "CHECKOUT_INVALID_REQUEST");
    body = parsed;
  } catch {
    return userError("Datos del pedido inválidos.", 400, false, "CHECKOUT_INVALID_REQUEST");
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
    return userError("Completa tus datos de entrega para continuar.", 400, false, "CHECKOUT_MISSING_CUSTOMER_DATA");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const clientIp = clientIpFor(request);
  const deviceId = deviceIdFor(request);
  const abuseClientKey = hashKey(
    serviceRoleKey,
    "abuse",
    `${clientIp}|${deviceId}`,
  );
  const storeIds = [...new Set(groups.map((group) => group.storeId))];

  if (body.website?.trim()) {
    await recordCheckoutAbuse(
      supabase,
      "honeypot",
      abuseClientKey,
      storeIds.length,
    );
    return userError("No se pudo validar el pedido.", 403, false, "CHECKOUT_BOT_DETECTED");
  }

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (
    turnstileSecret &&
    !(await verifyTurnstile(body.turnstileToken?.trim(), turnstileSecret))
  ) {
    await recordCheckoutAbuse(
      supabase,
      "bot_verification_failed",
      abuseClientKey,
      storeIds.length,
    );
    return userError("No se pudo validar el pedido.", 403, false, "CHECKOUT_BOT_VERIFICATION_FAILED");
  }

  const rateKeys = [
    hashKey(serviceRoleKey, "ip", clientIp),
    hashKey(serviceRoleKey, "device", deviceId),
    ...storeIds.map((storeId) => hashKey(serviceRoleKey, "store", storeId)),
  ];
  const { data: allowed, error: limitError } = await supabase.rpc(
    "consume_checkout_rate_limits",
    { p_client_keys: rateKeys },
  );
  if (limitError) return friendlyServerError();
  if (!allowed)
    await recordCheckoutAbuse(
      supabase,
      "rate_limited",
      abuseClientKey,
      storeIds.length,
    );
  if (!allowed)
    return userError(
      "Demasiados intentos. Espera unos minutos antes de volver a intentar.",
      429,
      false,
      "CHECKOUT_RATE_LIMITED",
    );

  // Canonical payload ignores client-supplied prices, descriptions and images,
  // but carries every selected product variation so the order retains the
  // custom fields configured by the store.
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
          .map((item) => ({
            id: item.id,
            quantity: item.quantity,
            variant_options: item.variantOptions ?? {},
          })),
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
    // Expected checkout conflicts are user-correctable and should not become
    // technical error reports or noisy server logs.
    const expectedMessages = new Set([
      "La tienda ya no está disponible.",
      "El carrito está vacío.",
      "El carrito contiene cantidades inválidas.",
      "Uno de los productos ya no está disponible.",
      "No hay suficientes existencias para completar el pedido.",
      "Selecciona opciones válidas para cada producto.",
      "La tienda no ofrece retiro en local.",
      "La tienda no acepta efectivo.",
      "Completa la dirección de entrega.",
      "El método de envío ya no está disponible.",
      "Configuración de envío inválida.",
    ]);
    const isExpected =
      orderError.code === "P4000" ||
      orderError.code === "P4090" ||
      expectedMessages.has(orderError.message);
    if (isExpected) {
      const message = expectedMessages.has(orderError.message)
        ? orderError.message
        : "El pedido cambió mientras lo confirmábamos. Revisa tu carrito e inténtalo nuevamente.";
      const code =
        message === "Selecciona opciones válidas para cada producto."
          ? "CHECKOUT_VARIANT_OPTIONS_INVALID"
          : orderError.code === "P4090"
            ? "CHECKOUT_INVENTORY_CONFLICT"
            : "CHECKOUT_VALIDATION_FAILED";
      return userError(
        message,
        orderError.code === "P4090" ? 409 : 400,
        code === "CHECKOUT_VARIANT_OPTIONS_INVALID",
        code,
      );
    }
    // Never expose raw SQL, internal codes, or database messages to customers.
    console.error("Checkout processing failed", {
      code: orderError.code ?? "unknown",
      requestId,
    });
    return friendlyServerError();
  }
  if (!Array.isArray(createdOrders) || createdOrders.length !== groups.length)
    return friendlyServerError();

  const orders = createdOrders.filter(
    (order: { id?: unknown }) =>
      typeof order.id === "string" && uuid.test(order.id),
  );

  const orderIds = orders.map((o: { id: string }) => o.id);

  if (orderIds.length && supabase.functions?.invoke) {
    const { error: notifyError } = await supabase.functions.invoke(
      "send-order-notification",
      { body: { orderIds } },
    );
    if (notifyError) console.error("Notification delivery failed");
  }
  return NextResponse.json(
    {
      orders,
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
