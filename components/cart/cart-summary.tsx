"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readCart, readExclusiveStoreContext, subscribeToCart, type CartItem, type ExclusiveStoreContext } from "@/lib/cart";

export function CartSummary() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [exclusiveStore, setExclusiveStore] = useState<ExclusiveStoreContext | null>(null);

  useEffect(() => {
    const syncCart = () => {
      setItems(readCart());
      setExclusiveStore(readExclusiveStoreContext());
    };
    syncCart();

    return subscribeToCart(syncCart);
  }, []);

  const count = items
    .filter((item) => exclusiveStore ? item.storeId === exclusiveStore.storeId : true)
    .reduce((total, item) => total + item.quantity, 0);

  return (
    <Link href="/cart" className="button secondary" aria-label={`Carrito${count ? `, ${count} productos` : ""}`}>
      Carrito {count > 0 ? `(${count})` : ""}
    </Link>
  );
}
