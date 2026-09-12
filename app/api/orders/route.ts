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
  order_number: number;
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
  return userError(
    "No pudimos preparar tu pedido en este momento. Intenta nuevamente en unos minutos.",
    500,
  );
}

export async function POST(request: Request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return friendlyServerError();
  }

  const body = (await request.json()) as OrderRequest;
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

  const createdOrders: Array<{
    id: string;
    orderNumber: number;
    storeId: string;
  }> = [];

  for (const group of groups) {
    if (!group.storeId || !group.items?.length) {
      return userError("Tu carrito cambió. Revísalo y vuelve a intentar.");
    }

    const recentWindow = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recentOrders, error: recentOrdersError } = await supabase
      .from("orders")
      .select(
        "id, order_number, store_id, customer_phone, delivery_address, payment_method, status, created_at, order_items(product_id, quantity, unit_price)",
      )
      .eq("store_id", group.storeId)
      .eq("customer_phone", phone)
      .eq("delivery_address", address || "")
      .eq("payment_method", paymentMethod)
      .gte("created_at", recentWindow)
      .order("created_at", { ascending: false })
      .limit(5);

    if (recentOrdersError) {
      return friendlyServerError();
    }

    const normalizedItems = [...group.items]
      .map(
        (item) => `${item.id}:${Number(item.quantity)}:${Number(item.price)}`,
      )
      .sort()
      .join("|");
    const duplicateOrder = (recentOrders as ExistingOrder[] | null)?.find(
      (order) => {
        const existingItems = [...(order.order_items ?? [])]
          .map(
            (item) =>
              `${item.product_id}:${Number(item.quantity)}:${Number(item.unit_price)}`,
          )
          .sort()
          .join("|");

        return existingItems === normalizedItems;
      },
    );

    if (duplicateOrder) {
      createdOrders.push({
        id: duplicateOrder.id,
        orderNumber: duplicateOrder.order_number,
        storeId: group.storeId,
      });
      continue;
    }

    const { data: created, error: orderError } = await supabase.rpc(
      "create_store_order_with_inventory",
      {
        p_store_id: group.storeId,
        p_customer_name: name,
        p_customer_phone: phone,
        p_delivery_address: address || "",
        p_delivery_reference: body.customer.reference?.trim() ?? "",
        p_payment_method: paymentMethod,
        p_items: group.items.map((item) => ({
          id: item.id,
          quantity: Number(item.quantity),
        })),
      },
    );

    if (orderError) {
      const inventoryMessage = [
        "existencias",
        "producto",
        "tienda",
        "carrito",
      ].some((word) => orderError.message.toLowerCase().includes(word));
      return inventoryMessage
        ? userError(orderError.message)
        : friendlyServerError();
    }

    const order = created?.[0] as
      { id: string; order_number: number } | undefined;
    if (!order) return friendlyServerError();
    const { data: store } = await supabase
      .from("stores")
      .select("store_json")
      .eq("id", group.storeId)
      .single();
    const configuredFee =
      Number(store?.store_json?.profile_settings?.managuaFee) || 0;
    const shippingFee = deliveryMethod === "store_delivery" ? configuredFee : 0;
    const { data: savedOrder, error: deliveryError } = await supabase
      .from("orders")
      .select("subtotal")
      .eq("id", order.id)
      .single();
    if (deliveryError || !savedOrder) return friendlyServerError();
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        delivery_method: deliveryMethod,
        shipping_fee: shippingFee,
        total: Number(savedOrder.subtotal) + shippingFee,
      })
      .eq("id", order.id);
    if (updateError) return friendlyServerError();
    createdOrders.push({
      id: order.id,
      orderNumber: order.order_number,
      storeId: group.storeId,
    });
  }

  return NextResponse.json({
    orders: createdOrders,
    message: "Tu pedido ya está listo para enviarse por WhatsApp.",
  });
}
