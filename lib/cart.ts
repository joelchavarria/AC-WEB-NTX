import type { Product } from "@/lib/supabase";

export type CartItem = Product & {
  storeId: string;
  storeName: string;
  storeSlug?: string;
  quantity: number;
};

const CART_KEY = "ca-web-cart";
const CART_UPDATED_EVENT = "ca-web-cart-updated";

export function readCart() {
  if (typeof window === "undefined") {
    return [] as CartItem[];
  }

  const value = window.localStorage.getItem(CART_KEY);
  return value ? (JSON.parse(value) as CartItem[]) : [];
}

export function writeCart(items: CartItem[]) {
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function addToCart(item: CartItem) {
  const cart = readCart();
  const existing = cart.find((entry) => entry.id === item.id && entry.storeId === item.storeId);

  if (existing) {
    existing.quantity += item.quantity;
  } else {
    cart.push(item);
  }

  writeCart(cart);
  return cart;
}

export function clearCart() {
  writeCart([]);
}

export function updateCartQuantity(productId: string, storeId: string, quantity: number) {
  const cart = readCart();
  const next = cart
    .map((item) => item.id === productId && item.storeId === storeId ? { ...item, quantity: Math.max(0, quantity) } : item)
    .filter((item) => item.quantity > 0);
  writeCart(next);
}

export function removeFromCart(productId: string, storeId: string) {
  writeCart(readCart().filter((item) => !(item.id === productId && item.storeId === storeId)));
}

export function subscribeToCart(callback: () => void) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = () => callback();
  window.addEventListener(CART_UPDATED_EVENT, handler);
  window.addEventListener("storage", handler);

  return () => {
    window.removeEventListener(CART_UPDATED_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
