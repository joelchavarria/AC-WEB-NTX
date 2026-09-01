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

export async function POST(request: Request) {
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Missing Supabase server credentials." }, { status: 500 });
  }

  const body = await request.json() as OrderRequest;
  const name = body.customer?.name?.trim();
  const phone = body.customer?.phone?.trim();
  const address = body.customer?.address?.trim();
  const paymentMethod = body.paymentMethod?.trim();
  const groups = body.groups ?? [];

  if (!name || !phone || !address || !paymentMethod || !groups.length) {
    return NextResponse.json({ error: "Missing required order data." }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const createdOrders: Array<{ id: string; storeId: string }> = [];

  for (const group of groups) {
    if (!group.storeId || !group.items?.length) {
      return NextResponse.json({ error: "Invalid order group." }, { status: 400 });
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
      return NextResponse.json({ error: recentOrdersError.message }, { status: 500 });
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

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert(orderPayload)
      .select("id")
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: orderError?.message ?? "Failed to create order." }, { status: 500 });
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
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    await supabase.from("order_status_history").insert({
      order_id: order.id,
      status: "nuevo",
      notes: "Pedido creado desde checkout web.",
    });

    createdOrders.push({ id: order.id, storeId: group.storeId });
  }

  return NextResponse.json({ orders: createdOrders });
}
