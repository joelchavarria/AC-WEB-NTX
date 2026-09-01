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
  groups: Array<{
    storeId: string;
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

type ExistingOrder = {
  id: string;
  store_id: string;
  customer_phone: string;
  delivery_address: string;
  payment_method: string;
  status: string;
  created_at: string;
  order_items: Array<{
    product_id: string;
    quantity: number;
    unit_price: number;
  }> | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function userError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function friendlyServerError() {
  return userError("No pudimos preparar tu pedido en este momento. Intenta nuevamente en unos minutos.", 500);
}

function isMissingDeliveryReference(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  return error.code === "PGRST204" && error.message?.includes("delivery_reference");
}

export async function POST(request: Request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return friendlyServerError();
  }

  const body = await request.json() as OrderRequest;
  const name = body.customer?.name?.trim();
  const phone = body.customer?.phone?.trim();
  const address = body.customer?.address?.trim();
  const paymentMethod = body.paymentMethod?.trim();
  const groups = body.groups ?? [];

  if (!name || !phone || !address || !paymentMethod || !groups.length) {
    return userError("Completa tus datos de entrega para continuar.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const createdOrders: Array<{ id: string; storeId: string }> = [];

  for (const group of groups) {
    if (!group.storeId || !group.items?.length) {
      return userError("Tu carrito cambió. Revísalo y vuelve a intentar.");
    }

    const subtotal = group.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    const recentWindow = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentOrders, error: recentOrdersError } = await supabase
      .from("orders")
      .select("id, store_id, customer_phone, delivery_address, payment_method, status, created_at, order_items(product_id, quantity, unit_price)")
      .eq("store_id", group.storeId)
      .eq("customer_phone", phone)
      .eq("delivery_address", address)
      .eq("payment_method", paymentMethod)
      .gte("created_at", recentWindow)
      .order("created_at", { ascending: false })
      .limit(5);

    if (recentOrdersError) {
      return friendlyServerError();
    }

    const normalizedItems = [...group.items]
      .map((item) => `${item.id}:${Number(item.quantity)}:${Number(item.price)}`)
      .sort()
      .join("|");
    const duplicateOrder = (recentOrders as ExistingOrder[] | null)?.find((order) => {
      const existingItems = [...(order.order_items ?? [])]
        .map((item) => `${item.product_id}:${Number(item.quantity)}:${Number(item.unit_price)}`)
        .sort()
        .join("|");

      return existingItems === normalizedItems;
    });

    if (duplicateOrder) {
      createdOrders.push({ id: duplicateOrder.id, storeId: group.storeId });
      continue;
    }

    const orderPayload: Record<string, string | number | null> = {
      store_id: group.storeId,
      customer_name: name,
      customer_phone: phone,
      delivery_address: address,
      payment_method: paymentMethod,
      subtotal,
      total: subtotal,
      status: "nuevo",
    };

    if (body.customer.reference?.trim()) {
      orderPayload.delivery_reference = body.customer.reference.trim();
    }

    let { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(orderPayload)
      .select("id")
      .single();

    // Some deployed databases still use the original orders schema. A delivery
    // reference is useful context, but it must not prevent the order from being
    // prepared; it remains included in the WhatsApp message sent by the client.
    if (isMissingDeliveryReference(orderError)) {
      delete orderPayload.delivery_reference;
      const retry = await supabase
        .from("orders")
        .insert(orderPayload)
        .select("id")
        .single();
      order = retry.data;
      orderError = retry.error;
    }

    if (orderError || !order) {
      return friendlyServerError();
    }

    const itemsPayload = group.items.map((item) => ({
      order_id: order.id,
      product_id: item.id,
      product_name: item.name,
      unit_price: Number(item.price),
      quantity: Number(item.quantity),
      line_total: Number(item.price) * Number(item.quantity),
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(itemsPayload);

    if (itemsError) {
      await supabase.from("orders").delete().eq("id", order.id);
      return friendlyServerError();
    }

    const { error: historyError } = await supabase.from("order_status_history").insert({
      order_id: order.id,
      status: "nuevo",
      notes: "Pedido creado desde checkout web.",
    });

    if (historyError) {
      return friendlyServerError();
    }

    createdOrders.push({ id: order.id, storeId: group.storeId });
  }

  return NextResponse.json({ orders: createdOrders, message: "Tu pedido ya está listo para enviarse por WhatsApp." });
}
