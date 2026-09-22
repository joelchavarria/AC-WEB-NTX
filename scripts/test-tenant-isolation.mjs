// Run against a disposable/staging Supabase project with two real owner accounts.
// Required: TENANT_TEST_ALLOW_WRITES=1 and the fixture IDs listed below.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "TENANT_A_EMAIL",
  "TENANT_A_PASSWORD",
  "TENANT_B_EMAIL",
  "TENANT_B_PASSWORD",
  "TENANT_TEST_STORE_B_ID",
  "TENANT_TEST_PRODUCT_B_ID",
  "TENANT_TEST_ORDER_B_ID",
  "TENANT_TEST_ORDER_ITEM_B_ID",
  "TENANT_TEST_CUSTOMER_B_ID",
  "TENANT_TEST_IMAGE_B_ID",
  "TENANT_TEST_PUSH_TOKEN_B_ID",
];
const missing = required.filter((name) => !process.env[name]);
if (missing.length || process.env.TENANT_TEST_ALLOW_WRITES !== "1") {
  throw new Error(
    [
      "This test needs two real test accounts and a disposable/staging project.",
      `Missing: ${missing.join(", ") || "none"}`,
      "Set TENANT_TEST_ALLOW_WRITES=1 to acknowledge the controlled write checks.",
    ].join("\n"),
  );
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const storeB = process.env.TENANT_TEST_STORE_B_ID;
const productB = process.env.TENANT_TEST_PRODUCT_B_ID;
const orderB = process.env.TENANT_TEST_ORDER_B_ID;
const orderItemB = process.env.TENANT_TEST_ORDER_ITEM_B_ID;
const customerB = process.env.TENANT_TEST_CUSTOMER_B_ID;
const imageB = process.env.TENANT_TEST_IMAGE_B_ID;
const pushTokenB = process.env.TENANT_TEST_PUSH_TOKEN_B_ID;

function client() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signedIn(email, password) {
  const supabase = client();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  assert.ifError(error);
  assert.ok(data.session, `No session for ${email}`);
  return { supabase, session: data.session };
}

async function expectNoRows(label, request) {
  const { data, error } = await request;
  assert.ifError(error);
  assert.equal(data?.length ?? 0, 0, `${label} returned cross-store rows`);
}

async function expectDenied(label, request) {
  const { data, error } = await request;
  assert.ok(error || (data?.length ?? 0) === 0, `${label} was accepted`);
}

const { supabase: ownerA, session: sessionA } = await signedIn(
  process.env.TENANT_A_EMAIL,
  process.env.TENANT_A_PASSWORD,
);
const { supabase: ownerB } = await signedIn(
  process.env.TENANT_B_EMAIL,
  process.env.TENANT_B_PASSWORD,
);

await expectNoRows(
  "products",
  ownerA.from("products").select("id").eq("id", productB),
);
await expectNoRows(
  "product_images",
  ownerA.from("product_images").select("id").eq("id", imageB),
);
await expectNoRows(
  "orders",
  ownerA.from("orders").select("id").eq("id", orderB),
);
await expectNoRows(
  "order_items",
  ownerA.from("order_items").select("id").eq("id", orderItemB),
);
await expectNoRows(
  "customers",
  ownerA.from("customers").select("id").eq("id", customerB),
);
await expectNoRows(
  "push_tokens",
  ownerA.from("push_tokens").select("id").eq("id", pushTokenB),
);

await expectDenied(
  "product update",
  ownerA
    .from("products")
    .update({ name: "cross-store-write-must-fail" })
    .eq("id", productB)
    .select("id"),
);
await expectDenied(
  "order update",
  ownerA
    .from("orders")
    .update({ notes: "cross-store-write-must-fail" })
    .eq("id", orderB)
    .select("id"),
);
await expectDenied(
  "customer update",
  ownerA
    .from("customers")
    .update({ name: "cross-store-write-must-fail" })
    .eq("id", customerB)
    .select("id"),
);
await expectDenied(
  "product image update",
  ownerA
    .from("product_images")
    .update({ image_url: "https://invalid.test/cross-store-write" })
    .eq("id", imageB)
    .select("id"),
);
await expectDenied(
  "push token update",
  ownerA
    .from("push_tokens")
    .update({ device_name: "cross-store-write-must-fail" })
    .eq("id", pushTokenB)
    .select("id"),
);

const { error: quickSaleError } = await ownerA.rpc("register_quick_sale", {
  p_store_id: storeB,
  p_payment_method: "cash",
  p_items: [{ id: productB, quantity: 1 }],
  p_discount_inventory: false,
  p_customer_id: null,
});
assert.ok(quickSaleError, "cross-store quick sale was accepted");

const notificationResponse = await fetch(
  `${url}/functions/v1/send-order-notification`,
  {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${sessionA.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ orderId: orderB }),
  },
);
assert.equal(
  notificationResponse.status,
  403,
  "cross-store notification was not rejected",
);

const realtimeEvents = [];
const channel = ownerA.channel(`tenant-isolation-${crypto.randomUUID()}`).on(
  "postgres_changes",
  {
    event: "*",
    schema: "public",
    table: "orders",
    filter: `store_id=eq.${storeB}`,
  },
  (payload) => realtimeEvents.push(payload),
);
await new Promise((resolve, reject) => {
  const timeout = setTimeout(
    () => reject(new Error("Realtime subscribe timeout")),
    10000,
  );
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      clearTimeout(timeout);
      resolve();
    }
    if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
      clearTimeout(timeout);
      reject(new Error(`Realtime subscription failed: ${status}`));
    }
  });
});

const { data: created, error: createError } = await ownerB.rpc(
  "register_quick_sale",
  {
    p_store_id: storeB,
    p_payment_method: "cash",
    p_items: [{ id: productB, quantity: 1 }],
    p_discount_inventory: false,
    p_customer_id: null,
  },
);
assert.ifError(createError);
const realtimeOrderId = created?.[0]?.id;
assert.ok(realtimeOrderId, "Could not create the realtime fixture order");
await new Promise((resolve) => setTimeout(resolve, 1500));
assert.equal(realtimeEvents.length, 0, "A received B's order over Realtime");
await ownerA.removeChannel(channel);
await ownerB.from("orders").delete().eq("id", realtimeOrderId);

console.log(
  "PASS: owner isolation, cross-store writes, privileged function authorization, and Realtime filtering",
);
