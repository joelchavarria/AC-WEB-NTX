import type { Product } from "@/lib/supabase";

export type CartItem = Product & {
  storeId: string;
  storeName: string;
  storeSlug?: string;
  quantity: number;
};

const CART_KEY = "ca-web-cart";
const CART_UPDATED_EVENT = "ca-web-cart-updated";
const EXCLUSIVE_STORE_KEY = "ca-web-exclusive-store";

export type ExclusiveStoreContext = {
  storeId: string;
  storeName: string;
  storeSlug: string;
};

export function readExclusiveStoreContext() {
  if (typeof window === "undefined") {
    return null as ExclusiveStoreContext | null;
  }

  const value = window.localStorage.getItem(EXCLUSIVE_STORE_KEY);

  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as ExclusiveStoreContext;
  } catch {
    window.localStorage.removeItem(EXCLUSIVE_STORE_KEY);
    return null;
  }
}

export function writeExclusiveStoreContext(context: ExclusiveStoreContext) {
  window.localStorage.setItem(EXCLUSIVE_STORE_KEY, JSON.stringify(context));
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function clearExclusiveStoreContext() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(EXCLUSIVE_STORE_KEY);
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}
const CART_VERSION = 2;
const CART_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type StoredCart = {
  version: number;
  updatedAt: number;
  items: CartItem[];
};

function maxQuantity(item: CartItem) {
  return item.fulfillment_mode === "inmediato" ? Math.max(0, item.stock) : 99;
}

export function readCart() {
  if (typeof window === "undefined") {
    return [] as CartItem[];
  }

  const value = window.localStorage.getItem(CART_KEY);
  if (!value) return [];

  try {
    const saved = JSON.parse(value) as StoredCart | CartItem[];
    if (Array.isArray(saved) || saved.version !== CART_VERSION || Date.now() - saved.updatedAt > CART_MAX_AGE_MS) {
      window.localStorage.removeItem(CART_KEY);
      return [];
    }
    return saved.items.filter((item) => item?.id && item?.storeId && item.quantity > 0);
  } catch {
    window.localStorage.removeItem(CART_KEY);
    return [];
  }
}

export function writeCart(items: CartItem[]) {
  if (items.length) {
    const saved: StoredCart = { version: CART_VERSION, updatedAt: Date.now(), items };
    window.localStorage.setItem(CART_KEY, JSON.stringify(saved));
  } else {
    window.localStorage.removeItem(CART_KEY);
  }
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}

export function addToCart(item: CartItem) {
  const exclusiveStore = readExclusiveStoreContext();
  const cart = exclusiveStore && exclusiveStore.storeId !== item.storeId ? [] : readCart();
  const existing = cart.find((entry) => entry.id === item.id && entry.storeId === item.storeId);

  if (existing) {
    existing.quantity = Math.min(existing.quantity + item.quantity, maxQuantity(item));
  } else {
    const quantity = Math.min(item.quantity, maxQuantity(item));
    if (quantity > 0) cart.push({ ...item, quantity });
  }

  writeCart(cart);
  return cart;
}

export function clearCart() {
  writeCart([]);
}

export function removeStoreFromCart(storeId: string) {
  writeCart(readCart().filter((item) => item.storeId !== storeId));
}

export function updateCartQuantity(productId: string, storeId: string, quantity: number) {
  const cart = readCart();
  const next = cart.reduce<CartItem[]>((result, item) => {
    const updated = item.id === productId && item.storeId === storeId
      ? { ...item, quantity: Math.min(Math.max(0, quantity), maxQuantity(item)) }
      : item;
    if (updated.quantity > 0) result.push(updated);
    return result;
  }, []);
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
